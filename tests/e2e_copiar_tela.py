"""Botão 'Copiar tela': no quadro copia o HTML do quadro; na moldura copia a janela de pesquisa só quando a lista está aberta."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
MOLDURA = """<html><body><div id="busca_padrao" style="display:none"><table id="tabelaLocalizar"><tbody id="CorpoTabela"><tr><td>1</td><td>504007</td><td>Citação Edital</td><td>Família</td><td>Decisão</td></tr></tbody></table></div>
<iframe src="/quadro" style="width:900px;height:500px"></iframe></body></html>"""
QUADRO = "<html><body><h3>Cadastro de Modelo</h3><input id=x value='SEGREDO-NAO'><script>var s=1</script></body></html>"


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        corpo = (QUADRO if s.path == "/quadro" else MOLDURA).encode()
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8772), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:8772")
        pg = ctx.new_page(); pg.goto("http://localhost:8772/")
        pg.wait_for_selector("[data-projudi-ext=copiar]", state="attached", timeout=20000)
        quadro = next(f for f in pg.frames if f != pg.main_frame)
        quadro.wait_for_selector("[data-projudi-ext=copiar]", state="attached", timeout=20000)
        quadro.locator("[data-projudi-ext=copiar] button").click(); pg.wait_for_timeout(400)
        a = json.loads(pg.evaluate("navigator.clipboard.readText()"))
        assert a["tela"] == "quadro" and "Cadastro de Modelo" in a["html"] and "var s=1" not in a["html"], a
        pg.once("dialog", lambda d: d.dismiss())
        pg.locator("[data-projudi-ext=copiar] button").first.click(); pg.wait_for_timeout(300)       # moldura com a lista fechada: não copia
        pg.evaluate("document.getElementById('busca_padrao').style.display='block'")
        pg.locator("[data-projudi-ext=copiar] button").first.click(); pg.wait_for_timeout(400)
        b = json.loads(pg.evaluate("navigator.clipboard.readText()"))
        assert b["tela"].startswith("janela-de-pesquisa") and "504007" in b["html"] and "Citação Edital" in b["html"], b
        ctx.close()
    print("OK")


main()
