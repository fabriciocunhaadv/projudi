"""Painel do SEEU (seeu.html) carregado com um chrome falso: sem erro de script, cartão de envio escondido até haver lista, e o fluxo "Enviar marcados" manda o pedido certo (pedido interceptado + metodo + origem seeu)."""
import os
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extensao"))
html = open(os.path.join(RAIZ, "seeu.html"), encoding="utf-8").read()
for n in ("seeu-diag.js", "seeu-ler.js", "seeu.js"): html = html.replace(f'<script src="{n}"></script>', "<script>" + open(os.path.join(RAIZ, n), encoding="utf-8").read() + "</script>")
FALSO = """
window.__msgs = []; const st = { seeu_marcados: null };
const proc = { ok: true, processos: [{ idConclusao: '1', numero: '7000035-12.2024.8.09.0117', urgente: false, prioridade: true, reuPreso: true, entrada: '17/11/2026', tipo: 'DESPACHO', partes: [], agrupador: '', temAnalisar: true, analisarHref: 'https://seeu.pje.jus.br/seeu/processo/conclusao.do?_tj=t' }, { idConclusao: '2', numero: '7000001-01.2020.8.09.0117', urgente: false, prioridade: false, reuPreso: false, entrada: '01/09/2026 17:23', tipo: 'DECISÃO', partes: [], agrupador: '', temAnalisar: true, analisarHref: 'https://seeu.pje.jus.br/seeu/processo/conclusao.do?_tj=u' }], total: 2, contador: '1 registro(s)', aviso: '' };
const quadro = { areas: [{ nome: 'TJXX - Vara A' }, { nome: 'TJXX - Vara B' }], atual: 'TJXX - Vara A', fonte: 'tela' };
window.chrome = {
  permissions: { contains: async () => true, request: async () => true },
  tabs: { query: async () => [{ id: 7, active: true }], create: async (o) => ({ id: 99 }), remove: async () => {}, get: async () => ({ status: 'complete' }), onUpdated: { addListener() {}, removeListener() {} }, onRemoved: { addListener() {} } },
  storage: { local: { get: async (k) => { const o = {}; for (const x of [].concat(k)) { if (String(x).startsWith('lote_fim_')) o[x] = { ok: true, paginas: 12, studio: { fila: true } }; } return o; }, set: async () => {} }, sync: { get: async () => ({ automacao: {} }) } },
  runtime: { sendMessage: async (m) => { window.__msgs.push(m); return { ok: true }; } },
  scripting: { executeScript: async ({ func, args, world }) => {
    const n = func.name;
    if (n === 'lerAreasSeeu') return [{ result: quadro }];
    if (n === 'lerAtuacaoSeeu') return [{ result: { atual: 'TJXX - Vara A' } }];
    if (n === 'abrirMenuConclusoesSeeu' || n === 'lerMenuConclusoesSeeu') return [{ result: { ok: true } }];
    if (n === 'lerConclusoesSeeu') return [{ result: proc }];
    if (n === 'descobrirExportarSeeu') return [{ result: { ok: true, exportarUrl: 'https://seeu.pje.jus.br/seeu/processo/exportar.do?_tj=tok', passos: [] } }];
    if (n === 'capturarExportarSeeu') return [{ result: { via: 'submit()', url: 'https://seeu.pje.jus.br/seeu/processo/exportar.do?actionType=exportar', metodo: 'post', campos: [['arquivos', '1-0.1'], ['arquivos', '2-0.2']] } }];
    return [{ result: null }];
  } }
};
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox']); pg = b.new_page(); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
    STUB = "export async function lerPromptDoStudio() { throw Object.assign(new Error('x'), { opcoes: ['Decisão — execução penal', 'Despacho — execução penal'] }); }"
    pg.route("**/*", lambda r: r.fulfill(body=STUB, content_type="text/javascript") if r.request.url.endswith("studio-cliente.js") else r.fulfill(body=open(os.path.join(RAIZ, r.request.url.split("/")[-1]), encoding="utf-8").read(), content_type="text/javascript") if r.request.url.endswith(".js") else r.fulfill(body=html, content_type="text/html; charset=utf-8")); pg.add_init_script(FALSO)
    pg.goto("http://painel.test/seeu.html"); pg.wait_for_timeout(600)
    assert pg.locator("#p1").is_visible() and not pg.locator("#p3").is_visible() and pg.locator("#go1").is_enabled()
    pg.click("#go1"); assert pg.locator("#p2").is_visible()
    assert "TJXX - Vara A" in pg.inner_text("#areas") and "LOGADO AQUI" in pg.inner_text("#areas")
    pg.click("#p2 [data-go='3']"); assert pg.locator("#go3").is_disabled()
    pg.click("#btnRemetidos"); pg.wait_for_selector("#lista table", timeout=15000)
    ordem = pg.locator("#lista table tr td:nth-child(2)").all_inner_texts(); assert ordem[0].startswith("7000001-01.2020") and ordem[1].startswith("7000035-12.2024"), ordem      # mais antigo primeiro
    pg.check("input[data-i='1']"); assert pg.locator("#go3").is_enabled()
    pg.click("#go3"); assert pg.locator("#p4").is_visible()
    pg.wait_for_function("document.querySelectorAll('#selPrompt option').length > 1")
    assert [o for o in pg.locator("#selPrompt option").all_inner_texts()][1:] == ["Decisão — execução penal", "Despacho — execução penal"]      # a lista do Studio
    pg.click("#btnEnviar"); pg.wait_for_timeout(200); assert "Escolha o prompt" in pg.inner_text("#msg") and not pg.evaluate("window.__msgs.length")
    pg.select_option("#selPrompt", "Decisão — execução penal"); pg.click("#btnEnviar"); pg.wait_for_selector("#passos .ok", timeout=20000)
    assert pg.locator("#p5").is_visible()
    m = pg.evaluate("window.__msgs"); assert len(m) == 1, m
    m = m[0]; assert m["acao"] == "gerar-pdf-interceptar" and m["origem"] == "seeu" and m["metodo"] == "post" and m["corpo"] == "arquivos=1-0.1&arquivos=2-0.2" and m["nome"] == "7000035-12.2024.8.09.0117", m
    assert m["studio"]["ativo"] and m["studio"]["modo"] == "analise" and m["studio"]["prompt"] == "Decisão — execução penal" and m["studio"]["serventia"] == "TJXX - Vara A" and m["lote"].startswith("seeu_"), m["studio"]
    pg.click("#p5 [data-go='3']"); pg.click("#go3"); pg.click("#opcoes .opt[data-v='ia:minutaia']"); pg.click("#btnEnviar"); pg.wait_for_function("window.__msgs.length >= 2", timeout=20000)
    m2 = pg.evaluate("window.__msgs")[-1]; assert m2["studio"]["modo"] == "ia" and m2["studio"]["iaId"] == "minutaia", m2["studio"]
    assert not erros, erros
    print("OK"); b.close()
