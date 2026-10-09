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
    # retomada: item "interrompido"/"analisando" de uma aba anterior volta à fila sozinho (não fica esperando o usuário escolher)
    sw.evaluate("""async () => { await chrome.storage.local.set({ esteira_ordem: ['a', 'b'], esteira_a: { id: 'a', processo: '5645680-24.2026.8.09.0166', modo: 'analise', estado: 'pausado', prompt: 'x', pdfNome: 'a.pdf' }, esteira_b: { id: 'b', processo: '5376235-97.2026.8.09.0166', modo: 'analise', estado: 'aguardando', prompt: 'x', pdfNome: 'b.pdf' } }); }""")
    r0 = ctx.new_page(); r0.goto(base + "esteira.html"); r0.wait_for_selector("body[data-executor='1']", timeout=15000); r0.wait_for_timeout(1500)
    est = sw.evaluate("async () => (await chrome.storage.local.get(['esteira_a'])).esteira_a.estado")
    assert est != "pausado", est
    print("retomou:", est)
    r0.close()
    sw.evaluate("async () => { await chrome.storage.local.clear(); }")
    # aba "zumbi": segura o bloqueio e nunca dá pulso
    z = ctx.new_page(); z.goto(base + "lote.html")
    z.evaluate("() => { navigator.locks.request('esteira-executor', () => new Promise(() => {})); }"); z.wait_for_timeout(500)
    pg = ctx.new_page(); pg.goto(base + "esteira.html")
    for _ in range(40):      # (sem wait_for_function: a página da extensão não aceita eval de texto)
        if "Outra aba" in pg.evaluate("() => document.getElementById('status').textContent"): break
        pg.wait_for_timeout(250)
    else:
        raise AssertionError("deveria mostrar que outra aba segura a fila")
    assert pg.evaluate("document.body.dataset.executor") is None
    pg.wait_for_selector("body[data-executor='1']", timeout=20000)      # sem pulso: assume sozinha
    assert pg.evaluate("document.getElementById('status').textContent") == ""
    print("assumiu a fila")
    # dona viva: uma segunda aba da esteira se fecha sozinha e a existente continua (só 1 aba da esteira)
    pg2 = ctx.new_page(); pg2.goto(base + "esteira.html")
    for _ in range(20):
        if pg2.is_closed(): break
        try: pg.wait_for_timeout(500)
        except Exception: break
    assert pg2.is_closed(), "a segunda aba da esteira deveria se fechar"
    assert not pg.is_closed() and pg.evaluate("document.body.dataset.executor") == "1"
    ctx.close()
print("OK")
