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
        { serventia: A, perfil: 'Juiz', url: 'Usuario?PaginaAtual=7&a1=1', linhas: [{ naoAnalisadas: 20, preAnalisadas: 3 }], processos: { naoAnalisadas: [{ processo: '6000000-01', url: 'BuscaProcesso?Id_Processo=77', classificador: 'Sentença' }], preAnalisadas: [{ processo: '6000001-02', url: 'BuscaProcesso?Id_Processo=78', classificador: 'Decisão', dataPreAnalise: '01/11/2026 10:00:00' }] } },
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
    # 9) processos de cada serventia (como no painel completo), dobráveis
    pg.click(f"[data-abrir='{A}']"); lp = pg.inner_text("[data-testid=plus-serventias]"); assert "6000000-01" in lp and "6000001-02" in lp and "pré-analisada" in lp and "Decisão" in lp, lp
    pg.click(f"[data-abrir='{A}']"); assert "6000000-01" not in pg.inner_text("[data-testid=plus-serventias]"), "dobra de novo"
    # 10) ferramentas: todos os atalhos da extensão num lugar só
    tiles = pg.locator("[data-testid=plus-ferramentas] .tile"); assert tiles.count() == 13, tiles.count()
    txt = pg.inner_text("[data-testid=plus-ferramentas]")
    for nome in ["Mandar para análise", "Esteira de minutas", "Painel completo", "SEEU", "Pauta de audiências", "Sentenciar com vídeo", "PDF com OCR", "PDF para texto", "Ferramentas", "Abrir o Studio", "Processos do Projudi", "Minhas serventias", "Modelos do Projudi"]: assert nome in txt, nome
    hrefs = [tiles.nth(i).get_attribute("href") for i in range(13)]; assert "sentenca-video.html" in hrefs and "pauta.html" in hrefs and "seeu.html" in hrefs and "ocr.html" in hrefs and "texto.html" in hrefs, hrefs
    pg.screenshot(path="/tmp/claude-0/work/mob/plus_ferr.png", full_page=True)
    # 10b) o que veio do painel completo: urgentes/ocultar, classificadores, aba Processos, aba Minhas serventias, CSV
    assert "urgentes" in pg.inner_text("[data-testid=plus-serventias]").lower() and pg.locator("[data-ocultar-serv]").count() == 2
    pg.click("#detCls summary"); assert "Sentença" in pg.inner_text("[data-testid=plus-classificadores]") and "Decisão" in pg.inner_text("[data-testid=plus-classificadores]")
    pg.click("[data-testid=plus-aba-procs]"); assert pg.is_visible("[data-testid=plus-procs]") and not pg.is_visible("[data-testid=plus-cartoes]")
    pg.click("[data-testid=plus-p-expandir]"); tp = pg.inner_text("[data-testid=plus-p-conteudo]")
    assert "6000000-01" in tp and "6000001-02" in tp and "Pré-analisadas" in tp and "Não analisadas" in tp, tp
    pg.fill("[data-testid=plus-p-busca]", "6000001"); tp = pg.inner_text("[data-testid=plus-p-conteudo]"); assert "6000001-02" in tp and "6000000-01" not in tp
    pg.fill("[data-testid=plus-p-busca]", ""); pg.select_option("[data-testid=plus-p-visao]", "fila"); assert "6000000-01" in pg.inner_text("[data-testid=plus-p-conteudo]")
    with pg.expect_download() as dl: pg.click("[data-testid=plus-p-csv]")
    csv = Path(dl.value.path()).read_text(encoding="utf-8-sig"); assert "6000000-01" in csv and "\"Serventia\";\"Perfil\"" in csv, csv[:200]
    pg.click("[data-testid=plus-aba-config]"); assert pg.is_visible("[data-testid=plus-config]")
    assert pg.locator("[data-c-ativa]").count() == 2 and pg.locator("[data-c-agaia]").count() == 2
    pg.fill(f"[data-c-agaia='{A}']", "Meu prompt Agaia"); pg.fill(f"[data-c-prompt='{A}']", "Meu prompt Studio"); pg.click(f"[data-c-ativa='{A}']"); pg.wait_for_timeout(400)
    aut = sw.evaluate("async () => (await chrome.storage.sync.get('automacao')).automacao")
    assert aut[A]["promptAgaia"] == "Meu prompt Agaia" and aut[A]["prompt"] == "Meu prompt Studio" and aut[A]["ativa"] is True, aut
    assert "1 de 2 ligadas" in pg.inner_text("#cfgInfo")
    pg.click("[data-testid=plus-aba-geral]")
    pg.click(f"[data-ocultar-serv='{A}']"); assert pg.locator("[data-ocultar-serv]").count() == 1 and "Ocultas (1)" in pg.inner_text("[data-testid=plus-ocultas]")
    pg.click("[data-testid=plus-ocultas] summary"); pg.click(f"[data-reativar-serv='{A}']"); assert pg.locator("[data-ocultar-serv]").count() == 2
    # 11) aba "Mandar para análise": o passo a passo do Inicie aqui dentro do Painel Plus
    pg.click("[data-testid=plus-aba-analise]"); assert pg.is_visible("[data-testid=plus-analise]") and not pg.is_visible("[data-testid=plus-cartoes]")
    qd = pg.frame_locator("#quadro"); qd.locator("text=Passo 1 de 6").wait_for(timeout=10000)
    assert not qd.locator(".hd").is_visible(), "dentro do Plus o cabeçalho do Inicie aqui some"
    assert "Verificar" in qd.locator("body").inner_text()
    pg.screenshot(path="/tmp/claude-0/work/mob/plus_analise.png")
    pg.click("[data-testid=plus-aba-geral]"); assert pg.is_visible("[data-testid=plus-cartoes]") and not pg.is_visible("[data-testid=plus-analise]")
    pg.click("[data-testid=plus-tile-0]"); assert pg.is_visible("[data-testid=plus-analise]"), "o atalho Mandar para análise troca de aba"
    pg.click("[data-testid=plus-aba-geral]")
    # 12) Verificar agora: dispara a leitura (sem abrir outra tela)
    n_abas = len(ctx.pages); pg.click("[data-testid=plus-atualizar]"); assert "Lendo" in pg.inner_text("[data-testid=plus-situacao]"); assert len(ctx.pages) == n_abas
    assert not erros, erros
    ctx.close()
print("OK: Painel Plus")
