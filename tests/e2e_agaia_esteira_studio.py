"""Minuta do Studio → esteira no modo Agaia: o app pede (postMessage) e a extensão coloca o processo na fila (aba escondida que fecha sozinha); repetido não duplica; número sem ano é recusado.
Rodar: /usr/bin/python3 tests/e2e_agaia_esteira_studio.py"""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"

SERVIDOS = []      # endereços que o "Agaia falso" recebeu
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path.startswith("/agaia/"):
            SERVIDOS.append(s.path); s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
            s.wfile.write("<html><body><form id='form_execucao_moderno'><select><option value=''>-- Selecione um prompt --</option><option value='1'>Fabrício Execução Fiscal</option><option value='2'>Outros Área Judicial - Criminal</option></select></form></body></html>".encode()); return
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(b"<html><head><title>Assessor Judicial</title></head><body>Studio falso</body></html>")
    def log_message(*a): pass

PEDIR = """(extra) => new Promise((ok) => {
  const reqId = 'ae' + Date.now() + Math.random().toString(36).slice(2, 6);
  const f = (ev) => { const d = ev.data; if (ev.source !== window || !d || d.__projudiResp !== 'agaia-esteira' || d.reqId !== reqId || d.tipo !== 'fim') return; window.removeEventListener('message', f); ok(d); };
  window.addEventListener('message', f); window.postMessage({ __projudi: 'agaia-esteira', fase: 'enviar', reqId, ...extra }, location.origin);
  setTimeout(() => ok({ ok: false, erro: "sem resposta em 100 s" }), 100000);
})"""

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://localhost/*").replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*"))
    c = ext / "agaia-cliente.js"; c.write_text(c.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/", "http://localhost:8796/agaia/"))      # o Agaia de verdade não é tocado
    srv = http.server.HTTPServer(("localhost", 8796), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(("http://localhost", "chrome-extension://")) else r.abort())      # sem rede: o Agaia/Projudi de verdade não são tocados
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        pg = ctx.new_page(); pg.goto("http://localhost:8796/"); pg.wait_for_function("document.documentElement.dataset.assessorExtensao", timeout=10000)
        assert "agaia-esteira" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos"), "a extensão anuncia o recurso 'agaia-esteira'"
        abertos = SERVIDOS
        ro = pg.evaluate(PEDIR, {"fase": "opcoes", "processo": "5285460-70.2025.8.09.0166"}); print("opções:", ro)
        assert ro["ok"] and ro["opcoes"] == ["Fabrício Execução Fiscal", "Outros Área Judicial - Criminal"], ro
        assert any("numero_processo=5285460.70.2025" in u and "tipo_processo=judicial" in u and "acao_id=6" in u and "validado=True" in u for u in abertos), "o endereço aberto não é o do Projudi: " + str(abertos)
        assert "agaia-opcoes" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos")
        r0 = pg.evaluate(PEDIR, {"processo": "5285460.70", "prompt": "Outros Área Judicial - Criminal"}); print("sem ano:", r0.get("erro"))
        assert not r0["ok"] and "não tem o ano" in r0["erro"], r0
        r1 = pg.evaluate(PEDIR, {"processo": "5285460-70.2025.8.09.0166", "prompt": "Outros Área Judicial - Criminal"}); print("enviar:", r1)
        assert r1["ok"] and not r1["jaNaFila"], r1
        r2 = pg.evaluate(PEDIR, {"processo": "5285460-70.2025.8.09.0166", "prompt": "Outros Área Judicial - Criminal"}); print("repetido:", r2)
        assert r2["ok"] and r2["jaNaFila"], r2
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        fila = ver.evaluate("import('./esteira-banco.js').then((m) => m.todos())")
        agaia = [i for i in fila if i["modo"] == "agaia"]
        print("na fila:", [(i["processo"], i["prompt"], i["estado"]) for i in agaia])
        assert len(agaia) == 1 and agaia[0]["processo"] == "5285460-70.2025.8.09.0166" and agaia[0]["prompt"] == "Outros Área Judicial - Criminal" and agaia[0].get("origemStudio") is True, agaia
        pg.wait_for_timeout(1500)
        assert not [x for x in ctx.pages if "agaia-esteira-add" in x.url], "a aba escondida de envio fecha sozinha"
        ctx.close()
    print("TUDO OK")

main()
