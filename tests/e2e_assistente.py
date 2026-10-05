"""Modo simples: escolher varas, preparar minutas com um clique (Studio + Google Docs ligados) e ver o andamento em frases curtas."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
SERV = "Montes Claros de Goias - Vara de Família e Sucessões - GO"
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    eid = sw.url.split("/")[2]
    ctx.new_page().wait_for_timeout(4000)      # deixa a verificação inicial da extensão terminar antes de semear os dados
    proc = lambda n, d: {"processo": f"500000{n}-11.2026.8.09.0166", "url": f"BuscaProcesso?id={n}", "urgencia": 3, "urgenciaTexto": "Normal", "dataInicio": d, "classificador": "Fabricio - minutando"}
    sw.evaluate("(e) => chrome.storage.local.set({ estado: e, esteira_ordem: ['x'], esteira_x: { id: 'x', processo: '5000009-11.2026.8.09.0166', estado: 'conferindo' } })",
                {"serventias": [{"serventia": SERV, "processos": {"naoAnalisadas": [proc(1, "01/10/2026 10:00:00"), proc(2, "02/10/2026 10:00:00"), proc(9, "03/10/2026 10:00:00")], "preAnalisadas": [proc(3, "01/10/2026 11:00:00")]}}]})
    pg = ctx.new_page(); pg.wait_for_timeout(1500); pg.goto(f"chrome-extension://{eid}/assistente.html"); pg.wait_for_timeout(1500)
    print(pg.inner_text("body")[:900])
    assert "Vara de Família e Sucessões" in pg.inner_text("#varas") and pg.locator("#comecar").is_disabled()
    pg.locator("input[data-serv]").check(); pg.wait_for_timeout(800)
    auto = sw.evaluate("async () => (await chrome.storage.sync.get('automacao')).automacao")[SERV]
    assert auto["ativa"] and auto["prompt"] == "Outros Área Judicial - Família e Sucessões" and auto["arquivoModelos"].startswith("Família - ")
    assert "Google Docs, ao lado do PDF" in pg.inner_text("#agora")             # processo 9 está na conferência
    assert "Vou preparar 2 de 2" in pg.inner_text("#resumo")                    # o 5000009 já está na esteira; pré-analisadas fora
    pg.select_option("#quantos", "3"); pg.check("#comPre"); pg.wait_for_timeout(300)
    assert "Vou preparar 3 de 3" in pg.inner_text("#resumo"), pg.inner_text("#resumo")
    pg.click("#comecar"); pg.wait_for_timeout(1500)
    lotes = sw.evaluate("async () => Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith('lote_')).map(([k, v]) => v)")
    print([i["processo"] for i in lotes[0]["itens"]], lotes[0]["opcoes"])
    assert [i["processo"][:7] for i in lotes[0]["itens"]] == ["5000001", "5000002", "5000003"]      # novas primeiro, depois a pré-analisada
    assert lotes[0]["opcoes"]["studio"] == {"ativo": True, "modo": "analise", "docs": True} and len(lotes[0]["itens"]) == 3
    ctx.close()
print("OK")
