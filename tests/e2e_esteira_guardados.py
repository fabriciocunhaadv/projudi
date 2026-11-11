"""Esteira: prompts em caixa de seleção (lista do Studio) e 'Sentenças com vídeo já preparadas': refazer sem baixar nem degravar de novo."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
APP = """<html><head><title>Assessor Judicial</title></head><body><div id="tour-input-panel"></div></body></html>"""
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    ctx.route("https://judicial-mysql.assessor.net.br/**", lambda r: r.fulfill(body=APP, content_type="text/html; charset=utf-8"))
    app = ctx.new_page(); app.goto("https://judicial-mysql.assessor.net.br/")
    app.wait_for_function("document.documentElement.dataset.assessorExtensaoRecursos", timeout=15000)
    pg = ctx.new_page(); pg.goto(base + "esteira.html"); pg.wait_for_timeout(800)
    # 1) lista de prompts do Studio (o app de mentira devolve 'opcoes' quando o nome não existe): hack: simula respondendo studio-prompt-texto
    # guarda uma sentença com vídeo preparada (PDF + vídeos + degravação) como a esteira faz
    pg.evaluate("""async () => { const b = await import('./esteira-banco.js');
      await chrome.storage.local.set({ midias_54284418820268090166: { meta: [{ nome: 'v1.mp4', tipo: 'video/mp4', tamanho: 3000000, mov: 52 }], em: Date.now(), processo: '5428441-88.2026.8.09.0166', serventia: 'Montes Claros de Goiás - Vara das Fazendas Públicas - GO', prompt: 'Outros Área Judicial - Fazenda Pública Comum', pdfNome: '5428441-OCR.pdf' }, degr_54284418820268090166: { assin: 'v1.mp4:3000000', texto: 'DEGRAVAÇÃO', em: Date.now() } });
      await b.guardarMidia('54284418820268090166', 0, new Uint8Array(100)); await b.guardarPdfDoVideo('54284418820268090166', new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])); }""")
    pg.wait_for_selector("#guardadosLinhas [data-gv-refazer]", timeout=10000)
    txt = pg.inner_text("#guardadosLinhas"); print(txt.replace("\n", " | "))
    assert "5428441-88.2026.8.09.0166" in txt and "pronta" in txt, txt
    # 2) refazer: o processo volta para a fila com o prompt escolhido, sem baixar nada
    pg.evaluate("""() => { const s = document.getElementById('impPrompt'); const o = document.createElement('option'); o.value = 'Meu Prompt'; o.textContent = 'Meu Prompt'; s.appendChild(o); s.value = 'Meu Prompt'; }""")
    pg.click("[data-gv-refazer]"); pg.wait_for_timeout(1200)
    itens = pg.evaluate("""async () => { const o = await chrome.storage.local.get(null); return Object.entries(o).filter(([k, v]) => k.startsWith('esteira_m')).map(([, v]) => ({ processo: v.processo, modo: v.modo, prompt: v.prompt, estado: v.estado })); }""")
    print(itens)
    assert any(i["processo"] == "5428441-88.2026.8.09.0166" and i["modo"] == "video" and i["prompt"] == "Meu Prompt" for i in itens), itens
    # 3) apagar
    pg.once("dialog", lambda d: d.accept()); pg.click("[data-gv-apagar]"); pg.wait_for_timeout(800)
    assert pg.evaluate("async () => !(await chrome.storage.local.get('midias_54284418820268090166')).midias_54284418820268090166 && !(await chrome.storage.local.get('degr_54284418820268090166')).degr_54284418820268090166"), "apagou tudo"
    # select de prompts existe (caixa com seta)
    assert pg.evaluate("document.getElementById('impPrompt').tagName") == "SELECT"
    ctx.close()
print("OK")
