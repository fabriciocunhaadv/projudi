"""Esteira: a lista de prompts não fecha sozinha quando a fila se atualiza (a tabela só é redesenhada depois que a pessoa sai do campo)."""
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
    pg = ctx.new_page()
    pg.goto(base + "esteira.html"); pg.wait_for_timeout(500)
    pg.evaluate("""async () => { await chrome.storage.local.set({ esteira_ordem: ['m1'], esteira_m1: { id: 'm1', processo: '5428441-88', modo: 'video', estado: 'erro', erro: 'Prompt: não achei', promptOpcoes: ['Outros Área Judicial - Cível', 'Outros Área Judicial - Criminal'], criadoEm: Date.now() } }); }""")
    pg.wait_for_selector("select[data-a-sel]", timeout=10000)
    pg.evaluate("window.__sel = document.querySelector('select[data-a-sel]'); window.__sel.focus();")
    # a fila muda (andamento de outro processo): a tabela NÃO pode ser refeita enquanto a lista está em foco
    pg.evaluate("""async () => { await chrome.storage.local.set({ esteira_m2: { id: 'm2', processo: 'outro', modo: 'video', estado: 'analisando', aviso: 'x', criadoEm: Date.now() }, esteira_ordem: ['m1', 'm2'] }); }""")
    pg.wait_for_timeout(1500)
    assert pg.evaluate("document.querySelector('select[data-a-sel]') === window.__sel && document.activeElement === window.__sel"), "a lista continua a mesma e em foco (não fechou)"
    pg.evaluate("window.__sel.value = window.__sel.options[1].value")
    pg.evaluate("window.__sel.blur()"); pg.wait_for_timeout(1500)
    assert pg.evaluate("document.querySelectorAll('#linhas tr').length") >= 2, "depois de sair do campo, a tabela é atualizada (aparece o 2º processo)"
    ctx.close()
print("OK")
