"""Pauta de audiências: serventia, lista (ISO-8859-1), análise dos autos e layout da pauta (dados fictícios)."""
import glob
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent; FIX = Path(__file__).parent / "fixtures"
lista = (FIX / "audiencias.html").read_text(encoding="utf-8").replace("Maria Teste", "Antônio José Teste")
serv = '<html><body data-usuario-id="1"><fieldset><legend>Comarca Teste - Vara Cível</legend><a href="Usuario?PaginaAtual=7&Id=9">Assessor</a></fieldset></body></html>'
TEXTO = """[Página 1]
Movimentação 32 : DENÚNCIA
O Ministério Público oferece denúncia contra FULANO DE TAL, pelo art. 147 do Código Penal, fato ocorrido no dia 07/09/2023.
Data de nascimento: 15/01/2002
Vítima: Beltrana de Souza Lima
Rol de testemunhas:
1. Cicrano Alves Pereira
2. Josuel Alves dos Santos

[Página 2]
Movimentação 58 : CERTIDÃO
Certifico que o réu FULANO DE TAL foi intimado.
Movimentação 57 : CERTIDÃO
Certifico que Cicrano Alves Pereira não foi localizado, endereço inexistente.
Movimentação 64 : MANDADO
Josuel Alves dos Santos intimado.
Movimentação 41 : DECISÃO
Recebo a denúncia."""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox", "--allow-file-access-from-files"])
    pg = b.new_page()
    def rota(r):
        u = r.request.url
        if "PaginaAtual=9" in u: body = serv
        elif "Audiencia?" in u: body = lista.replace('href="Audiencia?PaginaAtual=3&Pagina=2"', 'href="#"')
        else: body = "<html></html>"
        r.fulfill(status=200, headers={"content-type": "text/html; charset=iso-8859-1"}, body=body.encode("latin-1", "replace"))
    pg.route("https://projudi.tjgo.jus.br/**", rota)
    pg.add_init_script("window.chrome = window.chrome || {}; chrome.storage = { local: { set: async()=>{}, get: async()=>({}) }, onChanged: { addListener(){} } }; chrome.tabs = { create(){} }; chrome.runtime = { getURL: (x)=>x };")
    pg.goto("file://" + str(RAIZ / "extensao" / "pauta.html"))
    pg.wait_for_function("document.querySelectorAll('#serv option').length > 1")
    pg.select_option("#serv", "0"); pg.click("#gerar"); pg.wait_for_selector(".folha", timeout=15000)
    t = pg.inner_text("#saida"); assert "antônio josé teste" in t.lower() and "13:30" in t and "Audiências 10/11/2026" in t, t
    ata = '<div class="ata"><p class="meta"><span class="rot">Vítima:</span> <b>Beltrana de Souza Lima</b></p><table><thead><tr><th>Testemunha</th><th>Indicada por</th><th>Onde foi indicada</th><th>Intimação</th><th>Onde consta a intimação</th></tr></thead><tbody><tr><td>Cicrano Alves Pereira</td><td>Autor</td><td>Mov. 3</td><td>Não intimada</td><td>Mov. 57, Arq. 1, Pág. 2</td></tr><tr><td>Josuel Alves dos Santos</td><td>Autor</td><td>Mov. 3</td><td>Intimada (10/05/2026)</td><td>Mov. 64, Arq. 2, Pág. 1</td></tr></tbody></table><div class="quadro"><p class="qt">ATENÇÃO</p><ul><li class="alto">Depoimento pessoal da parte contrária: pedido do réu — NÃO analisado (Mov. 5)</li></ul></div></div>'
    lido = {"abas": {"briefing": "Resumo Fático da Lide\nAção penal pelo art. 147 do Código Penal. Fato em 07/09/2023. Denúncia mov. 32.", "deliberacoes": "Recebimento da denúncia mov. 41"}, "ataHtml": ata}
    # cível/Fazenda (sem MP e sem artigo penal): AUTOR = promovente, RÉU = promovido (antes saía invertido, com o réu na coluna AUTOR)
    assert pg.locator("table.p thead th", has_text="RÉU").count() >= 1, t
    cels = pg.locator("table.p tbody tr").first.locator("td .cel").all_inner_texts()
    assert "antônio josé teste" in cels[1].lower() and "empresa x" in cels[2].lower(), cels
    # criminal (promovente = Ministério Público): AUTOR = réu do fato; coluna VÍTIMA/TESTEMUNHAS
    pg.evaluate("""() => { const g = window.__pauta; g.set([{ processo: '0057388.42', data: '2026-11-20', hora: '14:00', status: 'A Realizar', promovente: 'MINISTÉRIO PÚBLICO DO ESTADO DE GOIÁS', promovido: 'FULANO DE TAL', url: 'x', marcado: true }]); g.desenhar(); }""")
    crim = pg.locator(".folha").last.inner_text()
    assert "VÍTIMA/ TESTEMUNHAS" in crim and "FULANO DE TAL" in crim.upper() and "RÉU" not in crim, crim
    pg.evaluate("() => { const g = window.__pauta; g.set(g.get().slice(0, 0)); }")
    ex = pg.evaluate("""async (l) => { const m = await import('./pauta-extrator.js'); return m.dadosDaMesa(l); }""", lido)
    print(ex)
    assert ex["artigo"].startswith("art. 147") and ex["dataFato"] == "07/09/2023" and ex["denunciaMov"] == 32, ex
    nomes = {x["nome"]: x for x in ex["pessoas"]}
    assert "Não intimado mov. 57" in nomes["Cicrano Alves Pereira"]["situacao"] and "Intimado mov. 64" in nomes["Josuel Alves dos Santos"]["situacao"] and nomes["Beltrana de Souza Lima"]["papel"] == "vitima", ex
    assert any("NÃO analisado" in a for a in ex["alertas"]), ex
    pg.click("#gerar"); pg.wait_for_function("window.__pauta.get().length > 0", timeout=15000)
    pg.evaluate("(d) => { const g = window.__pauta; g.get().forEach((l) => g.aplicar(l.processo.replace(/\\D/g,'').slice(0,9), {dados: d})); g.desenhar(); }", ex)
    t = pg.inner_text("#saida"); assert "VÍTIMA" in t and "TESTEMUNHAS" in t and "Denúncia – mov. 32" in t, t
    pg.screenshot(path="/tmp/claude-0/work/ui/pauta2.png"); b.close()
print("OK")
