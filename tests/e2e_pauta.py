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
    t = pg.inner_text("#saida"); assert "Antônio José Teste" in t and "13:30" in t and "Audiências 10/11/2026" in t, t
    ex = pg.evaluate("""async (txt) => { const m = await import('./pauta-extrator.js'); return m.extrairPauta(txt); }""", TEXTO)
    print(ex)
    assert ex["artigo"].startswith("art. 147") and ex["dataFato"] == "07/09/2023" and ex["nascimentoReu"] == "15/01/2002" and ex["denunciaMov"] == 32 and ex["recebimentoMov"] == 41, ex
    nomes = {x["nome"]: x for x in ex["pessoas"]}
    assert "Beltrana de Souza Lima" in nomes and nomes["Beltrana de Souza Lima"]["papel"] == "vitima", ex
    assert "Não intimado mov. 57" in nomes["Cicrano Alves Pereira"]["situacao"] and "endereço inexistente" in nomes["Cicrano Alves Pereira"]["situacao"], ex
    assert "Intimado mov. 64" in nomes["Josuel Alves dos Santos"]["situacao"], ex
    pg.evaluate("(d) => { const g = window.__pauta; g.get().forEach((l) => g.aplicar(l.processo.replace(/\\D/g,'').slice(0,9), {dados: d})); g.desenhar(); }", ex)
    t = pg.inner_text("#saida"); assert "VÍTIMA" in t and "TESTEMUNHAS" in t and "Denúncia – mov. 32" in t, t
    pg.screenshot(path="/tmp/claude-0/work/ui/pauta2.png"); b.close()
print("OK")
