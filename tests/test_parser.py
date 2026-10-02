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
                               {"tipo": "Concluso - Decisão", "naoAnalisadas": 0, "preAnalisadas": 1}], r

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
