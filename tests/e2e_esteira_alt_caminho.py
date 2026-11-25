"""Esteira: quando a Agaia (ou uma IA externa) dá erro, a própria linha oferece "Rodar no Studio", "Rodar em outra IA" e a escolha do prompt (cadastro do Studio)."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
def item(i, **k):
    return {"id": i, "processo": f"500000{ord(i)}-00.2026.8.09.0166", "estado": "erro", "erro": "Agaia: falhou", "url": "BuscaProcesso?x=1", "serventia": "Vara Y", "pdfNome": "x.pdf", **k}
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    STUDIO = """<!doctype html><title>Studio de teste</title><script>
window.addEventListener("projudi:pedir-prompt", () => { const p = JSON.parse(document.documentElement.dataset.projudiPromptPedido); const lista = ["Prompt A", "Prompt Studio B", "Prompt Studio C"]; const ok = lista.includes(p.nome);
  document.documentElement.dataset.projudiPromptResposta = JSON.stringify(ok ? { reqId: p.reqId, ok: true, texto: "texto do " + p.nome } : { reqId: p.reqId, ok: false, erro: "prompt não encontrado", opcoes: lista }); });
</script><body>Studio de teste</body>"""
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    itens = [item("a", modo="agaia", prompt="Prompt A"), item("b", modo="agaia", sigiloso=True, prompt="Prompt A"), item("c", modo="ia", iaId="chatgpt", prompt="Prompt A"), item("d", modo="agaia"), item("e", modo="agaia", prompt="Prompt A"), item("f", modo="analise", erro="x", prompt="Prompt A")]
    sw.evaluate("async (d) => { const o = {}; for (const i of d) o['esteira_' + i.id] = i; await chrome.storage.local.set({ ...o, esteira_ordem: d.map((i) => i.id) }); await chrome.storage.sync.set({ automacao: { 'Outra Vara': { prompt: 'Prompt do Painel 1' }, 'Mais uma': { prompt: 'Prompt do Painel 2' } } }); }", itens)
    studio = ctx.new_page(); studio.route("https://judicial-mysql.assessor.net.br/**", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=STUDIO)); studio.goto("https://judicial-mysql.assessor.net.br/"); studio.wait_for_timeout(1500)
    pg = ctx.new_page(); pg.goto(base + "esteira.html"); pg.wait_for_selector("[data-testid=alt-caminho]", timeout=15000)
    blocos = pg.locator("[data-testid=alt-caminho]"); assert blocos.count() == 4, f"4 linhas da Agaia/IA com erro têm o bloco; a de segredo de justiça e a do Studio não ({blocos.count()})"
    linha = lambda i: pg.locator(f"tr:has(button[data-a=excluir][data-id={i}])")
    assert linha("a").locator("button[data-a=rodar-studio]").count() == 1 and linha("a").locator("select[data-a-ia]").count() == 1 and linha("a").locator("select[data-pp]").count() == 1
    assert linha("b").locator("button[data-a=sigilo-studio]").count() == 1 and linha("b").locator("select[data-a-ia]").count() == 0 and linha("b").locator("[data-testid=alt-caminho]").count() == 0, "segredo de justiça: só os botões próprios (Studio / Agaia com PDF), nunca IA externa"
    ops = linha("c").locator("select[data-a-ia] option").all_inner_texts(); assert "ChatGPT" not in ops and "Gemini" in ops and "Claude" in ops and "Minuta IA" in ops and "IA do Jusbrasil" in ops, ops
    ops = linha("a").locator("select[data-a-ia] option").all_inner_texts(); assert all(x in " ".join(ops) for x in ["ChatGPT", "Gemini", "Claude", "Minuta IA", "IA do Jusbrasil"]), ops
    assert linha("f").locator("[data-testid=alt-caminho]").count() == 0
    pg.screenshot(path="/tmp/claude-0/work/mob/esteira_alt.png")
    lotes = lambda: sw.evaluate("async () => { const t = await chrome.storage.local.get(null); return Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('lote_'))); }")
    # 1) Rodar no Studio (a linha já tem um prompt que o Studio conhece)
    with ctx.expect_page() as nova:
        linha("a").locator("button[data-a=rodar-studio]").click()
    nova.value.close(); pg.wait_for_timeout(500)
    l = list(lotes().values()); assert len(l) == 1, l
    st = l[0]["opcoes"]["studio"]; assert st["modo"] == "analise" and st["ativo"] and l[0]["itens"][0]["prompt"] == "Prompt A" and l[0]["itens"][0]["itemId"] == "a", l[0]
    a = sw.evaluate("async () => (await chrome.storage.local.get('esteira_a')).esteira_a"); assert a["estado"] == "pausado" and "Studio" in a["aviso"] and a["id"] == "a", a
    # 2) Rodar em outra IA (Gemini): a autorização é pedida no clique; aqui a simulamos concedida
    pg.evaluate("() => { const f = async () => true; for (const k of ['contains', 'request']) Object.defineProperty(chrome.permissions, k, { value: f, configurable: true, writable: true }); }")
    pg.evaluate("() => { const o = Object.defineProperty }")
    with ctx.expect_page() as nova:
        pg.select_option("tr:has(button[data-a=excluir][data-id=e]) select[data-a-ia]", "gemini")
    pg.bring_to_front()
    # a tela da linha muda NA HORA (a lista continua com o foco, mas não pode segurar o redesenho): some o erro da Agaia e aparece o andamento
    pg.wait_for_selector("tr:has(button[data-a=excluir][data-id=e]):has-text('Baixando o PDF')", timeout=5000)
    assert pg.locator("tr:has(button[data-a=excluir][data-id=e]):has-text('Agaia: falhou')").count() == 0, "o erro antigo da Agaia continua na tela"
    nova.value.close(); pg.wait_for_timeout(300)
    e = sw.evaluate("async () => (await chrome.storage.local.get('esteira_e')).esteira_e"); assert e["estado"] == "pausado" and "Gemini" in e["aviso"], e
    l = [x for x in lotes().values() if x["itens"][0]["itemId"] == "e"]; assert l and l[0]["opcoes"]["studio"]["modo"] == "ia" and l[0]["opcoes"]["studio"]["iaId"] == "gemini", l
    # 3) prompt escolhido pela pessoa (select da linha) vale sobre o automático
    # 3) o prompt escolhido na própria linha vale sobre o automático (lista = cadastro do Studio)
    sw.evaluate("async () => { await chrome.storage.local.set({ esteira_a: { ...(await chrome.storage.local.get('esteira_a')).esteira_a, estado: 'erro' } }); }"); pg.reload(); pg.wait_for_selector("select[data-pp]")
    pg.wait_for_function("document.querySelector('tr select[data-pp]').options.length > 3", timeout=20000)
    assert linha("a").locator("select[data-pp] option").all_inner_texts()[1:] == ["Prompt A", "Prompt Studio B", "Prompt Studio C"], "a lista de prompts da linha vem do Studio, não do Painel"
    linha("a").locator("select[data-pp]").select_option("Prompt Studio B"); pg.wait_for_timeout(300)
    with ctx.expect_page() as nova:
        linha("a").locator("button[data-a=rodar-studio]").click()
    nova.value.close(); pg.wait_for_timeout(500)
    assert [x for x in lotes().values() if x["itens"][0]["itemId"] == "a" and x["itens"][0]["prompt"] == "Prompt Studio B"], "usou o prompt escolhido na linha"
    # 4) sem prompt automático: o Studio responde com a lista do cadastro da pessoa e ela escolhe
    pg.reload(); pg.wait_for_selector("[data-testid=alt-caminho]")
    linha("d").locator("button[data-a=rodar-studio]").click(); pg.wait_for_selector("#escPrompt", timeout=30000)
    ops = pg.locator("#escPrompt option").all_inner_texts(); assert "Prompt Studio C" in ops and "Prompt do Painel 1" not in ops, ops
    with ctx.expect_page() as nova:
        pg.select_option("#escPrompt", "Prompt Studio C"); pg.click("#escOk")
    nova.value.close(); pg.wait_for_timeout(500)
    d = [x for x in lotes().values() if x["itens"][0]["itemId"] == "d"]; assert d and d[0]["itens"][0]["prompt"] == "Prompt Studio C", d
    # 5) desistir da janelinha não muda nada
    sw.evaluate("async () => { await chrome.storage.local.set({ esteira_d: { ...(await chrome.storage.local.get('esteira_d')).esteira_d, estado: 'erro', prompt: '' } }); }")
    pg.reload(); pg.wait_for_selector("[data-testid=alt-caminho]")
    linha("d").locator("button[data-a=rodar-studio]").click(); pg.wait_for_selector("#escPrompt", timeout=30000); pg.click("#escCancelar"); pg.wait_for_timeout(300)
    assert sw.evaluate("async () => (await chrome.storage.local.get('esteira_d')).esteira_d.estado") == "erro", "cancelar mantém a linha como estava"
    ctx.close()
print("OK")
