"""Pauta > Sentenciar com o vídeo: o prompt de cada processo vem da SERVENTIA (Painel) ou da sugestão pelo nome; o campo, se preenchido, vale para todos."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "pauta.html")
    pg.evaluate("async () => { await chrome.storage.sync.set({ automacao: { 'Montes Claros de Goiás - Vara das Fazendas Públicas - GO': { ativa: true, prompt: 'Prompt da Fazenda do Gabinete' } } }); await chrome.storage.local.clear(); }")
    def rodar(manual):
        pg.evaluate("""(m) => { { const sel = document.getElementById('promptVideo'); if (m && ![...sel.options].some(o => o.value === m)) { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); } sel.value = m; } window.__pauta.set([
          { processo: '5428441-88.2026.8.09.0166', url: 'BuscaProcesso?x=1', data: '2026-11-09', hora: '14:00', serventiaNome: 'Montes Claros de Goiás - Vara das Fazendas Públicas - GO', marcado: true },
          { processo: '5655940-63.2026.8.09.0166', url: 'BuscaProcesso?x=2', data: '2026-11-09', hora: '14:20', serventiaNome: 'Goiânia - Juizado Especial Cível - GO', marcado: true },
          { processo: '5488341-02.2026.8.09.0166', url: 'BuscaProcesso?x=3', data: '2026-11-09', hora: '14:40', serventiaNome: 'Serventia Sem Area Conhecida', marcado: true }]); document.getElementById('video').disabled = false; document.getElementById('video').click(); }""", manual)
        pg.wait_for_function("document.getElementById('msg').textContent.includes('Prompt(s) usado')", timeout=10000)
        lotes = pg.evaluate("async () => { const o = await chrome.storage.local.get(null); return Object.entries(o).filter(([k]) => k.startsWith('lote_pautavideo')).map(([k, v]) => v); }")
        pg.evaluate("chrome.storage.local.clear()"); return lotes[-1]
    l = rodar("")
    print([i["prompt"] for i in l["itens"]])
    assert [i["prompt"] for i in l["itens"]] == ["Prompt da Fazenda do Gabinete", "Outros Área Judicial - Juizado Especial Cível", ""], "serventia cadastrada > sugestão pelo nome > vazio (a esteira pede)"
    assert l["opcoes"]["studio"]["modo"] == "video"
    l2 = rodar("Meu Prompt Único")
    assert {i["prompt"] for i in l2["itens"]} == {"Meu Prompt Único"}, "o campo vale para todos"
    ctx.close()
print("OK")
