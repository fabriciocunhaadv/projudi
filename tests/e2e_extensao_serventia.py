"""Sessão do Projudi em OUTRA serventia que a pedida (outra aba trocou): a verificação não aceita os números e diz por quê.
Teste ponta a ponta: carrega a extensão num Chromium contra um servidor que imita o Projudi
(páginas no formato real, em tests/fixtures; dados fictícios).
Uso: python tests/e2e_extensao.py   (precisa de playwright + chromium)"""
import glob, http.server, json, os, shutil, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
FIX = Path(__file__).parent / "fixtures"
fx = lambda n: (FIX / n).read_text(encoding="utf-8")
MOLDURA = '<html><body data-usuario-id="1"><iframe name="userMainFrame" src="Usuario?PaginaAtual=-10"></iframe></body></html>'
# Pré-análises: a lista só aparece depois de "Consultar" (testa o envio automático do formulário)
FORM_PRE = '<html><body><form method="post" action="PreAnalisarConclusao"><input name="PaginaAtual" value="6"><input name="tipo" value="todas"><input type="submit" name="b" value="Consultar"></form></body></html>'
chamadas = []


class H(http.server.BaseHTTPRequestHandler):
    def _r(s, html):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=ISO-8859-1"); s.end_headers()
        s.wfile.write(html.encode("latin-1", "replace"))

    def do_GET(s):
        chamadas.append("GET " + s.path)
        p = s.path
        if "Usuario?PaginaAtual=9" in p: s._r(fx("lista_serventias.html"))
        elif "PaginaAtual=-10" in p: s._r("<div>Serventia: Outra Vara Qualquer E-mail: x</div>" + fx("inicio.html"))
        elif p.startswith("/processo"): s._r('<html><body><script>var x=1</script><h1>Capa</h1><iframe src="/movs"></iframe></body></html>')
        elif p.startswith("/movs"): s._r('<html><body><table><tr><td><input type="checkbox" name="arq" value="77" checked></td><td>Mov. 1</td></tr><tr><td><input type="checkbox" name="arq" value="78"></td><td>Mov. 2</td></tr></table></body></html>')
        elif "PreAnalisarConclusao?PaginaAtual=2" in p: s._r(fx("nao_analisadas.html"))
        elif "PreAnalisarConclusao?PaginaAtual=6" in p: s._r(FORM_PRE)
        elif "PreAnalisarConclusao?PaginaAtual=7" in p: s._r(fx("pre_multiplas.html"))
        else: s._r(MOLDURA)

    def do_POST(s):
        corpo = s.rfile.read(int(s.headers.get("Content-Length", 0))).decode()
        chamadas.append("POST " + s.path + " " + corpo)
        s._r(fx("pre_analisadas.html"))

    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    for f, a, b in [("background.js", "https://projudi.tjgo.jus.br/", "http://localhost:8765/"),
                    ("manifest.json", "https://*.tjgo.jus.br/*", "http://localhost:8765/*")]:
        (ext / f).write_text((ext / f).read_text().replace(a, b))
    srv = http.server.HTTPServer(("localhost", 8765), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        estado = None
        time.sleep(3)
        assert sw.evaluate("chrome.storage.local.get('estado')").get("estado") is None      # nada roda sozinho ao instalar
        assert sw.evaluate("chrome.storage.sync.get({ filtro: 'x' })")["filtro"] == "x"                  # padrão: nenhum filtro de serventia (vale para todas)
        sw.evaluate("chrome.storage.sync.set({ filtro: 'Montes Claros', filtroPadraoLimpo: true })")                  # neste teste o usuário filtra por "Montes Claros"
        sw.evaluate("verificar()")                                                         # só roda quando o usuário manda
        for _ in range(40):
            estado = sw.evaluate("chrome.storage.local.get('estado')").get("estado")
            if estado and estado["status"] in ("ok", "erro", "deslogado"): break
            time.sleep(1)
        print(*chamadas, sep="\n")
        assert estado["status"] == "ok" and len(estado["serventias"]) == 1, estado   # o filtro "Montes Claros" tira Anápolis
        s = estado["serventias"][0]
        assert "mudou de serventia" in (s.get("erro") or ""), s
        assert not s["linhas"], s
        print("erro mostrado:", s["erro"][:160])
print("OK")
