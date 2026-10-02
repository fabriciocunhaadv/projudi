"""O botão de diagnóstico aparece na tela do app do Studio e copia estrutura (campos, botões, armazenamento) sem o conteúdo do histórico."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body>
<select id="prompt"><option>Outros Área Judicial - Criminal</option><option>Família</option></select>
<input type="file" accept="application/pdf" hidden><button>Gerar Minuta Judicial</button><button>Sentença</button>
<script>localStorage.setItem('historico_assessor','SEGREDO-DO-PROCESSO')</script></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAG.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.ai.studio/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8771), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:8771")
        pg = ctx.new_page(); pg.goto("http://localhost:8771/")
        pg.wait_for_selector("[data-projudi-ext=studio]", state="attached", timeout=20000)
        pg.locator("[data-projudi-ext=studio] button").click(); pg.wait_for_timeout(500)
        txt = pg.evaluate("navigator.clipboard.readText()")
        ctx.close()
    d = json.loads(txt)
    print(d["botoes"], d["campos"], d["armazenamento"])
    assert any(b["t"] == "Gerar Minuta Judicial" for b in d["botoes"])
    assert any(c["tipo"] == "select" and "Família" in c["opcoes"] for c in d["campos"]) and any(c["tipo"] == "file" for c in d["campos"])
    assert "historico_assessor" in d["armazenamento"]["localStorage"] and "SEGREDO" not in txt
    print("OK")


main()
