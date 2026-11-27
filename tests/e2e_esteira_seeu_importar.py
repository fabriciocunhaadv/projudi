"""Importar PDF do SEEU na esteira (função “SEEU → Agaia”): nome com o número CNJ completo; exige prompt; entra como modo agaiaseeu com o PDF guardado."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
bom = tmp / "0001234-56.2024.8.09.0051.pdf"; ruim = tmp / "processo_seeu.pdf"
for f in (bom, ruim): f.write_bytes(b"%PDF-1.4 teste " * 200)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    pg.evaluate("document.getElementById('importar').open = true")
    pg.select_option("#impModo", "agaiaseeu"); assert pg.is_visible("#impSeeuAjuda"), "mostra a explicação do SEEU"
    pg.evaluate("() => { const s = document.getElementById('impPrompt'); const o = document.createElement('option'); o.value = o.textContent = 'Outros Área Judicial - Sentença'; s.appendChild(o); s.value = o.value; }")
    pg.set_input_files("#impArq", [str(ruim)]); pg.wait_for_timeout(1200)
    assert "20 dígitos" in pg.inner_text("#impMsg"), pg.inner_text("#impMsg")
    pg.check("#impSeeuAceite"); pg.set_input_files("#impArq", [str(bom)]); pg.wait_for_timeout(1500)
    print(pg.inner_text("#impMsg"))
    d = sw.evaluate("async () => { const o = (await chrome.storage.local.get('esteira_ordem')).esteira_ordem || []; const x = await chrome.storage.local.get(o.map(i => 'esteira_' + i)); return o.map(i => x['esteira_' + i]); }")
    assert len(d) == 1 and d[0]["processo"] == "0001234-56.2024.8.09.0051" and d[0]["modo"] == "agaiaseeu" and d[0]["aceiteSigilo"] is True and d[0]["prompt"] == "Outros Área Judicial - Sentença", d
    assert "SEEU → Agaia" in pg.inner_text("#impMsg")
    ctx.close()
print("OK: importar SEEU")
