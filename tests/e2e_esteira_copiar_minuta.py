"""Esteira: processo concluído mostra 'Copiar minuta' (a extensão guarda a minuta mesmo que o Histórico do app não a tenha gravado)."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
MINUTA = "SENTENÇA. Trata-se de ação movida por A em face de B. " + "Fundamentação. " * 30 + "Julgo procedente."
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "ferramentas.html")
    pg.evaluate("""async (min) => {
      const m = await import('./esteira-banco.js');
      const a = await m.enfileirar({ processo: '5225415-66.2026.8.09.0166', modo: 'analise', pdfNome: 'x.pdf' }, new Uint8Array([1, 2, 3]));
      await chrome.storage.local.set({ ['esteira_' + a]: { ...(await chrome.storage.local.get('esteira_' + a))['esteira_' + a], estado: 'concluido', minuta: min } });
      const b = await m.enfileirar({ processo: '5300000-00.2026.8.09.0166', modo: 'analise', pdfNome: 'y.pdf' }, new Uint8Array([4]));
      await chrome.storage.local.set({ ['esteira_' + b]: { ...(await chrome.storage.local.get('esteira_' + b))['esteira_' + b], estado: 'concluido', minuta: '' } });
    }""", MINUTA)
    pg2 = ctx.new_page(); pg2.goto(base + "esteira.html"); pg2.wait_for_timeout(2500)
    n = pg2.locator("button[data-a=copiar]").count(); print("botões Copiar minuta:", n); assert n == 1, n
    pg2.locator("button[data-a=copiar]").click(); pg2.wait_for_timeout(500)
    print("rótulo:", pg2.locator("button[data-a=copiar]").inner_text())
    clip = pg2.evaluate("navigator.clipboard.readText()"); assert clip == MINUTA, clip[:80]
    ctx.close()
print("OK")
