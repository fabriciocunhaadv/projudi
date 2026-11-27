"""Pauta > Sentenciar com o vídeo: o prompt de cada processo vem da SERVENTIA (Painel) ou da sugestão pelo nome; o campo, se preenchido, vale para todos."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
import time
SA, SB, SC = "Montes Claros de Goiás - Vara das Fazendas Públicas - GO", "Goiânia - Juizado Especial Cível - GO", "Serventia Sem Area Conhecida"
def espera_msg(pg, trecho, seg=10):
    t = time.time()
    while time.time() - t < seg:
        if trecho in pg.inner_text("#msg"): return
        time.sleep(.2)
    raise AssertionError("mensagem não apareceu: " + pg.inner_text("#msg"))
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    # a pauta NÃO tem mais o botão de sentenciar com vídeo (a pauta só traz quem aguarda audiência)
    pg = ctx.new_page(); pg.goto(base + "pauta.html"); assert pg.locator("#video").count() == 0 and "Sentenciar com vídeo" in pg.inner_text("body")
    pg.evaluate("""async ([a, b, c]) => { await chrome.storage.sync.set({ automacao: { [a]: { ativa: true, prompt: 'Prompt da Fazenda do Gabinete' } } }); await chrome.storage.local.clear();
      const P = (processo, n) => ({ processo, url: 'BuscaProcesso?x=' + n, classificador: 'Concluso - Sentença' });
      await chrome.storage.local.set({ estado: { status: 'ok', serventias: [ { serventia: a, perfil: 'J', url: 'u1', processos: { naoAnalisadas: [P('5428441-88.2026.8.09.0166', 1)], preAnalisadas: [] } },
        { serventia: b, perfil: 'J', url: 'u2', processos: { naoAnalisadas: [], preAnalisadas: [P('5655940-63.2026.8.09.0166', 2)] } }, { serventia: c, perfil: 'J', url: 'u3', processos: { naoAnalisadas: [P('5488341-02.2026.8.09.0166', 3)], preAnalisadas: [] } } ] } }); }""", [SA, SB, SC])
    pg.goto(base + "sentenca-video.html"); pg.wait_for_selector(".sel")
    assert pg.locator(".sel").count() == 3 and pg.is_disabled("#video"), "lista os conclusos; botão desligado sem marcar"
    def rodar(manual):
        pg.reload(); pg.wait_for_selector(".sel"); pg.click("#todos"); assert pg.is_enabled("#video")
        if manual:
            pg.evaluate("(m) => { const sel = document.getElementById('promptVideo'); const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); sel.value = m; }", manual)
        pg.click("#video"); espera_msg(pg, "Prompt(s) usado")
        lotes = pg.evaluate("async () => { const o = await chrome.storage.local.get(null); return Object.entries(o).filter(([k]) => k.startsWith('lote_pautavideo')).map(([k, v]) => v); }")
        pg.evaluate("async () => { const o = await chrome.storage.local.get(null); await chrome.storage.local.remove(Object.keys(o).filter(k => k.startsWith('lote_'))); }"); return lotes[-1]
    l = rodar("")
    print([i["prompt"] for i in l["itens"]])
    assert sorted(i["prompt"] for i in l["itens"]) == sorted(["Prompt da Fazenda do Gabinete", "Outros Área Judicial - Juizado Especial Cível", ""]), "serventia cadastrada > sugestão pelo nome > vazio (a esteira pede)"
    assert l["opcoes"]["studio"]["modo"] == "video" and all(i["url"].startswith("BuscaProcesso") for i in l["itens"])
    l2 = rodar("Meu Prompt Único")
    assert {i["prompt"] for i in l2["itens"]} == {"Meu Prompt Único"}, "o campo vale para todos"
    # filtro por número e por serventia
    pg.reload(); pg.wait_for_selector(".sel"); pg.fill("#busca", "5655940"); assert pg.locator(".sel").count() == 1
    pg.fill("#busca", ""); pg.select_option("#serv", SA); assert pg.locator(".sel").count() == 1
    ctx.close()
print("OK")
