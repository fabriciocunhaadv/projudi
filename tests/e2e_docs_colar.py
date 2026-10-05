"""Sem o login do Google: a barra da extensão cola a minuta no documento (evento de colar no campo de entrada do Docs) e mostra o botão de concluir."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><head><meta charset="utf-8"><title>5527285-86.2026.8.09.0097 – sentença - Google Docs</title></head><body>
<iframe class="docs-texteventtarget-iframe" srcdoc="&lt;body contenteditable=true&gt;&lt;/body&gt;&lt;script&gt;document.addEventListener('paste', e => { document.body.setAttribute('data-colou', e.clipboardData.getData('text/plain')) })&lt;/script&gt;"></iframe></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAG.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://docs.google.com/document/*", "http://127.0.0.1/*"))
    srv = http.server.HTTPServer(("127.0.0.1", 8780), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        sw.evaluate("""() => chrome.storage.local.set({ esteira_ordem: ["a"], esteira_a: { id: "a", processo: "5527285-86.2026.8.09.0097", estado: "conferindo", via: "colar", tipo: "sentença",
          docUrl: "https://docs.google.com/document/create?title=x", minuta: "SENTENÇA\\nJulgo procedente.", htmlColar: "<p>SENTENÇA</p><p>Julgo procedente.</p>", colado: false } })""")
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8780/document/d/XYZ/edit")
        pg.wait_for_selector("[data-projudi-ext=esteira] #ok", state="attached", timeout=20000)
        pg.wait_for_timeout(2500)
        quadro = [f for f in pg.frames if f != pg.main_frame][0]
        colou = quadro.evaluate("document.body.getAttribute('data-colou')")
        print("COLOU:", colou)
        assert colou and "Julgo procedente." in colou
        assert sw.evaluate("async () => (await chrome.storage.local.get('esteira_a')).esteira_a.colado") is True
        txt = pg.evaluate("document.querySelector('[data-projudi-ext=esteira]').shadowRoot.querySelector('.b').innerText")
        assert "Concluir conferência e enviar ao Projudi" in txt, txt
        pg.locator("[data-projudi-ext=esteira] #ok").click(); pg.wait_for_timeout(800)
        assert sw.evaluate("async () => (await chrome.storage.local.get('esteira_a')).esteira_a.estado") == "conferido"
        ctx.close()
    print("OK")


main()
