"""Esteira: sem prompt da mesma matéria, o item mostra a lista de prompts do Studio; ao escolher, usa o prompt e volta à fila."""
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
    sw.evaluate("""async () => { await chrome.storage.local.set({ esteira_ordem: ['a'], esteira_a: { id: 'a', processo: '5645680-24.2026.8.09.0166', modo: 'analise', estado: 'erro', prompt: 'Outros Área Judicial - Família e Sucessões',
      erro: 'não achei o prompt X', promptOpcoes: ['Outros Área Judicial - Criminal', 'Outros Área Judicial - Execução Fiscal Municipal'], pdfNome: 'x.pdf' } }); }""")
    pg = ctx.new_page(); pg.goto(base + "esteira.html")
    pg.wait_for_selector("select[data-a-sel='a']", timeout=15000)
    assert pg.locator("select[data-a-sel='a'] option").count() == 3
    pg.once("dialog", lambda d: d.accept())
    pg.select_option("select[data-a-sel='a']", "Outros Área Judicial - Execução Fiscal Municipal"); pg.wait_for_timeout(600)
    assert pg.locator("select[data-a-sel='a']").input_value().endswith("Municipal"), "a escolha deve sobreviver ao redesenho"
    pg.click("button[data-a=usarprompt]"); pg.wait_for_timeout(800)
    it = sw.evaluate("async () => (await chrome.storage.local.get('esteira_a')).esteira_a")
    print(it.get("prompt"), it.get("estado"), it.get("promptOpcoes"))
    assert it["prompt"] == "Outros Área Judicial - Execução Fiscal Municipal" and not it.get("promptOpcoes") and it["estado"] != "erro" or it.get("erro", "") != "não achei o prompt X", it
    ctx.close()
print("OK")
