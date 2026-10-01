"""Testa a leitura das telas com HTML de exemplo (sem acessar o Projudi)."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent.parent))
import projudi_monitor as m

LISTA = """<div class="area"><h2>Serventias</h2></div>
<fieldset><legend> Mineiros - Juizado Especial Cível - GO</legend>
<label><a href="Usuario?PaginaAtual=7&amp;a1=1&amp;a2=6">Assessor de Juiz Vara - X</a></label>
<label><a href="Usuario?PaginaAtual=7&amp;a1=2&amp;a2=4">Serventia Avançado - 1º Grau - Cível</a></label></fieldset>
<fieldset><legend> Montes Claros de Goias - Vara de Família e Sucessões - GO</legend>
<label><a href="Usuario?PaginaAtual=7&amp;a1=3&amp;a2=6">Assessor de Juiz Vara - Y (Juiz)</a></label></fieldset>"""

CONCLUSOES = """<fieldset><legend>CONCLUSÕES</legend><table>
<tr><th>Tipo Conclusão</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>
<tr><td>Conclusão - Sentença</td><td><a>1</a></td><td><a>0</a></td></tr>
<tr><td>Conclusão - Despacho</td><td><a>1</a></td><td><a>2</a></td></tr>
<tr><td>Conclusão com Pedido de Gratuidade da Justiça</td><td><a>0</a></td><td><a>1</a></td></tr>
</table></fieldset>"""


def test_parse():
    with sync_playwright() as p:
        import os
        b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
        pg = b.new_page()
        pg.set_content(LISTA)
        s = pg.evaluate(m.JS_LISTAR_SERVENTIAS)
        assert len(s) == 3 and s[2]["serventia"].startswith("Montes Claros")
        assert m.sem_acento("Família") == "familia"
        pg.set_content(CONCLUSOES)
        linhas = m.tabela_para_linhas(pg.evaluate(m.JS_LER_CONCLUSOES))
        assert linhas == [
            {"tipo": "Conclusão - Sentença", "nao_analisadas": 1, "pre_analisadas": 0},
            {"tipo": "Conclusão - Despacho", "nao_analisadas": 1, "pre_analisadas": 2},
            {"tipo": "Conclusão com Pedido de Gratuidade da Justiça", "nao_analisadas": 0, "pre_analisadas": 1},
        ]
        na, pre, txt, _ = m.montar_relatorio([{"rotulo": "Vara X", "erro": None, "linhas": linhas}])
        assert (na, pre) == (2, 3)
        b.close()


if __name__ == "__main__":
    test_parse()
    print("OK")
