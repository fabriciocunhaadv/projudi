"""SEEU: leitores de serventias e Conclusões (HTML sintético, sem dados reais). Rodar: /usr/bin/python3.13 tests/e2e_seeu_ler.py"""
import os
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extensao"))
ler = open(os.path.join(RAIZ, "seeu-ler.js"), encoding="utf-8").read()
AREAS = """<ul id="listaAreavara"><li><a title="TJXX - Comarca A - Vara 1" href="/seeu/usuario/areaAtuacao.do?_tj=aa11">TJXX - Comarca A - Vara 1</a></li>
<li><a title="TJXX - Comarca B - Vara 2" href="/seeu/usuario/areaAtuacao.do?_tj=bb22">TJXX - Comarca B</a></li><li><a href="/outra.do">x</a></li></ul>"""
LISTA = """<div id="navigator"><span class="navLeft">32 registro(s) encontrado(s), exibindo de 1 até 20</span></div><table class="resultTable"><tr><th>Sel</th><th>Processo</th></tr>
<tr><td><input type="checkbox" name="idConclusoes" value="111"></td><td><a class="link" href="/seeu/visualizacaoProcesso.do?_tj=zz"><em class="attention">0000001-02.2024.8.09.0001</em></a><span class="class_flag_REU_PRESO"></span></td><td>01/02/2025 <em><font>URGENTE</font></em></td><td>DECISÃO (p/ Juiz)</td><td><table class="form"><tr><td><a href="parteProcesso.do?x=1">FULANO TESTE</a></td></tr></table></td></tr>
<tr><td><input type="checkbox" name="idConclusoes" value="222"></td><td><a class="link" href="/seeu/visualizacaoProcesso.do?_tj=yy"><em class="normal">0000002-03.2024.8.09.0001</em></a></td><td>03/02/2025</td><td>DESPACHO (p/ Juiz)</td><td></td></tr></table>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox']); pg = b.new_page()
    for html, fn in ((AREAS, "a"), (LISTA, "c")):
        pg.route("**/*", lambda r, q=None, h=html: r.fulfill(body="<html><body>" + h + "</body></html>", content_type="text/html; charset=utf-8"))
        pg.goto("http://seeu.exemplo.test/x" + fn); pg.add_script_tag(content=ler)
        if fn == "a":
            r = pg.evaluate("lerAreasSeeu()"); assert [a["nome"] for a in r["areas"]] == ["TJXX - Comarca A - Vara 1", "TJXX - Comarca B - Vara 2"], r
        else:
            r = pg.evaluate("lerConclusoesSeeu()"); ps = r["processos"]; print(ps)
            assert r["ok"] and len(ps) == 2 and "32 registro" in r["contador"]
            assert ps[0]["numero"] == "0000001-02.2024.8.09.0001" and ps[0]["urgente"] and ps[0]["reuPreso"] and ps[0]["idConclusao"] == "111" and ps[0]["entrada"] == "01/02/2025" and ps[0]["partes"] == ["FULANO TESTE"] and ps[0]["tipo"].startswith("DECISÃO")
            assert not ps[1]["urgente"] and not ps[1]["reuPreso"] and ps[1]["tipo"].startswith("DESPACHO")
    # tela real: ícone "Alterar atuação" com javascript:openSubmitDialog('...') e menu Conclusões
    HOME = '<table id="userinfo"><tr><td><div class="group"><span class="userinfo_label">Atuação:</span> <span title="TJXX - Cidade - Vara 1">TJXX - Cidade - Vara 1</span> <a id="alterarAreaAtuacao" href="javascript:openSubmitDialog(\'/seeu/usuario/areaAtuacao.do?_tj=tok\', \'Alterar Atuação\', 0, 0);"><img></a></div></td></tr></table>'
    MENU2 = '<nav><ul id="main-menu"><li><a href="#">Conclusões</a><ul><li><a href="/seeu/processo/conclusaoJuiz.do?_tj=a">Para Despacho</a></li><li><a href="/seeu/processo/conclusao.do?_tj=c">Processos Remetidos p/ Conclusão</a></li></ul></li></ul></nav>'
    def rota(r):
        if "areaAtuacao.do" in r.request.url: r.fulfill(body="<html><body>" + AREAS + "</body></html>", content_type="text/html; charset=iso-8859-1")
        else: r.fulfill(body="<html><body>" + HOME + MENU2 + "</body></html>", content_type="text/html; charset=utf-8")
    pg.route("**/*", rota); pg.goto("http://seeu.exemplo.test/h"); pg.add_script_tag(content=ler)
    r = pg.evaluate("lerAreasSeeu()"); assert r["fonte"] == "página Alterar atuação" and len(r["areas"]) == 2 and r["atual"] == "TJXX - Cidade - Vara 1", r
    assert pg.evaluate("lerAtuacaoSeeu()")["atual"] == "TJXX - Cidade - Vara 1"
    pg.evaluate("document.addEventListener('click', (e) => e.preventDefault(), true)")
    assert pg.evaluate("lerMenuConclusoesSeeu()")["ok"] and pg.evaluate("abrirMenuConclusoesSeeu()")["ok"]
    # lista de "Processos Remetidos": checkbox sem o nome idConclusoes e sem links de partes
    REM = '<table class="resultTable"><tr><th></th><th>Processo</th></tr><tr><td><input type="checkbox" value="9"></td><td>17/11/2026 14:13</td><td><a href="/seeu/x.do?_tj=1">0000035-12.2024.8.09.0117</a></td><td>DESPACHO</td><td>Fulano de Tal</td></tr></table>'
    pg.route("**/*", lambda r: r.fulfill(body="<html><body>" + REM + "</body></html>", content_type="text/html; charset=utf-8")); pg.goto("http://seeu.exemplo.test/r"); pg.add_script_tag(content=ler)
    ps = pg.evaluate("lerConclusoesSeeu()")["processos"]; assert len(ps) == 1 and ps[0]["numero"] == "0000035-12.2024.8.09.0117" and ps[0]["tipo"] == "DESPACHO" and ps[0]["entrada"].startswith("17/11/2026"), ps
    # várias páginas: o SEEU diz 250 registros; o leitor pede as páginas 1..3 (100 por vez) e junta tudo, sem repetir
    def linhas(n0, n1): return "".join(f'<tr><td><input type="checkbox" name="idConclusoes" value="{i}"></td><td><a href="/seeu/visualizacaoProcesso.do?_tj=x"><em>{i:07d}-12.2024.8.09.0117</em></a></td><td>DESPACHO</td></tr>' for i in range(n0, n1))
    def pagina(n, tam=100): return f'<form id="f" method="post" action="/seeu/processo/conclusao.do"><input type="hidden" name="conclusaoPageNumber" value="{n}"><input type="hidden" name="conclusaoPageSize" value="20"><div id="navigator"><div class="navLeft">250 registro(s) encontrado(s), exibindo de 1 até 20</div></div><table class="resultTable"><tr><th></th></tr>{linhas((n-1)*tam+1, min(n*tam, 250)+1)}</table></form>'
    visto = []
    def rota2(r):
        if r.request.method == "POST":
            from urllib.parse import parse_qs
            q = parse_qs(r.request.post_data); visto.append((q["conclusaoPageNumber"][0], q["conclusaoPageSize"][0]))
            r.fulfill(body="<html><body>" + pagina(int(q["conclusaoPageNumber"][0])) + "</body></html>", content_type="text/html; charset=iso-8859-1")
        else: r.fulfill(body="<html><body>" + pagina(1, 20).replace(linhas(21, 101), "") + "</body></html>", content_type="text/html; charset=utf-8")
    pg.route("**/*", rota2); pg.goto("http://seeu.exemplo.test/p"); pg.add_script_tag(content=ler)
    res = pg.evaluate("lerConclusoesSeeu()"); assert res["total"] == 250 and len(res["processos"]) == 250 and not res["aviso"], (res["total"], len(res["processos"]), res["aviso"])
    assert len({p["numero"] for p in res["processos"]}) == 250 and visto == [("1", "100"), ("2", "100"), ("3", "100")], visto
    b.close()
print("OK")
