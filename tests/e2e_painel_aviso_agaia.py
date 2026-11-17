"""Painel: aviso destacado perto do botão "Enviar ao Agaia" (o nome do prompt tem de ser IGUAL ao cadastrado no Agaia), alerta na coluna "Prompt no ExecAgaia"
e lista das serventias que ainda não têm o nome do prompt do Agaia. Rodar: python3 tests/e2e_painel_aviso_agaia.py"""
import glob, os, shutil, tempfile, json
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"; tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
falhas = 0
def ok(c, m):
    global falhas
    if not c: falhas += 1; print("FALHOU:", m)
    else: print("ok:", m)
def proc(n, serv): return {"processo": n, "url": "x", "serventia": serv, "classificador": "Fulano - minutando", "urgenciaTexto": "", "dataInicio": "01/11/2026", "idPendencia": n, "tipoConclusao": "Despacho", "dataPreAnalise": ""}
def serv(n, procs): return {"serventia": n, "perfil": "Assessor", "url": "x", "erro": None, "linhas": [{"tipo": "t", "naoAnalisadas": len(procs), "preAnalisadas": 0}], "processos": {"naoAnalisadas": procs, "preAnalisadas": []}}
est = {"status": "ok", "quando": 1, "serventias": [serv("Vara A", [proc("5000001-11.2026.8.09.0166", "Vara A")]), serv("Vara B", [proc("5000002-22.2026.8.09.0166", "Vara B")])]}
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    sw.evaluate("(e) => chrome.storage.local.set({ estado: e })", est)
    sw.evaluate("() => chrome.storage.sync.set({ automacao: { 'Vara A': { ativa: true, prompt: 'Outros Área Judicial - Cível', promptAgaia: 'Fabrício Cível' }, 'Vara B': { ativa: true, prompt: 'Outros Área Judicial - Família' } } })")
    def abrir():
        pg = ctx.new_page(); pg.goto(base + "painel.html"); pg.wait_for_selector("#enviarAgaia", timeout=15000); return pg
    pg = abrir(); pg.wait_for_selector("[data-testid=aviso-agaia]", timeout=15000)
    t = pg.inner_text("[data-testid=aviso-agaia]")
    ok("IGUAL ao cadastrado no Agaia" in t and "Prompt no ExecAgaia" in t and "exatamente como está cadastrado no Agaia" in t and "copiar e colar" in t, "o aviso explica que o nome tem de ser igual ao do Agaia e onde digitar")
    ok(pg.locator("[data-testid=aviso-agaia]").evaluate("(e) => { const b = document.getElementById('enviarAgaia'); return !!(e.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && b.parentElement === e.parentElement; }"), "o aviso fica logo ANTES do botão de enviar ao Agaia (mesmo bloco)")
    cor = pg.locator("[data-testid=aviso-agaia]").evaluate("(e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).borderTopWidth")
    ok("255, 244, 214" in cor and cor.endswith("|2px"), f"é destacado (fundo amarelo e borda grossa): {cor}")
    f = pg.inner_text("[data-testid=aviso-agaia-faltam]")
    ok("Vara B" in f and "Vara A" not in f, f"lista só a serventia SEM o nome do prompt do Agaia: {f[:100]}")
    ok("IGUAL ao cadastrado no Agaia" in pg.inner_text("th.th-agaia"), "a coluna 'Prompt no ExecAgaia' também traz o alerta")
    ok("igual ao do Agaia" in pg.locator("input[data-promptagaia]").first.get_attribute("placeholder"), "o campo pede o nome igual ao do Agaia")
    ok(pg.locator("[data-testid=agaia-igual]").count() == 1 and pg.locator("[data-testid=agaia-ocultar]").count() == 1, "tem os dois botões: 'meu prompt é igual ao do Studio' e 'já entendi, não mostrar mais'")
    pg.screenshot(path="/tmp/claude-0/work/teste/painel_aviso_agaia.png", full_page=True)
    # 1) “Meu prompt é igual ao do Studio”: o aviso some e a confirmação fica guardada
    pg.click("[data-testid=agaia-igual]"); pg.wait_for_timeout(500)
    ok(pg.locator("[data-testid=aviso-agaia]").count() == 0 and pg.locator("th.th-agaia .alerta-agaia").count() == 0, "confirmar que o prompt é igual faz o aviso (e o alerta da coluna) sumirem")
    ok(sw.evaluate("() => chrome.storage.sync.get('automacao')")["automacao"]["Vara B"].get("agaiaIgual") is True, "a confirmação ficou guardada na serventia")
    pg.close(); pg = abrir(); ok(pg.locator("[data-testid=aviso-agaia]").count() == 0, "continua sem aparecer ao reabrir o painel")
    pg.close()
    # 2) quem JÁ escreveu o nome do Agaia em todas não vê o aviso
    sw.evaluate("() => chrome.storage.sync.set({ automacao: { 'Vara A': { ativa: true, prompt: 'P', promptAgaia: 'Fabrício Cível' }, 'Vara B': { ativa: true, prompt: 'Q', promptAgaia: 'Fabrício Família' } } })")
    pg = abrir(); ok(pg.locator("[data-testid=aviso-agaia]").count() == 0 and pg.locator("[data-testid=agaia-mostrar]").count() == 0, "com o nome do Agaia escrito em todas as serventias, nada aparece")
    pg.close()
    # 3) digitar o nome faz o aviso sumir na hora
    sw.evaluate("() => chrome.storage.sync.set({ automacao: { 'Vara A': { ativa: true, prompt: 'P', promptAgaia: 'Fabrício Cível' }, 'Vara B': { ativa: true, prompt: 'Q' } } })")
    pg = abrir(); pg.wait_for_selector("[data-testid=aviso-agaia]")
    pg.fill("input[data-promptagaia='Vara B']", "Fabrício Família"); pg.locator("input[data-promptagaia='Vara B']").dispatch_event("change"); pg.wait_for_timeout(600)
    ok(pg.locator("[data-testid=aviso-agaia]").count() == 0, "ao digitar o nome do prompt do Agaia, o aviso some sozinho")
    pg.close()
    # 4) “Já entendi, não mostrar mais”: some, deixa um link discreto e vale ao reabrir; o link traz o aviso de volta
    sw.evaluate("() => chrome.storage.sync.set({ automacao: { 'Vara A': { ativa: true, prompt: 'P' }, 'Vara B': { ativa: true, prompt: 'Q' } } })")
    pg = abrir(); pg.wait_for_selector("[data-testid=aviso-agaia]"); pg.click("[data-testid=agaia-ocultar]"); pg.wait_for_timeout(500)
    ok(pg.locator("[data-testid=aviso-agaia]").count() == 0 and pg.locator("[data-testid=agaia-mostrar]").count() == 1, "'Já entendi' esconde o aviso e deixa um link para mostrar de novo")
    ok(sw.evaluate("() => chrome.storage.sync.get('agaiaAvisoOculto')")["agaiaAvisoOculto"] is True, "a escolha ficou guardada")
    pg.close(); pg = abrir(); ok(pg.locator("[data-testid=aviso-agaia]").count() == 0 and pg.locator("[data-testid=agaia-mostrar]").count() == 1, "ao reabrir continua escondido")
    pg.click("[data-testid=agaia-mostrar]"); pg.wait_for_selector("[data-testid=aviso-agaia]", timeout=5000); ok(True, "o link mostra o aviso de novo")
    pg.close(); ctx.close()
print("FALHAS:", falhas); raise SystemExit(1 if falhas else 0)
