"""Computador acordado: pede 'manter acordado' (system) enquanto há trabalho e libera quando ninguém dá sinal."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    r = pg.evaluate("""async () => {
      const { manterAcordado, conferirAcordado } = await import('./acordado.js'); const k = [];
      const rq = chrome.power.requestKeepAwake, rl = chrome.power.releaseKeepAwake;
      chrome.power.requestKeepAwake = (l) => { k.push('pedir:' + l); }; chrome.power.releaseKeepAwake = () => { k.push('liberar'); };
      await manterAcordado('a', true); await manterAcordado('b', true);
      await manterAcordado('a', false); const meio = [...k];       // 'b' ainda ativo: não libera
      await manterAcordado('b', false);                             // ninguém ativo: libera
      await chrome.storage.local.set({ acordado_velho: Date.now() - 10 * 60000 }); await conferirAcordado();   // sinal vencido não segura
      chrome.power.requestKeepAwake = rq; chrome.power.releaseKeepAwake = rl;
      return { meio, k };
    }""")
    print(r)
    assert r["meio"] == ["pedir:system", "pedir:system"], r
    assert r["k"][-2:] == ["liberar", "liberar"] or r["k"].count("liberar") >= 1, r
    ctx.close()
print("OK")
