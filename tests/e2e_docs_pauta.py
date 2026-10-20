"""Pauta no Google Docs sem login: a extensão cola sozinha o HTML da pauta no documento aberto (só se o título for o da pauta)."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
def pagina(titulo):
    return f"""<html><head><meta charset="utf-8"><title>{titulo} - Google Docs</title></head><body>
<iframe class="docs-texteventtarget-iframe" srcdoc="&lt;body contenteditable=true&gt;&lt;/body&gt;&lt;script&gt;document.addEventListener('paste', e => {{ document.body.setAttribute('data-colou', e.clipboardData.getData('text/html')) }})&lt;/script&gt;"></iframe></body></html>"""
PAGS = {"/document/d/A/edit": pagina("PAUTA DIA 13 DE JULHO DE 2026"), "/document/d/B/edit": pagina("Documento sem título")}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAGS.get(s.path, PAGS["/document/d/B/edit"]).encode())
    def log_message(*a): pass
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://docs.google.com/document/*", "http://127.0.0.1/*"))
srv = http.server.HTTPServer(("127.0.0.1", 8781), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    sw.evaluate("""() => chrome.storage.local.set({ pauta_docs_pend: { titulo: "PAUTA DIA 13 DE JULHO DE 2026", html: "<table><tr><td>13h30</td><td>5718969-10.2025.8.09.0106</td></tr></table>", texto: "13h30 5718969", ts: Date.now() } })""")
    outro = ctx.new_page(); outro.goto("http://127.0.0.1:8781/document/d/B/edit"); outro.wait_for_timeout(3000)
    assert outro.frames[1].evaluate("document.body.getAttribute('data-colou')") is None, "não pode colar em outro documento"
    assert sw.evaluate("async () => !!(await chrome.storage.local.get('pauta_docs_pend')).pauta_docs_pend") is True
    pg = ctx.new_page(); pg.goto("http://127.0.0.1:8781/document/d/A/edit"); pg.wait_for_timeout(3500)
    colou = [f for f in pg.frames if f != pg.main_frame][0].evaluate("document.body.getAttribute('data-colou')"); print("COLOU:", colou)
    assert colou and "<table" in colou and "5718969-10" in colou
    assert sw.evaluate("async () => !!(await chrome.storage.local.get('pauta_docs_pend')).pauta_docs_pend") is False, "o pedido some depois de colar"
    ctx.close()
print("OK")
