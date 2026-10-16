"""Regressão: o MESMO processo pode voltar à esteira mesmo havendo item antigo dele parado em “analisando”/“aguardando” (não pode ser engolido em silêncio)."""
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
    pg = ctx.new_page(); pg.goto(base + "ferramentas.html")
    r = pg.evaluate("""async () => {
      const m = await import('./esteira-banco.js');
      const a = await m.enfileirar({ processo: '5225174-34.2022.8.09.0166', modo: 'turbo', pdfNome: 'x.pdf' }, new Uint8Array([1, 2, 3]));
      await chrome.storage.local.set({ ['esteira_' + a]: { ...(await chrome.storage.local.get('esteira_' + a))['esteira_' + a], estado: 'analisando' } });
      const b = await m.enfileirar({ processo: '5225174-34.2022.8.09.0166', modo: 'turbo', pdfNome: 'x.pdf' }, new Uint8Array([4, 5, 6]));
      const c = await m.enfileirar({ processo: '5225174-34.2022.8.09.0166', modo: 'turbo', pdfNome: 'x.pdf' }, new Uint8Array([7]));
      return { a, b, c, total: (await m.todos()).length };
    }""")
    print(r)
    assert r["a"] != r["b"] and r["b"] != r["c"] and r["total"] == 3, r
    ctx.close()
print("OK")
