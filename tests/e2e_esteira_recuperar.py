"""Recuperar processos já baixados: nome com número curto (5285460.70-OCR.pdf), escolha da função (Análise/Lupa/Turbo) e prompt da serventia do painel."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
a = tmp / "5285460.70-OCR.pdf"; b = tmp / "6006074.21-OCR.pdf"
for f in (a, b): f.write_bytes(b"%PDF-1.4 teste")
SERV = "Montes Claros de Goias - Juizado Especial Civel - GO"
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    sw.evaluate("""async (s) => {
      await chrome.storage.local.set({ estado: { status: 'ok', serventias: [{ serventia: s, url: 'Usuario?PaginaAtual=7&a1=1', processos: { naoAnalisadas: [{ processo: '6006074.21', url: 'BuscaProcesso?Id_Processo=2' }], preAnalisadas: [{ processo: '5285460.70', url: 'BuscaProcesso?Id_Processo=1', urlPre: '' }] } }] } });
      await chrome.storage.sync.set({ automacao: { [s]: { ativa: true, prompt: 'Outros Área Judicial - Cível' } } }); }""", SERV)
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    pg.evaluate("document.getElementById('importar').open = true")
    pg.select_option("#impModo", "turbo"); pg.uncheck("#impDocs")
    pg.set_input_files("#impArq", [str(a)]); pg.wait_for_timeout(1500)
    print(pg.inner_text("#impMsg"))
    pg.select_option("#impModo", "lupa")        # 6006074.21 é "não analisada": sem minuta do assessor -> entra na fila com o motivo
    pg.set_input_files("#impArq", [str(b)]); pg.wait_for_timeout(1500)
    print(pg.inner_text("#impMsg"))
    dados = sw.evaluate("async () => { const o = (await chrome.storage.local.get('esteira_ordem')).esteira_ordem; const d = await chrome.storage.local.get(o.map(i => 'esteira_' + i)); return o.map(i => { const x = d['esteira_' + i]; return [x.processo, x.modo, x.prompt, x.url, x.motivoMinuta || '']; }); }")
    print(dados)
    assert dados[0][:3] == ["5285460.70", "turbo", "Outros Área Judicial - Cível"] and "Id_Processo=1" in dados[0][3]
    assert dados[1][:2] == ["6006074.21", "lupa"] and "pré-analisadas" in dados[1][4]
    ctx.close()
print("OK")
