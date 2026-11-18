"""“Inicie aqui” (extensão 4.0.2): botões novos na janelinha (Inicie aqui em 1º, Esteira de minutas) e o passo a passo (listagem, serventias, o que fazer, conferir e processar, acompanhar).
Rodar: /usr/bin/python3 tests/e2e_inicie_aqui.py"""
import glob, json, os, shutil, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"; tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
falhas = 0
def ok(c, m):
    global falhas
    if not c: falhas += 1
    print(("ok: " if c else "FALHOU: ") + m)
def proc(n, serv, urg=3): return {"processo": n, "url": "/proc?id=" + n[:7], "serventia": serv, "classificador": "Fulano - minutando", "urgenciaTexto": "", "urgencia": urg, "dataInicio": "01/11/2026", "idPendencia": n, "tipoConclusao": "Despacho", "dataPreAnalise": ""}
def serv(n, procs, perfil="Assessor de Juiz"): return {"serventia": n, "perfil": perfil, "url": "x", "erro": None, "linhas": [{"tipo": "t", "naoAnalisadas": len(procs), "preAnalisadas": 0}], "processos": {"naoAnalisadas": procs, "preAnalisadas": []}}
CIVEL = "Montes Claros de Goiás - Juizado Especial Cível - GO"; VARA = "Montes Claros de Goiás - Vara Qualquer - GO"; FAM = "Montes Claros de Goiás - Vara de Família e Sucessões - GO"; VAZIA = "Montes Claros de Goiás - Vara Vazia - GO"
est = {"status": "ok", "quando": int(time.time() * 1000) - 40 * 60000, "serventias": [serv(CIVEL, [proc("5000001-11.2026.8.09.0166", CIVEL, 1), proc("5000002-22.2026.8.09.0166", CIVEL)]), serv(VARA, [proc("5000003-33.2026.8.09.0166", VARA)]), serv(FAM, [proc("5000004-44.2026.8.09.0166", FAM)]), serv(VAZIA, [])]}
SPY = "() => { window.close = () => {}; window.__tabs = []; window.__msgs = []; chrome.tabs.create = (o) => { window.__tabs.push(o.url); return Promise.resolve({ id: 1 }); }; chrome.runtime.sendMessage = (m) => { window.__msgs.push(m); }; }"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    def abrir(arq, spy=True):
        pg = ctx.new_page(); pg.set_viewport_size({"width": 1100, "height": 900}); pg.goto(base + arq); pg.wait_for_timeout(500)
        if spy: pg.evaluate(SPY)
        return pg
    # ---- janelinha ----
    pg = abrir("popup.html")
    ids = pg.eval_on_selector_all(".menu button", "els => els.map(e => e.id)")
    ok(ids[0] == "inicie" and ids[1] == "painel" and "esteira" in ids and ids[-3:] == ["ocr", "texto", "pauta"] and "ferramentas" in ids, f"ordem: Inicie aqui primeiro, painel completo, Esteira, e as outras opções continuam ({ids})")
    ok("Inicie aqui" in pg.inner_text("#inicie") and "Passo a passo" in pg.inner_text("#inicie"), "o botão tem o texto combinado")
    cor = pg.locator("#inicie").evaluate("(e) => getComputedStyle(e).backgroundImage + '|' + getComputedStyle(e).color"); ok("rgb(22, 163, 74)" in cor, f"destacado em verde ({cor[:60]})")
    pg.screenshot(path="/tmp/claude-0/work/teste/popup_novo.png")
    pg.click("#inicie"); pg.wait_for_timeout(200); ok(pg.evaluate("window.__tabs") == [base + "iniciar.html"], f"Inicie aqui abre a página do passo a passo ({pg.evaluate('window.__tabs')})")
    pg.close(); pg = abrir("popup.html"); pg.click("#esteira"); pg.wait_for_timeout(200); ok(pg.evaluate("window.__tabs") == [base + "esteira.html"], "Esteira de minutas abre a esteira"); pg.close()
    pg = abrir("popup.html"); pg.click("#painel"); pg.wait_for_timeout(200); ok(pg.evaluate("window.__tabs") == [base + "painel.html"], "o painel completo continua abrindo o painel de sempre"); pg.close()
    # ---- passo 1: nunca verificou ----
    pg = abrir("iniciar.html"); t = pg.inner_text("#app")
    ok("Passo 1 de 5" in t and pg.locator("[data-testid=iniciar-verificar]").count() == 1 and pg.locator("[data-acao=continuar]").is_disabled(), "sem listagem: só o botão Verificar agora; Continuar bloqueado")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo1_primeira_vez.png")
    pg.click("[data-testid=iniciar-verificar]"); ok(pg.evaluate("window.__msgs") == [{"acao": "verificar"}], "Verificar agora pede a verificação ao Projudi"); pg.close()
    # ---- passo 1: listagem pronta ----
    sw.evaluate("(e) => chrome.storage.local.set({ estado: e })", est); sw.evaluate("() => chrome.storage.sync.set({ automacao: {}, ocultas: { servs: [], cargos: [] } })")
    pg = abrir("iniciar.html"); t = pg.inner_text("#app")
    ok(pg.locator("[data-testid=iniciar-pronta]").count() == 1 and "há 40 min" in t and "hoje," in pg.inner_text("[data-testid=iniciar-quando]"), f"mostra a listagem pronta, a data da última verificação e há quanto tempo: {pg.inner_text('[data-testid=iniciar-quando]')}")
    ok(pg.locator("[data-testid=iniciar-atualizar]").count() == 1 and "4" in pg.inner_text(".kp") and "1" in pg.inner_text(".kp"), "tem o botão Atualizar a listagem e os totais")
    ok(pg.locator("[data-acao=continuar]").is_enabled(), "Continuar liberado")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo1_pronta.png")
    pg.click("[data-testid=iniciar-atualizar]"); ok(pg.evaluate("window.__msgs") == [{"acao": "verificar"}], "Atualizar a listagem refaz a verificação")
    # ---- passo 2: serventias ----
    pg.click("[data-acao=continuar]"); t = pg.inner_text("#app"); ok("Passo 2 de 5" in t and "Onde você trabalha" in t and pg.locator("button.sw").count() == 4, "passo 2: uma linha por serventia, com liga/desliga")
    ok(pg.locator("[data-acao=continuar]").is_disabled(), "com todas desligadas, Continuar fica bloqueado")
    pg.click(f"button.sw[data-serv='{CIVEL}']"); pg.click(f"button.sw[data-serv='{VARA}']"); pg.wait_for_timeout(200)
    ok("2 serventias ligadas" in pg.inner_text("[data-testid=iniciar-resumo2]") and "3 processos" in pg.inner_text("[data-testid=iniciar-resumo2]"), f"resumo: {pg.inner_text('[data-testid=iniciar-resumo2]')}")
    a = sw.evaluate("() => chrome.storage.sync.get('automacao')")["automacao"]; ok(a[CIVEL]["ativa"] is True and a[VARA]["ativa"] is True and FAM not in a, "o que foi ligado fica guardado (o painel completo enxerga o mesmo)")
    pg.click(f"[data-ocultar='{VAZIA}']"); pg.wait_for_timeout(200)
    oc = sw.evaluate("() => chrome.storage.sync.get('ocultas')")["ocultas"]; ok(oc["servs"] == [VAZIA] and pg.locator("button.sw").count() == 3, "Ocultar esconde a serventia e guarda")
    pg.click("[data-acao=veroc]"); ok(pg.locator(f"[data-reativar='{VAZIA}']").count() == 1, "Mostrar ocultas lista a serventia com Reativar")
    pg.click(f"[data-reativar='{VAZIA}']"); pg.wait_for_timeout(200); ok(pg.locator("button.sw").count() == 4, "Reativar traz de volta")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo2.png")
    # ---- passo 3: o que fazer ----
    pg.click("[data-acao=continuar]"); ok("Passo 3 de 5" in pg.inner_text("#app") and pg.locator("[data-testid=iniciar-modo-studio].sel").count() == 1, "passo 3: Analisar no Studio vem selecionado")
    ok(pg.locator("input[data-prompt]").count() == 2 and "Juizado Especial Cível" in pg.locator(f"input[data-prompt='{CIVEL}']").get_attribute("placeholder"), "um campo de prompt por serventia ligada, com o prompt sugerido")
    pg.click("[data-acao=continuar]"); pg.wait_for_timeout(300)
    ok(pg.locator("[data-testid=iniciar-aviso]").count() == 1 and "prompt do Studio" in pg.inner_text("#app") and "Passo 3 de 5" in pg.inner_text("#app"), f"serventia sem prompt sugerido: avisa e não deixa seguir ({pg.inner_text('#app')[:80]!r})")
    pg.fill(f"input[data-prompt='{VARA}']", "Outros Área Judicial - Vara Qualquer"); pg.locator(f"input[data-prompt='{VARA}']").dispatch_event("change")
    pg.click("[data-testid=iniciar-modo-agaia]"); ok(pg.locator("[data-testid=iniciar-aviso-agaia]").count() == 1 and "IGUAL ao cadastrado no Agaia" in pg.inner_text("[data-testid=iniciar-aviso-agaia]") and pg.locator("input[data-promptagaia]").count() == 2, "Agaia: aviso do nome igual e um campo de nome por serventia")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo3_agaia.png")
    pg.click("[data-testid=iniciar-modo-studio]")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo3.png")
    # ---- passo 4: conferir e processar (Studio) ----
    pg.click("[data-acao=continuar]"); t = pg.inner_text("#app"); ok("Passo 4 de 5" in t and "3 (os mais urgentes primeiro)" in pg.inner_text("[data-testid=iniciar-qtd]") and "Processar 3 processos" in t, f"passo 4: resumo e botão com a quantidade ({pg.inner_text('[data-testid=iniciar-qtd]')})")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo4.png")
    pg.click("[data-acao=continuar]"); pg.wait_for_selector("[data-testid=iniciar-feitos]", timeout=8000)
    tabs = pg.evaluate("window.__tabs"); ok(len(tabs) == 1 and "lote.html?lote=" in tabs[0], f"Processar abre a fila de downloads do painel completo ({tabs})")
    lote = sw.evaluate("async () => { const t = await chrome.storage.local.get(null); const k = Object.keys(t).find((x) => x.startsWith('lote_')); return t[k]; }")
    ok(lote and [i["processo"] for i in lote["itens"]] == ["5000001-11.2026.8.09.0166", "5000002-22.2026.8.09.0166", "5000003-33.2026.8.09.0166"], f"a fila vai na ordem de urgência (urgente primeiro): {[i['processo'][:7] for i in (lote or {}).get('itens', [])]}")
    ok(lote["opcoes"]["studio"]["ativo"] is True and lote["itens"][2]["prompt"] == "Outros Área Judicial - Vara Qualquer" and lote["itens"][0]["prompt"] == "Outros Área Judicial - Juizado Especial Cível", "com o Studio ligado e o prompt de cada serventia")
    # ---- passo 5: acompanhar ----
    ok("0 de 3" in pg.inner_text("[data-testid=iniciar-feitos]") and "Passo 5" in pg.inner_text("#app") or "Enviando seus processos para o Studio" in pg.inner_text("#app"), "passo 5: acompanhamento começa em 0 de 3")
    sw.evaluate("() => chrome.storage.local.set({ esteira_ordem: ['t1', 't2'], esteira_t1: { id: 't1', processo: '5000001-11.2026.8.09.0166', estado: 'concluido', modo: 'analise' }, esteira_t2: { id: 't2', processo: '5000002-22.2026.8.09.0166', estado: 'analisando', modo: 'analise' } })")
    pg.wait_for_function("() => document.querySelector('[data-testid=iniciar-feitos]').innerText.startsWith('1 de 3')", timeout=8000); ok(True, "o andamento acompanha a esteira (1 de 3 pronto)")
    t = pg.inner_text("#app"); ok("Minuta pronta" in t and "Analisando" in t, "mostra o estado de cada processo")
    pg.screenshot(path="/tmp/claude-0/work/teste/inicie_passo5.png")
    pg.click("[data-acao=esteira]"); ok(base + "esteira.html" in pg.evaluate("window.__tabs"), "botão Ver a Esteira completa")
    pg.close()
    # ---- Agaia: enfileira na esteira ----
    sw.evaluate("() => chrome.storage.local.remove(['iniciar_job','esteira_ordem','esteira_t1','esteira_t2'])")
    pg = abrir("iniciar.html"); pg.click("[data-acao=continuar]"); pg.click("[data-acao=continuar]"); pg.click("[data-testid=iniciar-modo-agaia]")
    pg.fill(f"input[data-promptagaia='{CIVEL}']", "Fabrício Juizado Cível"); pg.locator(f"input[data-promptagaia='{CIVEL}']").dispatch_event("change")
    pg.click("[data-acao=continuar]"); pg.click("[data-acao=continuar]"); pg.wait_for_selector("[data-testid=iniciar-feitos]", timeout=8000)
    its = sw.evaluate("async () => { const t = await chrome.storage.local.get(null); return (t.esteira_ordem || []).map((id) => t['esteira_' + id]); }")
    ok(len(its) == 3 and all(i["modo"] == "agaia" for i in its) and [i["prompt"] for i in its if i["serventia"] == CIVEL] == ["Fabrício Juizado Cível"] * 2, f"Agaia: 3 processos na esteira, com o nome do prompt do Agaia ({[(i['modo'], i['prompt'][:14]) for i in its]})")
    ok({"acao": "esteira-abrir"} in pg.evaluate("window.__msgs"), "pede para abrir a esteira")
    pg.close()
    # ---- painel completo intacto ----
    pg = abrir("painel.html", spy=False); pg.wait_for_selector("#enviarAgaia", timeout=15000); ok(pg.locator("#baixarLote").count() == 1 and "Resumo por serventia" in pg.inner_text("#conteudo"), "o painel completo continua igual")
    ctx.close()
print("FALHAS:", falhas); raise SystemExit(1 if falhas else 0)
