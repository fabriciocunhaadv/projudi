"""Busca das leis do Planalto pelo navegador: o app (simulado) pede pelo atributo da página; o script da extensão repassa; a página leis.html busca (Planalto simulado, windows-1252),
reconhece a página de bloqueio, e entrega UMA lei por vez ao app pelo atributo; no fim avisa quantas deram certo. Endereço fora do Planalto é ignorado."""
import base64, glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PS, PL = 8793, 8794
LEI = ("<html><head><meta charset='windows-1252'><title>Lei</title></head><body>" + "Art. 1º Fica proibida a ação — ç. " * 60 + "</body></html>").encode("cp1252")
NEGADO = ("<html><body>Acesso Negado. Bloqueio: bloqueio.de.aplicacoes@presidencia.gov.br " + "." * 900 + "</body></html>").encode("cp1252")
STUDIO = b"<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>"

class Studio(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.send_header("Content-Type", "text/html"); s.end_headers(); s.wfile.write(STUDIO)
    def log_message(*a): pass
class Planalto(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        corpo = NEGADO if "negada" in s.path else LEI
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=windows-1252"); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://127.0.0.1/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://docs.google.com/document/*", "http://localhost/*"))
    c = ext / "leis-core.js"; c.write_text(c.read_text().replace('"https://www.planalto.gov.br/ccivil_03/"', f'"http://127.0.0.1:{PL}/ccivil_03/"').replace('["https://www.planalto.gov.br/*", "https://planalto.gov.br/*"]', '["http://127.0.0.1/*"]').replace('x.protocol === "https:"', 'true'))      # só no teste: o Planalto simulado é http
    for porta, h in ((PS, Studio), (PL, Planalto)): threading.Thread(target=http.server.HTTPServer(("127.0.0.1", porta), h).serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        if not ctx.service_workers: ctx.wait_for_event("serviceworker")
        app = ctx.new_page(); app.goto(f"http://127.0.0.1:{PS}/"); app.wait_for_timeout(1500)
        app.evaluate("""() => { window.__ent = []; window.__fim = null;
          window.addEventListener('projudi:lei-entrega', () => { const el = document.documentElement; window.__ent.push(JSON.parse(el.dataset.projudiLeiEntrega)); delete el.dataset.projudiLeiEntrega; });
          window.addEventListener('projudi:leis-fim', () => { window.__fim = JSON.parse(document.documentElement.dataset.projudiLeisFim); }); }""")
        leis = [{"id": "cpc", "nome": "CPC", "url": f"http://127.0.0.1:{PL}/ccivil_03/l13105.htm"}, {"id": "cc", "nome": "Código Civil", "url": f"http://127.0.0.1:{PL}/ccivil_03/l10406.htm"},
                {"id": "neg", "nome": "Lei bloqueada", "url": f"http://127.0.0.1:{PL}/ccivil_03/negada.htm"}, {"id": "ruim", "nome": "Fora do Planalto", "url": "http://evil.example.com/ccivil_03/x.htm"}]
        with ctx.expect_page() as nova:
            app.evaluate("(leis) => { document.documentElement.dataset.projudiLeisPedido = JSON.stringify({ pedidoId: 'p1', leis }); window.dispatchEvent(new Event('projudi:leis-pedido')); }", leis)
        pg = nova.value; pg.wait_for_load_state(); pg.wait_for_selector("#permissao:not(:empty)", timeout=10000); print("aba aberta:", pg.url.split("/")[-1], "|", pg.inner_text("#permissao"))
        assert pg.url.endswith("leis.html") and "3 lei(s)" in pg.inner_text("#permissao"), "a lei fora do Planalto deve ser ignorada"
        pg.click("#iniciar"); app.wait_for_function("window.__fim", timeout=30000)
        ent = app.evaluate("window.__ent"); fim = app.evaluate("window.__fim"); print("entregas:", [(e["id"], e["nome"], len(e["b64"])) for e in ent], "fim:", fim)
        assert [e["id"] for e in ent] == ["cpc", "cc"], "só as leis boas são entregues, na ordem"
        assert base64.b64decode(ent[0]["b64"]) == LEI, "os bytes originais (windows-1252) chegam intactos"
        assert ent[0]["nome"] == "l13105.htm" and fim["feitas"] == 2 and fim["falhas"] == 1 and fim["bloqueios"] == 1, fim
        txt = pg.inner_text("#lista"); print(txt.replace("\n", " | "))
        assert "bloqueou" in txt and txt.count("✔") == 2
        ctx.close()
    print("OK")
main()
