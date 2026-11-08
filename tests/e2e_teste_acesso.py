"""Teste de acesso pelo navegador: o app (simulado) pede pelo atributo da página (modo teste); a página da extensão abre cada site (simulado), resume (status, tamanho, tempo, amostra, bloqueio, PDF)
e entrega UM resultado por vez ao app; no fim avisa. Site fora da lista é ignorado."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PS, PT = 8795, 8796
OK = ("<html><body><h1>Supremo Tribunal Federal</h1><p>Súmulas vinculantes</p>" + "<p>texto</p>" * 80 + "</body></html>").encode("utf-8")
CF = b"<html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked. Please enable cookies.</body></html>"
STUDIO = b"<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>"
class Studio(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.send_header("Content-Type", "text/html"); s.end_headers(); s.wfile.write(STUDIO)
    def log_message(*a): pass
class Sites(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if "bloqueado" in s.path: s.send_response(403); s.send_header("Content-Type", "text/html"); s.end_headers(); s.wfile.write(CF); return
        if "pdf" in s.path: s.send_response(200); s.send_header("Content-Type", "application/pdf"); s.end_headers(); s.wfile.write(b"%PDF-1.4 " + b"x" * 3000); return
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(OK)
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://127.0.0.1/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://docs.google.com/document/*", "http://localhost/*"))
    c = ext / "leis-core.js"; t = c.read_text()
    import re
    t = re.sub(r'export const HOSTS_TESTE = \[[^\]]*\];', 'export const HOSTS_TESTE = ["127.0.0.1"];', t).replace('export const PROTOCOLO_TESTE = "https:";', 'export const PROTOCOLO_TESTE = "http:";')      # só no teste: sites simulados em http local
    c.write_text(t)
    for porta, h in ((PS, Studio), (PT, Sites)): threading.Thread(target=http.server.HTTPServer(("127.0.0.1", porta), h).serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        if not ctx.service_workers: ctx.wait_for_event("serviceworker")
        app = ctx.new_page(); app.goto(f"http://127.0.0.1:{PS}/"); app.wait_for_timeout(1500)
        app.evaluate("""() => { window.__res = []; window.__fim = null;
          window.addEventListener('projudi:teste-entrega', () => { const el = document.documentElement; window.__res.push(JSON.parse(el.dataset.projudiTesteEntrega).resultado); delete el.dataset.projudiTesteEntrega; });
          window.addEventListener('projudi:leis-fim', () => { window.__fim = JSON.parse(document.documentElement.dataset.projudiLeisFim); }); }""")
        base = f"http://127.0.0.1:{PT}"
        sites = [{"id": "stf", "nome": "STF", "url": base + "/ok"}, {"id": "tjgo", "nome": "TJGO", "url": base + "/bloqueado"}, {"id": "stj", "nome": "STJ PDF", "url": base + "/sumulas.pdf"}, {"id": "ruim", "nome": "Fora da lista", "url": "http://evil.example.com/x"}]
        with ctx.expect_page() as nova:
            app.evaluate("(sites) => { document.documentElement.dataset.projudiLeisPedido = JSON.stringify({ pedidoId: 't1', modo: 'teste', leis: sites }); window.dispatchEvent(new Event('projudi:leis-pedido')); }", sites)
        pg = nova.value; pg.wait_for_load_state(); pg.wait_for_selector("#permissao:not(:empty)", timeout=10000)
        assert "3 site(s)" in pg.inner_text("#permissao") and "Testar o acesso" in pg.inner_text("h1"), pg.inner_text("#permissao")
        pg.click("#iniciar"); app.wait_for_function("window.__fim", timeout=40000)
        res = {r["id"]: r for r in app.evaluate("window.__res")}; fim = app.evaluate("window.__fim"); print({k: (v["status"], v.get("bytes"), bool(v.get("bloqueio"))) for k, v in res.items()}, fim)
        assert set(res) == {"stf", "tjgo", "stj"}, "o site fora da lista é ignorado"
        assert res["stf"]["status"] == 200 and not res["stf"].get("bloqueio") and "Supremo Tribunal Federal" in res["stf"]["amostra"] and res["stf"]["ms"] >= 0
        assert res["tjgo"]["status"] == 403 and res["tjgo"]["bloqueio"], "403 com aviso do Cloudflare = bloqueio"
        assert res["stj"]["amostra"] == "(arquivo PDF)" and res["stj"]["bytes"] > 3000
        assert fim["modo"] == "teste" and fim["feitas"] == 2 and fim["falhas"] == 1, fim
        ctx.close()
    print("OK")
main()
