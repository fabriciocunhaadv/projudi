"""Teste ponta a ponta: carrega a extensão num Chromium contra um servidor que imita o Projudi.
Uso: python tests/e2e_extensao.py   (precisa de playwright + chromium)"""
import glob, http.server, json, os, re, shutil, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
LISTA = """<html><body data-usuario-id="1"><fieldset><legend> Montes Claros de Goias - Vara de Família e Sucessões - GO</legend>
<label><a href="Usuario?PaginaAtual=7&amp;a1=3&amp;a2=6">Assessor de Juiz Vara - Y (Juiz)</a></label></fieldset>
<fieldset><legend> Anápolis - Juizado - GO</legend><label><a href="Usuario?PaginaAtual=7&amp;a1=9">Assessor X</a></label></fieldset></body></html>"""
MOLDURA = '<html><body data-usuario-id="1"><iframe name="userMainFrame" src="Usuario?PaginaAtual=-10"></iframe></body></html>'
INICIO = """<html><body><table><tr><th>Tipo Conclusão</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>
<tr><td>Concluso - Sentença</td><td>1</td><td>0</td></tr><tr><td>Concluso - Despacho</td><td>1</td><td>2</td></tr></table></body></html>"""
PENDENTES = """<html><body><table><tr><th>Processo</th><th>Data Início</th></tr>
<tr><td colspan="2">Concluso - Sentença</td></tr><tr><td colspan="2">AGUARDANDO DECURSO DE PRAZO</td></tr>
<tr><td>1111111.11</td><td>01/10/2026 08:00:00</td></tr>
<tr><td colspan="2">Manu minutando - (Prioridade: 0)</td></tr>
<tr><td>2222222.22</td><td>02/10/2026 08:00:00</td></tr></table></body></html>"""
FORM = '<html><body><form method="post" action="PreAnalisarConclusao"><input name="PaginaAtual" value="6"><input name="tipo" value="todas"><input type="submit" name="b" value="Consultar"></form></body></html>'
PRE = """<html><body><form method="post" action="PreAnalisarConclusao"><input type="submit" value="Consultar"></form><table>
<tr><th>Processo</th><th>Data Início</th><th>Data Pré-Análise</th><th>Usuário Pré-Análise</th><th>Tipo de Movimento</th></tr>
<tr><td colspan="5">Concluso - Despacho</td></tr>
<tr><td colspan="5">AGUARDANDO PUBLICAÇÃO DE EXTRATO - (Prioridade: 0)</td></tr>
<tr><td>5879667.38</td><td>31/08/2026 18:08:57</td><td>01/10/2026 15:06:10</td><td>Fabricio Alves da Cunha</td><td>Decisão -> Impugnação</td></tr>
<tr><td colspan="5">Emilly - minutando - (Prioridade: 0)</td></tr>
<tr><td>5410623.26</td><td>28/09/2026 17:59:54</td><td>01/10/2026 14:58:43</td><td>Emilly Martins de Souza</td><td></td></tr>
<tr><td>5560928.22</td><td>29/09/2026 18:47:41</td><td>02/10/2026 14:15:47</td><td>Emilly Martins de Souza</td><td></td></tr></table></body></html>"""
chamadas = []

class H(http.server.BaseHTTPRequestHandler):
    def _r(s, html):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=ISO-8859-1"); s.end_headers()
        s.wfile.write(html.encode("latin-1"))
    def do_GET(s):
        chamadas.append("GET " + s.path)
        p = s.path
        if "PaginaAtual=9" in p: s._r(LISTA)
        elif "PaginaAtual=-10" in p: s._r(INICIO)
        elif p.startswith("/processo"): s._r('<html><body><script>var x=1</script><h1>Capa</h1><iframe src="/movs"></iframe></body></html>')
        elif p.startswith("/movs"): s._r('<html><body><table><tr><td><input type="checkbox" name="arq" value="77" checked></td><td>Mov. 1 - Petição Inicial</td></tr><tr><td><input type="checkbox" name="arq" value="78"></td><td>Mov. 2</td></tr></table></body></html>')
        elif "PreAnalisarConclusao?PaginaAtual=2" in p: s._r(PENDENTES)
        elif "PreAnalisarConclusao?PaginaAtual=6" in p: s._r(FORM)
        else: s._r(MOLDURA)
    def do_POST(s):
        corpo = s.rfile.read(int(s.headers.get("Content-Length", 0))).decode()
        chamadas.append("POST " + s.path + " " + corpo)
        s._r(PRE)
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    for f, a, b in [("background.js", "https://projudi.tjgo.jus.br/", "http://localhost:8765/"),
                    ("manifest.json", "https://projudi.tjgo.jus.br/*", "http://localhost:8765/*")]:
        t = (ext / f).read_text().replace(a, b); (ext / f).write_text(t)
    srv = http.server.HTTPServer(("localhost", 8765), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        estado = None
        for _ in range(40):
            estado = sw.evaluate("chrome.storage.local.get('estado')").get("estado")
            if estado and estado["status"] in ("ok", "erro", "deslogado"): break
            time.sleep(1)
        print(json.dumps(estado, ensure_ascii=False, indent=1)); print(*chamadas, sep="\n")
        s = estado["serventias"][0]
        assert estado["status"] == "ok" and len(estado["serventias"]) == 1 and not s["erro"]
        assert [l["naoAnalisadas"] for l in s["linhas"]] == [1, 1]
        na = s["processos"]["naoAnalisadas"]
        assert [(p["processo"], p["classificador"]) for p in na] == [("1111111.11", "AGUARDANDO DECURSO DE PRAZO"), ("2222222.22", "Manu minutando")], na
        pre = s["processos"]["preAnalisadas"]
        assert [(p["processo"], p["classificador"]) for p in pre] == [
            ("5879667.38", "AGUARDANDO PUBLICAÇÃO DE EXTRATO"), ("5410623.26", "Emilly - minutando"),
            ("5560928.22", "Emilly - minutando")], pre
        assert pre[1]["usuarioPreAnalise"] == "Emilly Martins de Souza" and pre[1]["tipoConclusao"] == "Concluso - Despacho"
        ext_id = sw.url.split("/")[2]
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/popup.html"); pg.wait_for_timeout(500)
        txt = pg.inner_text("body"); print(txt[:900])
        assert "Emilly - minutando" in txt and "5410623.26" in txt
        pn = ctx.new_page(); pn.goto(f"chrome-extension://{ext_id}/painel.html"); pn.wait_for_timeout(500); pn.click("#abrir"); pn.wait_for_timeout(300)
        ptxt = pn.inner_text("body"); print(ptxt[:1500])
        for esperado in ["Resumo por serventia", "Por classificador", "Manu minutando", "AGUARDANDO DECURSO DE PRAZO", "Emilly - minutando", "5560928.22"]:
            assert esperado in ptxt, esperado
        pn.fill("#busca", "emilly"); pn.wait_for_timeout(300)
        assert "Manu minutando" not in pn.inner_text("details") and "5410623.26" in pn.inner_text("details")
        dbg = sw.evaluate("chrome.storage.local.get('debug')")["debug"]
        assert {"amostra inicio", "amostra naoAnalisadas", "amostra preAnalisadas"} <= set(dbg), list(dbg)
        proc = ctx.new_page(); proc.goto("http://localhost:8765/processo"); proc.wait_for_timeout(800)
        tab_id = sw.evaluate("chrome.tabs.query({url: 'http://localhost:8765/processo*'}).then(t => t[0].id)")
        frames = sw.evaluate(f"capturarAba({tab_id})")
        print([ (f["url"], len(f["html"])) for f in frames ])
        assert len(frames) == 2 and "<script" not in frames[0]["html"]
        movs = [f for f in frames if "/movs" in f["url"]][0]["html"]
        assert 'value="77" checked' in movs.replace('checked=""', 'checked') or 'checked' in movs.split('value="77"')[1].split(">")[0]
        assert 'checked' not in movs.split('value="78"')[1].split(">")[0]
        ctx.close()
    print("OK")

if __name__ == "__main__":
    main()
