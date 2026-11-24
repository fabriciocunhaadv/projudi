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
    # as funções são injetadas UMA A UMA (sem enxergar o resto do arquivo): rodar cada uma isolada numa página sem o seeu-ler.js
    pg.goto("http://seeu.exemplo.test/h"); pg.add_script_tag(content=ler)
    fontes = {n: pg.evaluate(f"{n}.toString()") for n in ("lerAreasSeeu", "lerAtuacaoSeeu", "lerMenuConclusoesSeeu", "abrirMenuConclusoesSeeu", "lerConclusoesSeeu", "descobrirExportarSeeu", "capturarExportarSeeu")}
    pg2 = b.new_page(); pg2.route("**/*", rota); pg2.goto("http://seeu.exemplo.test/h2")
    pg2.evaluate("document.addEventListener('click', (e) => e.preventDefault(), true)")
    assert pg2.evaluate("(" + fontes["lerMenuConclusoesSeeu"] + ")()")["ok"] and pg2.evaluate("(" + fontes["abrirMenuConclusoesSeeu"] + ")()")["ok"]
    assert pg2.evaluate("(" + fontes["lerAtuacaoSeeu"] + ")()")["atual"] and len(pg2.evaluate("(" + fontes["lerAreasSeeu"] + ")()")["areas"]) == 2
    # lista de "Processos Remetidos": checkbox sem o nome idConclusoes e sem links de partes
    REM = '<table class="resultTable"><thead><tr><th><label><input type="checkbox" value="checker" name="checker"></label></th><th>Analisar</th><th>Dt. Envio</th><th>Processo / Classe</th><th>Seq.</th><th>Tipo de conclusão</th><th>Privativa</th><th>Responsável</th><th>Pré-análise</th><th>Agrupador</th></tr></thead><tbody><tr class="even"><td><label><input type="checkbox" name="idsConclusoesSelecionadas" value="111"></label></td><td><a href="/seeu/processo/conclusao.do?_tj=x">Analisar</a></td><td>17/11/2026 14:13</td><td><em class="attention">7000035-12.2024.8.09.0117</em> <a href="https://exemplo.test/?n=1"><img src="x.png"></a> <span class="class_flag_REU_PRESO"><img title="Réu Preso"></span><br><div align="center">ExPe</div></td><td>350</td><td>DESPACHO</td><td>Sim</td><td>Fulano de Tal Magistrado</td><td></td><td></td></tr><tr class="odd"><td><label><input type="checkbox" name="idsConclusoesSelecionadas" value="222"></label></td><td><a href="/seeu/processo/conclusao.do?_tj=y">Analisar</a></td><td>18/11/2026 18:22</td><td><em class="normal">7000071-54.2024.8.09.0117</em></td><td>377</td><td>DECISÃO</td><td>Sim</td><td>Fulano de Tal Magistrado</td><td></td><td>Extinção da Punibilidade</td></tr></tbody></table>'
    pg.route("**/*", lambda r: r.fulfill(body="<html><body>" + REM + "</body></html>", content_type="text/html; charset=utf-8")); pg.goto("http://seeu.exemplo.test/r"); pg.add_script_tag(content=ler)
    ps = pg.evaluate("lerConclusoesSeeu()")["processos"]; assert len(ps) == 2, ps
    assert ps[0]["numero"] == "7000035-12.2024.8.09.0117" and ps[0]["tipo"] == "DESPACHO" and ps[0]["entrada"].startswith("17/11/2026") and ps[0]["reuPreso"] and ps[0]["prioridade"] and ps[0]["temAnalisar"], ps[0]
    assert ps[1]["tipo"] == "DECISÃO" and not ps[1]["prioridade"] and ps[1]["agrupador"] == "Extinção da Punibilidade", ps[1]
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
    # o SEEU ignora o tamanho pedido e devolve sempre 20 por página: o leitor segue página a página até juntar os 44
    def pag20(n): 
        ini = (n - 1) * 20 + 1; fim = min(n * 20, 44)
        return f'<form id="f" method="post" action="/seeu/processo/conclusao.do"><input type="hidden" name="conclusaoPageNumber" value="{n}"><input type="hidden" name="conclusaoPageSize" value="20"><div id="navigator"><div class="navLeft">44 registro(s) encontrado(s), exibindo de {ini} até {fim}</div></div><table class="resultTable"><tr><th></th></tr>{linhas(ini, fim + 1) if ini <= 44 else ""}</table></form>'
    def rota3(r):
        if r.request.method == "POST":
            from urllib.parse import parse_qs
            q = parse_qs(r.request.post_data); r.fulfill(body="<html><body>" + pag20(int(q["conclusaoPageNumber"][0])) + "</body></html>", content_type="text/html; charset=iso-8859-1")
        else: r.fulfill(body="<html><body>" + pag20(1) + "</body></html>", content_type="text/html; charset=utf-8")
    pg.route("**/*", rota3); pg.goto("http://seeu.exemplo.test/q"); pg.add_script_tag(content=ler)
    res = pg.evaluate("lerConclusoesSeeu()"); assert res["total"] == 44 and len(res["processos"]) == 44 and not res["aviso"], (len(res["processos"]), res["aviso"])
    # do botão Analisar até a exportação (fetch em cadeia) e a captura do botão Exportar (formulário e window.open)
    ANALISAR = '<html><body><a href="/seeu/visualizacaoProcesso.do?_tj=abc123&amp;x=1">Processo 7000035</a></body></html>'
    PROC = "<html><body><input type=\"button\" id=\"exportarProcessoButton\" value=\"Processo\" onclick=\"disableScreen(); document.location.href='/seeu/processo/exportar.do?_tj=tok999';\"></body></html>"
    def rota4(r):
        u = r.request.url
        if "conclusao.do" in u: r.fulfill(body=ANALISAR, content_type="text/html; charset=iso-8859-1")
        elif "visualizacaoProcesso" in u: r.fulfill(body=PROC, content_type="text/html; charset=iso-8859-1")
        else: r.fulfill(body="<html><body>x</body></html>", content_type="text/html")
    pg.route("**/*", rota4); pg.goto("http://seeu.exemplo.test/z")
    d = pg.evaluate("(" + fontes["descobrirExportarSeeu"] + ")('http://seeu.exemplo.test/seeu/processo/conclusao.do?_tj=zz')")
    assert d["ok"] and d["exportarUrl"] == "http://seeu.exemplo.test/seeu/processo/exportar.do?_tj=tok999" and len(d["passos"]) == 2, d
    PROC_SEM = "<html><body><a href='/seeu/x.do'>nada</a></body></html>"
    pg.route("**/*", lambda r: r.fulfill(body=PROC_SEM, content_type="text/html")); pg.goto("http://seeu.exemplo.test/z2")
    d = pg.evaluate("(" + fontes["descobrirExportarSeeu"] + ")('http://seeu.exemplo.test/seeu/processo/conclusao.do?_tj=zz')")
    assert not d["ok"] and "Analisar" in d["erro"] and "/seeu/x.do" in d["paginasVistas"], d
    EXP1 = '<form id="processoExportarForm" name="processoExportarForm" method="post" action="/seeu/processo/exportar.do?actionType=visualizar&id=77"><input type="hidden" name="selectedItems" value=""><input type="checkbox" name="arquivos" value="1-0.1" checked><input type="checkbox" name="arquivos" value="2-0.2" checked><input type="radio" name="tarja" value="S" checked><input type="button" value="Exportar" onclick="var f=document.processoExportarForm; f.action=\'/seeu/processo/exportar.do?actionType=exportar&_tj=t1\'; f.target=\'_blank\'; f.submit();"></form>'
    pg.route("**/*", lambda r: r.fulfill(body="<html><body>" + EXP1 + "</body></html>", content_type="text/html; charset=utf-8")); pg.goto("http://seeu.exemplo.test/e1")
    c = pg.evaluate("(" + fontes["capturarExportarSeeu"] + ")()")
    assert c["metodo"] == "post" and c["url"].endswith("actionType=exportar&_tj=t1") and [k for k, v in c["campos"]].count("arquivos") == 2 and ["tarja", "S"] in c["campos"], c
    EXP2 = '<form id="processoExportarForm"><input type="checkbox" name="arquivos" value="1-0.1" checked></form><a href="#" onclick="window.open(\'/seeu/baixar.do?_tj=t2\'); return false;">Exportar</a>'
    pg.route("**/*", lambda r: r.fulfill(body="<html><body>" + EXP2 + "</body></html>", content_type="text/html; charset=utf-8")); pg.goto("http://seeu.exemplo.test/e2")
    c = pg.evaluate("(" + fontes["capturarExportarSeeu"] + ")()")
    assert c["via"] == "window.open" and c["metodo"] == "get" and c["url"].endswith("/seeu/baixar.do?_tj=t2"), c
    pg.route("**/*", lambda r: r.fulfill(body="<html><body><button>Voltar</button></body></html>", content_type="text/html")); pg.goto("http://seeu.exemplo.test/e3")
    c = pg.evaluate("(" + fontes["capturarExportarSeeu"] + ")()"); assert "Não achei o botão Exportar" in c["erro"] and c["botoes"] == ["Voltar"], c
    b.close()
print("OK")
