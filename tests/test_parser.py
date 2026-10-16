"""Testa o leitor com páginas no formato real do Projudi (dados fictícios em tests/fixtures)."""
import glob, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent
FIX = Path(__file__).parent / "fixtures"
lido = lambda n: (FIX / n).read_text(encoding="utf-8")


def main():
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        pg = b.new_page(); pg.set_content("<html></html>")
        for f in ["parser.js", "ordenar.js"]:
            pg.add_script_tag(path=str(RAIZ / "extensao" / f))
        call = lambda fn, nome: pg.evaluate(f"({fn})", lido(nome))

        # tela inicial da serventia
        r = call("h => ProjudiParser.parseConclusoes(h)", "inicio.html")
        assert r["linhas"] == [{"tipo": "Concluso - Genérico", "naoAnalisadas": 6, "preAnalisadas": 1},
                               {"tipo": "Concluso - Decisão", "naoAnalisadas": 0, "preAnalisadas": 2}], r

        # lista de audiências: colunas pelo cabeçalho, faixa da serventia, paginação
        r = call("h => ProjudiParser.parseAudiencias(h)", "audiencias.html")
        assert len(r["linhas"]) == 2 and r["linhas"][0]["hora"] == "13:30" and r["linhas"][0]["data"] == "2026-11-10", r
        assert r["linhas"][0]["promovente"] == "Maria Teste" and r["linhas"][1]["promovido"] == "Fulano Silva" and r["linhas"][0]["serventia"].startswith("Comarca Teste"), r
        assert "Id_Processo=111" in r["linhas"][0]["url"] and len(r["paginas"]) == 3, r

        mv = pg.evaluate("h => ProjudiParser.parseMovimentacoesPauta(h)", '<table><tr><td>95</td><td>10/05/2024</td><td>Intimação expedida</td></tr><tr><td>96</td><td>11/05/2024</td><td>Juntada de petição</td></tr><tr><td>101</td><td>12/05/2024</td><td>Ofício expedido</td></tr></table>')
        assert [(m["mov"], m["tipo"]) for m in mv] == [(95, "intimacao"), (101, "oficio")], mv

        # números SEM os zeros à esquerda (o Projudi mostra "57388.42" em vez de "0057388-42"): entram na lista, já completados com 7 dígitos
        htmlz = ('<table><tr><th>Processo</th><th>Data Início</th></tr>'
                 '<tr><td><a href="BuscaProcesso?Id_Processo=1">5000085.67</a></td><td>14/09/2026 18:05:21</td></tr>'
                 '<tr><td><a href="BuscaProcesso?Id_Processo=2">57388.42</a></td><td>13/10/2026 17:10:34</td></tr>'
                 '<tr><td><a href="BuscaProcesso?Id_Processo=3">1234.56</a></td><td>12/10/2026 09:00:00</td></tr></table>')
        r = pg.evaluate("h => ProjudiParser.parseProcessos(h).processos.map((p) => p.processo)", htmlz)
        assert r == ["5000085.67", "0057388.42", "0001234.56"], r

        # tela nova: coluna “Aguardando assinatura” antes de “Não analisadas” + linha Total (antes: pré-analisadas saía somada e não analisadas zerada)
        html4 = ('<table><tr><th>Tipo Conclusão</th><th>Aguardando assinatura</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>'
                 '<tr><td>Conclusão - Decisão</td><td>0</td><td><a href="x">5</a></td><td><a href="y">4</a></td></tr>'
                 '<tr><td>Conclusão - Despacho</td><td>1</td><td>2</td><td>0</td></tr>'
                 '<tr><td colspan="2">Total</td><td>1</td><td>7</td><td>4</td></tr></table>')
        r = pg.evaluate("h => ProjudiParser.parseConclusoes(h)", html4)
        print(r)
        assert r["linhas"] == [{"tipo": "Conclusão - Decisão", "naoAnalisadas": 5, "preAnalisadas": 4, "aguardandoAssinatura": 0},
                               {"tipo": "Conclusão - Despacho", "naoAnalisadas": 2, "preAnalisadas": 0, "aguardandoAssinatura": 1}], r

        # serventia mostrada na tela (para conferir que a sessão não trocou de vara no meio da leitura)
        r = pg.evaluate("h => ProjudiParser.parseConclusoes(h)", '<div>Boa Tarde! Seja bem vindo ao Processo Judicial Serventia: Montes Claros de Goias - Vara da Inf. e Juv. Infracional E-mail: x@tjgo.jus.br</div>' + html4)
        assert r["serventiaTela"] == "Montes Claros de Goias - Vara da Inf. e Juv. Infracional", r
        r = pg.evaluate("h => ProjudiParser.parseConclusoes(h)", '<div>Serventia: Goiânia - 3º Núcleo de Justiça 4.0 - Execução Fiscal Municip Serventia Cargo: Juiz 03 E-mail: x</div><table><tr><th>Tipo Conclusão</th><th>Não analisadas</th><th>Pré-analisadas</th></tr><tr><td>Não há Conclusões</td></tr></table>')
        assert r["serventiaTela"] == "Goiânia - 3º Núcleo de Justiça 4.0 - Execução Fiscal Municip", r

        # lista de serventias
        r = call("h => ProjudiParser.parseLista(h)", "lista_serventias.html")
        assert r["logado"] and len(r["itens"]) == 2 and r["itens"][0]["href"].startswith("Usuario?PaginaAtual=7")

        # Pendentes (não analisadas): cabeçalho com colspan=3, faixa em branco, urgência por ícone
        r = call("h => ProjudiParser.parseProcessos(h)", "nao_analisadas.html")
        ps = r["processos"]; print([(x["processo"], x["classificador"], x["prioridade"], x["urgencia"], x["dataInicio"]) for x in ps])
        assert [x["processo"] for x in ps] == ["1000001-11.2025.8.09.0166", "1000002-22.2026.8.09.0166", "1000003-33.2026.8.09.0166",
                                               "1000004-44.2026.8.09.0166", "1000005-55.2026.8.09.0166", "1000006-66.2026.8.09.0166"]
        assert [x["classificador"] for x in ps] == ["", "Fulano - minutando", "Fulano - minutando", "Fulano - minutando", "AUTOS CONCLUSOS", "Beltrana - Minutando"]
        assert [x["prioridade"] for x in ps] == [None, 10, 10, 10, 0, 0]
        assert [x["urgencia"] for x in ps] == [1, 2, 3, 3, 3, 3]
        assert ps[0]["urgenciaTexto"] == "Maior de 80 Anos" and ps[0]["marcadores"] == ["Maior de 80 Anos"] and ps[2]["marcadores"] == []
        assert ps[0]["dataInicio"] == "02/10/2026 14:31:23" and ps[0]["tipoConclusao"] == "Concluso - Genérico"
        assert "Juizado Especial Cível" in ps[0]["tipoAcao"]
        assert ps[0]["url"] == "BuscaProcesso?Id_Processo=9600000001" and ps[0]["idPendencia"] == "600000001"

        # Pré-análises simples
        r = call("h => ProjudiParser.parseProcessos(h)", "pre_analisadas.html")
        ps = r["processos"]
        assert [(x["processo"], x["classificador"], x["prioridade"], x["urgencia"]) for x in ps] == [
            ("2000001.80", "Conclusos- Comunicação de Cessão de créditos", 0, 3), ("2000002.90", "Beltrana - minutando", 5, 1)], ps
        assert ps[0]["dataInicio"] == "30/09/2026 18:05:52" and ps[0]["dataPreAnalise"] == "01/10/2026 13:57:52"
        assert ps[0]["usuarioPreAnalise"] == "Fulano da Silva" and ps[0]["tipoConclusao"] == "Concluso - Decisão"
        assert ps[1]["urgenciaTexto"] == "Réu Preso" and ps[1]["url"].startswith("BuscaProcesso?Id_Processo=")

        # Ordem de trabalho = a do próprio Projudi (urgência -> prioridade do classificador -> mais antigo)
        nao = call("h => ProjudiParser.parseProcessos(h).processos", "nao_analisadas.html")
        ordem = pg.evaluate("ps => ps.sort(Ordenar.comparador('trabalho')).map(p => p.processo.slice(0,7))", nao)
        assert ordem == ["1000001", "1000002", "1000003", "1000004", "1000006", "1000005"] or ordem == ["1000001", "1000002", "1000003", "1000004", "1000005", "1000006"], ordem
        # dentro de prioridade 0 vale o mais antigo: 1000006 (01/10 13:28) antes de 1000005 (02/10 13:33)
        assert ordem == ["1000001", "1000002", "1000003", "1000004", "1000006", "1000005"], ordem
        so_data = pg.evaluate("ps => ps.sort(Ordenar.comparador('data')).map(p => p.processo.slice(0,7))", nao)
        assert so_data == ["1000006", "1000003", "1000004", "1000002", "1000005", "1000001"], so_data
        b.close()
    print("OK")


if __name__ == "__main__":
    main()
