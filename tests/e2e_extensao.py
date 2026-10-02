"""Teste ponta a ponta: carrega a extensão num Chromium contra um servidor que imita o Projudi
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
        elif "PaginaAtual=-10" in p: s._r(fx("inicio.html"))
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
        for _ in range(40):
            estado = sw.evaluate("chrome.storage.local.get('estado')").get("estado")
            if estado and estado["status"] in ("ok", "erro", "deslogado"): break
            time.sleep(1)
        print(*chamadas, sep="\n")
        assert estado["status"] == "ok" and len(estado["serventias"]) == 1, estado   # filtro "Montes Claros" tira Anápolis
        s = estado["serventias"][0]
        assert not s["erro"] and [(l["naoAnalisadas"], l["preAnalisadas"]) for l in s["linhas"]] == [(6, 1), (0, 2)]
        na, pre = s["processos"]["naoAnalisadas"], s["processos"]["preAnalisadas"]
        assert len(na) == 6 and len(pre) == 3          # a lista bate com a contagem da tela inicial (2 Simples + 1 Múltipla)
        assert [p["origem"] for p in pre] == ["simples", "simples", "multipla"] and pre[2]["classificador"] == "Gicrana - lote"
        assert not s["avisos"], s["avisos"]
        assert na[0]["dataInicio"] == "02/10/2026 14:31:23" and na[0]["urgencia"] == 1
        assert [p["classificador"] for p in na][:3] == ["", "Fulano - minutando", "Fulano - minutando"]
        assert pre[1]["urgenciaTexto"] == "Réu Preso" and pre[0]["classificador"] == "Conclusos- Comunicação de Cessão de créditos"
        dbg = sw.evaluate("chrome.storage.local.get('debug')")["debug"]
        assert {"amostra inicio", "amostra naoAnalisadas", "amostra preAnalisadas"} <= set(dbg), list(dbg)

        ext_id = sw.url.split("/")[2]
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/popup.html"); pg.wait_for_timeout(500)
        txt = pg.inner_text("body"); print(txt[:700])
        assert "Fulano - minutando" in txt and "1000002-22.2026.8.09.0166" in txt and "Gicrana - lote" in txt

        pn = ctx.new_page(); pn.goto(f"chrome-extension://{ext_id}/painel.html"); pn.wait_for_timeout(500)
        pn.select_option("#visao", "fila"); pn.wait_for_timeout(300)
        fila = pn.inner_text("body"); print(fila[:1800])
        # ordem de trabalho: urgência do processo > prioridade do classificador > mais antigo
        ordem = [fila.index(n) for n in ["2000002.90", "1000001-11", "1000002-22", "1000003-33", "1000004-44", "2000001.80", "1000006-66", "1000005-55"]]
        assert ordem == sorted(ordem), ordem
        assert "02/10/2026 14:31:23" in fila and "Maior de 80 Anos" in fila and "Réu Preso" in fila
        pn.select_option("#modo", "data"); pn.wait_for_timeout(300)
        fila = pn.inner_text("body")
        ordem = [fila.index(n) for n in ["2000002.90", "2000001.80", "1000006-66", "1000003-33", "1000004-44", "1000002-22", "1000005-55", "1000001-11"]]
        assert ordem == sorted(ordem), ordem   # só a data: 29/09, 30/09, 01/10 13:28/14:51/15:03/16:58, 02/10 13:33/14:31
        pn.select_option("#visao", "classificador"); pn.select_option("#modo", "trabalho"); pn.wait_for_timeout(300)
        pn.click("#abrir"); pn.fill("#busca", "beltrana"); pn.wait_for_timeout(300)
        det = pn.inner_text("body")
        assert "2000002.90" in det and "1000006-66" in det and "1000003-33" not in det.split("Processos")[-1]
        hrefs = pn.eval_on_selector_all("a[href*='Id_Processo']", "els => els.map(e => e.href)")
        assert hrefs and all(h.startswith("https://projudi.tjgo.jus.br/BuscaProcesso?Id_Processo=") for h in hrefs), hrefs

        # captura da aba (com iframes) e atalho
        proc = ctx.new_page(); proc.goto("http://localhost:8765/processo"); proc.wait_for_timeout(800)
        tab_id = sw.evaluate("chrome.tabs.query({url: 'http://localhost:8765/processo*'}).then(t => t[0].id)")
        frames = sw.evaluate(f"capturarAba({tab_id})")
        assert len(frames) == 2 and "<script" not in frames[0]["html"]
        movs = [f for f in frames if "/movs" in f["url"]][0]["html"]
        assert "checked" in movs.split('value="77"')[1].split(">")[0] and "checked" not in movs.split('value="78"')[1].split(">")[0]
        sw.evaluate(f"capturarEAbrir({tab_id})"); proc.wait_for_timeout(1500)
        cap = [q for q in ctx.pages if q.url.endswith("captura.html")][0]; cap.wait_for_timeout(500)
        assert 'value="77"' in cap.input_value("#txt") and "FRAME 1" in cap.input_value("#txt")
        ctx.close()
    print("OK")


if __name__ == "__main__":
    main()
