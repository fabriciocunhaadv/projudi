"""Esteira: se outra aba (antiga/travada) segura o bloqueio sem dar sinal de vida, a aba nova assume a fila sozinha;
com uma dona viva (pulso recente), ela não assume."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    # aba "zumbi": segura o bloqueio e nunca dá pulso
    z = ctx.new_page(); z.goto(base + "lote.html")
    z.evaluate("() => { navigator.locks.request('esteira-executor', () => new Promise(() => {})); }"); z.wait_for_timeout(500)
    pg = ctx.new_page(); pg.goto(base + "esteira.html")
    pg.wait_for_function("document.getElementById('status').textContent.includes('Outra aba')", timeout=10000)
    assert pg.evaluate("document.body.dataset.executor") is None
    pg.wait_for_selector("body[data-executor='1']", timeout=20000)      # sem pulso: assume sozinha
    assert pg.evaluate("document.getElementById('status').textContent") == ""
    print("assumiu a fila")
    # dona viva: uma segunda aba aberta agora não assume (o pulso está recente)
    pg2 = ctx.new_page(); pg2.goto(base + "esteira.html"); pg2.wait_for_timeout(9000)
    assert pg2.evaluate("document.body.dataset.executor") is None, "a aba nova roubou a fila de uma dona viva"
    ctx.close()
print("OK")
