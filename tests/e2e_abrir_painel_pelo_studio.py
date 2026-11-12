"""A extensão (2.0.6) anuncia o seu id ao Studio e libera painel.html e pauta.html para ele: um link do Studio abre cada uma numa aba nova.
Rodar: /usr/bin/python3 tests/e2e_abrir_painel_pelo_studio.py"""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(b"<html><head><title>Assessor Judicial</title></head><body>Studio falso</body></html>")
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://localhost/*"))
    assert '"painel.html"' in m.read_text() and "web_accessible_resources" in m.read_text(), "o manifesto precisa liberar painel.html e pauta.html"
    srv = http.server.HTTPServer(("localhost", 8793), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        extid = sw.url.split("/")[2]
        pg = ctx.new_page(); pg.goto("http://localhost:8793/"); pg.wait_for_function("document.documentElement.dataset.assessorExtensaoId", timeout=10000)
        anunciado = pg.evaluate("document.documentElement.dataset.assessorExtensaoId")
        assert anunciado == extid, (anunciado, extid)
        print("ok: a extensão anuncia o seu id ao Studio:", anunciado[:8] + "…")
        for pagina, titulo in (("painel.html", "Painel"), ("pauta.html", "")):
            pg.evaluate("([u]) => { const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }", [f"chrome-extension://{anunciado}/{pagina}"])
            nova = ctx.wait_for_event("page", timeout=8000); nova.wait_for_load_state(timeout=8000)
            assert nova.url == f"chrome-extension://{extid}/{pagina}", nova.url
            assert titulo in nova.title(), nova.title()
            print("ok: abre", pagina, "numa aba nova:", nova.title()[:40]); nova.close()
        ctx.close()
    print("TUDO OK")

main()
