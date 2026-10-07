"""Extração do texto de um PDF (página por página) na página da extensão, usada para enviar o texto dos autos ao Módulo Turbo."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PDF = Path(__file__).parent / "fixtures" / "pagina_projudi.pdf"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/esteira.html")
    t = pg.evaluate("async (b) => { const { textoDoPdf } = await import('./pdf-texto.js'); return await textoDoPdf(new Uint8Array(b)) }", list(PDF.read_bytes()))
    print(t[:300]); ctx.close()
assert t.startswith("[Página 1]") and len(t) > 100, t[:200]
print("OK")
