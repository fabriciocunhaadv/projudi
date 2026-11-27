"""Painel Plus: botão no menu da extensão e a tela com cartões, fila da esteira, serventias, favoritas e recentes (dados só do navegador do usuário)."""
import glob, os, shutil, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
def espera(pg, sel, valor, seg=10):
    t = time.time()
    while time.time() - t < seg:
        try:
            if pg.inner_text(sel) == valor: return
        except Exception: pass
        time.sleep(.2)
    raise AssertionError(f"{sel} não chegou a {valor}: {pg.inner_text(sel)}")
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker"); eid = sw.url.split("/")[2]
    erros = []
    # 1) popup: o botão novo abre o painel Plus
    pop = ctx.new_page(); pop.goto(f"chrome-extension://{eid}/popup.html"); pop.wait_for_selector("[data-testid=btn-plus]")
    assert "Painel Plus" in pop.inner_text("[data-testid=btn-plus]")
    with ctx.expect_page() as nova: pop.click("[data-testid=btn-plus]")
    assert nova.value.url.endswith("/plus.html"), nova.value.url
    nova.value.close()
    # 2) sem dados nenhuns: abre, avisa, não quebra
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)[:200])); pg.goto(f"chrome-extension://{eid}/plus.html"); pg.wait_for_selector("[data-testid=plus-cartoes] button")
    assert pg.is_visible("#aviso") and "Ainda não há dados" in pg.inner_text("#aviso")
    assert "A esteira está vazia" in pg.inner_text("[data-testid=plus-fila]")
    # 3) com dados do Projudi (painel) e da esteira
    A, B = "Montes Claros de Goias - Juizado Especial Civel - GO", "Montes Claros de Goias - Vara Unica - GO"
    sw.evaluate("""async ([A, B]) => {
      await chrome.storage.local.set({ estado: { status: 'ok', quando: Date.now(), serventias: [
        { serventia: A, perfil: 'Juiz', url: 'Usuario?PaginaAtual=7&a1=1', linhas: [{ naoAnalisadas: 20, preAnalisadas: 3 }], processos: { naoAnalisadas: [], preAnalisadas: [] } },
        { serventia: B, perfil: 'Juiz', url: 'Usuario?PaginaAtual=7&a1=2', linhas: [{ naoAnalisadas: 90, preAnalisadas: 7 }], processos: { naoAnalisadas: [], preAnalisadas: [] } },
        { serventia: B, perfil: 'Outro perfil', url: 'Usuario?PaginaAtual=7&a1=3', linhas: [{ naoAnalisadas: 90, preAnalisadas: 7 }], processos: { naoAnalisadas: [], preAnalisadas: [] } } ] } });
      const it = (id, processo, serventia, estado, modo, extra = {}) => ({ id, processo, serventia, estado, modo, url: 'BuscaProcesso?Id_Processo=' + id, ...extra });
      const todos = [it('a1', '5137277-85', A, 'conferindo', 'analise'), it('a2', '5137079-86', A, 'analisando', 'turbo'), it('a3', '5424216-06', B, 'erro', 'ia', { erro: 'A minuta não veio' }), it('a4', '5106096-37', B, 'concluido', 'analise'), it('a5', '5000001-01', B, 'aguardando', 'lupa')];
      const o = {}; todos.forEach((x) => (o['esteira_' + x.id] = x)); o.esteira_ordem = todos.map((x) => x.id); await chrome.storage.local.set(o); }""", [A, B])
    espera(pg, "[data-testid=plus-cartao-conclusos] b", "120")   # 20+3 + 90+7 (o 2º perfil da mesma unidade não soma de novo)
    n = lambda k: pg.inner_text(f"[data-testid=plus-cartao-{k}] b")
    assert (n("conclusos"), n("pre"), n("fila"), n("prontas"), n("erro")) == ("120", "10", "2", "1", "1"), (n("conclusos"), n("pre"), n("fila"), n("prontas"), n("erro"))
    fila = pg.inner_text("[data-testid=plus-fila]"); assert "5137277-85" in fila and "5424216-06" in fila and "5106096-37" not in fila, "concluídos não entram na fila"
    assert fila.index("5424216-06") < fila.index("5137277-85") < fila.index("5137079-86"), "erro primeiro, depois prontas, depois em espera"
    assert not pg.is_visible("#aviso"), "com dados não mostra o aviso"
    ser = pg.inner_text("[data-testid=plus-serventias]"); assert ser.count("Vara Unica") == 1, "mesma unidade de outro perfil não repete"
    assert ser.index("Vara Unica") < ser.index("Juizado"), "ordenado por mais conclusos"
    # 4) cartão filtra a fila
    pg.click("[data-testid=plus-cartao-erro]"); f = pg.inner_text("[data-testid=plus-fila]"); assert "5424216-06" in f and "5137277-85" not in f
    pg.click("[data-testid=plus-cartao-erro]"); assert "5137277-85" in pg.inner_text("[data-testid=plus-fila]")
    # 5) filtros: serventia, tipo, busca
    pg.select_option("[data-testid=plus-f-serventia]", A); assert n("conclusos") == "23" and "5424216-06" not in pg.inner_text("[data-testid=plus-fila]")
    pg.select_option("[data-testid=plus-f-serventia]", ""); pg.select_option("[data-testid=plus-f-modo]", "turbo"); assert "5137079-86" in pg.inner_text("[data-testid=plus-fila]") and "5137277-85" not in pg.inner_text("[data-testid=plus-fila]")
    pg.select_option("[data-testid=plus-f-modo]", ""); pg.fill("[data-testid=plus-busca]", "5000001"); assert "5000001-01" in pg.inner_text("[data-testid=plus-fila]") and "5137277-85" not in pg.inner_text("[data-testid=plus-fila]")
    pg.fill("[data-testid=plus-busca]", "")
    # 6) favoritas
    pg.click(f"[data-fav='{B}']"); assert "Vara Unica" in pg.inner_text("[data-testid=plus-favoritas]") and "pré" in pg.inner_text("[data-testid=plus-favoritas]")
    assert B in sw.evaluate("async () => (await chrome.storage.sync.get('plus_favoritas')).plus_favoritas")
    pg.click(f"[data-fav='{B}']"); assert "Clique na ☆" in pg.inner_text("[data-testid=plus-favoritas]")
    # 7) recentes: abrir um processo por aqui registra
    pg.locator(".abrir-proc").first.evaluate("a => { a.removeAttribute('target'); a.href = '#'; }")
    pg.locator(".abrir-proc").first.click(); pg.wait_for_timeout(400)
    assert "5424216-06" in pg.inner_text("[data-testid=plus-recentes]") or "5137277-85" in pg.inner_text("[data-testid=plus-recentes]"), pg.inner_text("[data-testid=plus-recentes]")
    # 8) mudança na esteira atualiza sozinha
    sw.evaluate("async () => { const k = 'esteira_a2'; const x = (await chrome.storage.local.get(k))[k]; await chrome.storage.local.set({ [k]: { ...x, estado: 'conferindo' } }); }")
    espera(pg, "[data-testid=plus-cartao-prontas] b", "2")
    pg.screenshot(path="/tmp/claude-0/work/mob/plus_real.png", full_page=True)
    assert not erros, erros
    ctx.close()
print("OK: Painel Plus")
