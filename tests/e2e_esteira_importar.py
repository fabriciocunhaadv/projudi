"""Recuperar processos já baixados: PDFs número-OCR.pdf entram na fila (sem baixar de novo), sem duplicar."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
a = tmp / "5527285-86.2026.8.09.0097-OCR.pdf"; b = tmp / "5293296-60.2026.8.09.0166-OCR.pdf"; c = tmp / "qualquer.pdf"
for f in (a, b, c): f.write_bytes(b"%PDF-1.4 teste")
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    eid = sw.url.split("/")[2]
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{eid}/esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    pg.evaluate("document.getElementById('importar').open = true")
    pg.fill("#impPrompt", "Outros Área Judicial - Família e Sucessões"); pg.uncheck("#impDocs")
    pg.set_input_files("#impArq", [str(a), str(b), str(c)]); pg.wait_for_timeout(1500)
    print(pg.inner_text("#impMsg"))
    assert "2 processo(s)" in pg.inner_text("#impMsg")
    dados = sw.evaluate("async () => { const o = (await chrome.storage.local.get('esteira_ordem')).esteira_ordem; const d = await chrome.storage.local.get(o.map(i => 'esteira_' + i)); return o.map(i => [d['esteira_' + i].processo, d['esteira_' + i].estado, d['esteira_' + i].url, d['esteira_' + i].docs]); }")
    print(dados)
    assert [x[0] for x in dados] == ["5527285-86.2026.8.09.0097", "5293296-60.2026.8.09.0166"] and "ProcessoNumero=5527285-" in dados[0][2] and dados[0][3] is False
    pg.set_input_files("#impArq", [str(a)]); pg.wait_for_timeout(800)
    assert "Nenhum arquivo novo" in pg.inner_text("#impMsg")          # não duplica
    ctx.close()
print("OK")
