"""Pauta no modelo do gabinete, montada com o que a Mesa do Studio mostra (abas + ata preliminar). Nada inventado."""
import glob, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
EXT = Path(__file__).parent.parent / "extensao"; FIX = Path(__file__).parent / "fixtures"
os.chdir(EXT)
srv = socketserver.TCPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
ata = (FIX / "ata_preliminar_pauta.html").read_text(encoding="utf-8")
lido = {"cabecalho": {"processo": "5426373-25.2024.8.09.0106", "autor": "MARCOS CRUZ VIEIRA", "reu": "", "assunto": ""},
        "abas": {"briefing": "Resumo Fático da Lide\n\nO réu teria ameaçado a vítima em 04/05/2024. Data do fato: 04/05/2024. Data de nascimento do autor: 03/05/1990. Denúncia mov. 32. Ameaça, art. 147 do Código Penal.\n\n", "roteiro": "", "deliberacoes": "", "sentenca": "", "ata": ""}, "ataHtml": ata}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1100, "height": 900}); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
    pg.add_init_script("window.chrome = { storage: { local: { get: async () => ({ esteira_ordem: [] }), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {} } }, runtime: { sendMessage: async () => ({}), getURL: (x) => x, onMessage: { addListener() {} } }, tabs: { query: async () => [] } };")
    pg.goto(f"http://127.0.0.1:{PORT}/pauta-doc.html"); pg.wait_for_timeout(1500)
    dados = pg.evaluate("async (l) => (await import('/pauta-dados.js')).dadosPautaMesa(l, {})", lido)
    print(json.dumps(dados, ensure_ascii=False)[:1400])
    assert dados["criminal"] and dados["artigo"].startswith("art. 147") and dados["processo"] == "5426373-25.2024.8.09.0106", dados
    assert any(t["nome"].startswith("JORCENY") and t["papel"] == "vitima" and t["situacao"].startswith("Não intimad") for t in dados["testemunhas"]), dados["testemunhas"]
    assert any(t["nome"].startswith("JOSUEL") and "Sem intimação" in t["situacao"] for t in dados["testemunhas"]), dados["testemunhas"]
    reu = next(x for x in dados["partes"] if "MARCOS" in x["nome"]); assert reu["situacao"].startswith("Não intimado mov. 95 e 99") and "Samuel" in reu["advogados"][0], reu
    assert dados["fatos"]["dataFato"] == "04/05/2024" and dados["fatos"]["nascimento"] == "03/05/1990" and dados["fatos"]["denunciaMov"] == 32, dados["fatos"]
    itens = [{"id": "a", "processo": "5426373.25", "audData": "2026-07-13", "audHora": "14:00", "audPromovente": "MINISTÉRIO PÚBLICO", "audPromovido": "MARCOS CRUZ VIEIRA", "audTipo": "Preliminar", "dados": dados},
             {"id": "b", "processo": "5718969.10", "audData": "2026-07-13", "audHora": "13:30", "audPromovente": "MINISTÉRIO PÚBLICO", "audPromovido": "ROBSON ALVES DE FARIA", "audTipo": "Preliminar", "dados": None, "erroLeitura": "não achei a audiência na Mesa"}]
    pg.evaluate("(i) => { window.__pautaDoc.itens = i; window.__pautaDoc.desenhar(); }", itens)
    t = pg.inner_text("#saida"); print(t[:900])
    assert "PAUTA DIA 13 DE JULHO DE 2026" in t and "14h00" in t and "13h30" in t and "VÍTIMA" in t and "TESTEMUNHAS" in t and "art. 147" in t and "PRELIMINAR" in t, t
    assert t.index("13h30") < t.index("14h00"), "ordem por hora"
    assert "não achei a audiência na Mesa" in t
    assert "Nenhuma testemunha" not in t and "inventad" not in t.lower()
    pg.screenshot(path="/tmp/claude-0/work/mob/pauta_doc.png", full_page=True)
    assert not erros, erros
    print("OK"); b.close()
