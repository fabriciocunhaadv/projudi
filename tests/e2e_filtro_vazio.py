"""Filtro de serventias: começa vazio (todas); o padrão antigo "Montes Claros" é limpo uma única vez; um filtro digitado depois é respeitado."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"; tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "ferramentas.html"); pg.wait_for_timeout(1000)
    assert pg.input_value("#filtro") == "", pg.input_value("#filtro")
    print("padrão vazio: ok")
    # quem já tinha o padrão antigo gravado: é limpo uma vez
    sw.evaluate("() => chrome.storage.sync.set({ filtro: 'Montes Claros', filtroPadraoLimpo: false })")
    pg.reload(); pg.wait_for_timeout(1000); assert pg.input_value("#filtro") == "", pg.input_value("#filtro")
    # filtro digitado depois é respeitado (e não é limpo de novo)
    pg.fill("#filtro", "Montes Claros"); pg.locator("#filtro").dispatch_event("change"); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1000); assert pg.input_value("#filtro") == "Montes Claros", pg.input_value("#filtro")
    print("OK"); ctx.close()
