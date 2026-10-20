"""Pauta no modelo do gabinete, montada com o que a Mesa do Studio mostra (abas + ata preliminar). Nada inventado."""
import glob, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
EXT = Path(__file__).parent.parent / "extensao"; FIX = Path(__file__).parent / "fixtures"
os.chdir(EXT)
srv = socketserver.TCPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BRIEF = """Resumo Fático da Lide

O réu é acusado de ameaça (art. 147 do Código Penal), fato de 04/05/2024. Data do fato: 04/05/2024. Data de nascimento do autor: 03/05/1990.

Fatos e Provas do Autor
Denúncia oferecida pelo MP no mov. 32 (Mov. 32, Arq. 1, Pág. 1 a 4). O MP não propôs transação penal por existir histórico criminal (Mov. 66, Arq. 1, Pág. 2). O réu, MARCOS CRUZ VIEIRA, não foi intimado pessoalmente (Mov. 95, Arq. 1, Pág. 1 e Mov. 99, Arq. 1, Pág. 1): endereço inexistente. Defesa pelo Dr. Samuel Rodrigo Afonso, OAB/GO 70.406, que requereu a redesignação da audiência (Mov. 70, Arq. 1, Pág. 1).

Fatos e Contraprovas do Réu
A defesa sustenta ausência de dolo e junta longos argumentos sobre a conduta, a personalidade do agente, os antecedentes e a dinâmica dos fatos, sem relação com as intimações ou com a pauta da audiência, em texto que não deve aparecer na pauta do dia.

Alertas & Armadilhas Processuais Detectadas
A testemunha JOSUEL ALVES DOS SANTOS não foi intimada: o MP indicou o endereço no Mov. 98, mas o mandado não foi expedido.
"""
ROT = """ROL DE DEPOENTES & TESTEMUNHAS DA INSTRUÇÃO
JORCENY CARLOS DOS SANTOS
TESTEMUNHA AUTOR
Objeto da oitiva: ameaça
Intimada no Mov. 102 (Mov. 102, Arq. 1, Pág. 1).
JOSUEL ALVES DOS SANTOS
TESTEMUNHA AUTOR
Objeto da oitiva: presenciou os fatos
PM MARCIO DE OLIVEIRA LOURENCETTI
TESTEMUNHA AUTOR
Ofício expedido no Mov. 93 (Mov. 93, Arq. 1, Pág. 1).
"""
lido = {"cabecalho": {"processo": "5426373-25.2024.8.09.0106", "autor": "MARCOS CRUZ VIEIRA", "reu": "", "assunto": ""},
        "abas": {"briefing": BRIEF, "roteiro": ROT, "deliberacoes": "", "sentenca": "", "ata": ""}, "ataHtml": "<p class='meta'>NÃO DEVE SER USADA</p>"}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1100, "height": 900}); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
    pg.add_init_script("window.chrome = { storage: { local: { get: async () => ({ esteira_ordem: [] }), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {} } }, runtime: { sendMessage: async () => ({}), getURL: (x) => x, onMessage: { addListener() {} } }, tabs: { query: async () => [] } };")
    pg.goto(f"http://127.0.0.1:{PORT}/pauta-doc.html"); pg.wait_for_timeout(1500)
    dados = pg.evaluate("async (l) => (await import('/pauta-dados.js')).dadosPautaMesa(l, {})", lido)
    print(json.dumps(dados, ensure_ascii=False)[:1400])
    assert dados["criminal"] and dados["artigo"].startswith("art. 147"), dados
    nomes = {t["nome"]: t for t in dados["testemunhas"]}
    assert set(nomes) == {"JORCENY CARLOS DOS SANTOS", "JOSUEL ALVES DOS SANTOS", "PM MARCIO DE OLIVEIRA LOURENCETTI"}, list(nomes)
    assert nomes["JORCENY CARLOS DOS SANTOS"]["situacao"] == "Intimado mov. 102" or nomes["JORCENY CARLOS DOS SANTOS"]["situacao"].startswith("Intimad"), nomes
    assert nomes["JOSUEL ALVES DOS SANTOS"]["alerta"] and nomes["JOSUEL ALVES DOS SANTOS"]["situacao"].startswith("Não intimad"), nomes
    assert nomes["PM MARCIO DE OLIVEIRA LOURENCETTI"]["situacao"].startswith("Ofício expedido mov. 93"), nomes
    assert any("Samuel Rodrigo Afonso" in a and "OAB/GO 70.406" in a for a in dados["advogados"]), dados["advogados"]
    assert dados["fatos"]["dataFato"] == "04/05/2024" and dados["fatos"]["nascimento"] == "03/05/1990" and dados["fatos"]["denunciaMov"] == 32, dados["fatos"]
    ev = [e["texto"] for e in dados["eventos"]]; print(ev)
    assert ev and all(len(e) <= 175 for e in ev), ev
    assert any("não propôs transação" in e and "mov. 66" in e for e in ev) and any("mov. 95" in e for e in ev), ev
    assert not any("longos argumentos" in e or "personalidade" in e for e in ev), "texto longo/irrelevante não entra na pauta"
    assert "NÃO DEVE SER USADA" not in json.dumps(dados, ensure_ascii=False), "a ata preliminar não é fonte"
    itens = [{"id": "a", "processo": "5426373.25", "audData": "2026-07-13", "audHora": "14:00", "audPromovente": "MINISTÉRIO PÚBLICO", "audPromovido": "MARCOS CRUZ VIEIRA", "audTipo": "Preliminar", "dados": dados},
             {"id": "b", "processo": "5718969.10", "audData": "2026-07-13", "audHora": "13:30", "audPromovente": "MINISTÉRIO PÚBLICO", "audPromovido": "ROBSON ALVES DE FARIA", "audTipo": "Preliminar", "dados": None, "erroLeitura": "não achei a audiência na Mesa"}]
    pg.evaluate("(i) => { window.__pautaDoc.itens = i; window.__pautaDoc.desenhar(); }", itens)
    t = pg.inner_text("#saida"); print(t[:900])
    assert "PAUTA DIA 13 DE JULHO DE 2026" in t and "14h00" in t and "13h30" in t and "TESTEMUNHAS" in t and "art. 147" in t and "PRELIMINAR" in t, t
    assert t.index("13h30") < t.index("14h00"), "ordem por hora"
    assert "não achei a audiência na Mesa" in t
    assert "longos argumentos" not in t and len(t) < 1500, len(t)
    # Google Docs: copia a pauta formatada e abre um documento em branco
    pg.evaluate("""() => { window.__copiado = null; window.__abriu = null; window.chrome.tabs.create = (o) => { window.__abriu = o; };
      Object.defineProperty(navigator, 'clipboard', { value: { write: async (itens) => { window.__copiado = await itens[0].getType('text/html').then((b) => b.text()); } }, configurable: true }); }""")
    pg.locator("#docs").click(); pg.wait_for_timeout(800)
    abriu = pg.evaluate("window.__abriu"); html = pg.evaluate("window.__copiado") or ""
    assert abriu and abriu["url"].startswith("https://docs.google.com/document/create?title="), abriu
    assert "<table" in html and "border:1px solid #000" in html and "PAUTA DIA 13 DE JULHO DE 2026" in html and "background:#ffff00" in html and "contenteditable" not in html and "[sem o texto bruto" not in html, html[:400]
    print("docs OK:", abriu["url"][:70])
    pg.screenshot(path="/tmp/claude-0/work/mob/pauta_doc.png", full_page=True)
    assert not erros, erros
    print("OK"); b.close()
