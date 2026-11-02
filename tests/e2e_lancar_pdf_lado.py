"""Lançar no Projudi: o service worker carrega o módulo novo e a página pdf-lado.html abre o PDF guardado pela esteira (IndexedDB)."""
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
    assert sw.evaluate("typeof lancarNoProjudi === 'function' && typeof lpInserirNoEditor === 'function'"), "módulo não carregou no service worker"
    # sem aba do Projudi aberta: não cria aba nova, explica
    r = sw.evaluate("lancarNoProjudi({ processo: '5914870-27.2025.8.09.0166', texto: 'DECISÃO\\n' + 'x'.repeat(80), html: '' }, null)")
    print(r); assert not r["ok"] and "não há aba do Projudi" in r["erro"], r
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "esteira.html")
    pg.evaluate("""async (b) => { await new Promise((ok, er) => { const r = indexedDB.open('projudi_esteira', 1); r.onupgradeneeded = () => r.result.createObjectStore('pdf');
        r.onsuccess = () => { const t = r.result.transaction('pdf', 'readwrite'); t.objectStore('pdf').put(new Uint8Array(b), 'mteste'); t.oncomplete = ok; t.onerror = er; }; }); }""", list(PDF.read_bytes()))
    assert sw.evaluate("lpTemPdf('mteste')") is True and sw.evaluate("lpTemPdf('naoexiste')") is False
    v = ctx.new_page(); v.goto(base + "pdf-lado.html?id=mteste"); v.wait_for_timeout(2500)
    print("URL:", v.url); assert v.url.startswith("blob:chrome-extension://"), v.url
    ctx.close()
print("OK")
