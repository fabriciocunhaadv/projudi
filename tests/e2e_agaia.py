"""Botão "➜ Agaia" na tela do processo (Projudi) + caminho pelas telas do ExecAgaia:
início → Gestão e Execução de Processos → Meus Processos Judiciais → Unidade do Projudi → Classificador → IR → execução (opções extras e prompt)."""
import glob, http.server, os, shutil, tempfile, threading, urllib.parse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PROC = """<html><body><div>AUTOS</div><div><span>Número</span> <span id="n">5875355-82.2025.8.09.0166</span> <img src="data:,"></div><h4>DADOS DO PROCESSO</h4>
<div>OUTRAS INFORMAÇÕES</div><div>Serventia   Montes Claros de Goias - Vara de Familia e Sucessoes   Classe 69 - PROCESSO CÍVEL</div></body></html>"""
OPCOES = ["Outros Área Judicial - Sentença ", "Outros Área Judicial - Fabrício - JECRIM", "Outros Área Judicial - Fabrício Criminal", "Outros Área Judicial - Fabrício Cível",
          "Outros Área Judicial - Fabrício Família e Sucessões", "Outros Área Judicial - Fabrício Juizado Especial Criminal"]
UNIDADES = ["Montes Claros de Goias - Vara Criminal", "Montes Claros de Goias - Vara de Familia e Sucessões", "Orizona - Vara Única"]
HOME = """<html><body><h1>AGAIA</h1><div class="cards">
<a class="card" href="/agaia/gestao"><h3>Gestão e Execução de Processos</h3><p>Controle e execute seus processos com eficiência</p></a>
<div class="card"><h3>Funcionalidades AGAIA</h3></div><div class="card"><h3>Gestão e Colaboração de Prompts</h3></div><div class="card"><h3>Agentes de Execução</h3></div></div></body></html>"""
GESTAO = """<html><body><h2>Gestão e Execução de Processos</h2>
<div class="card" onclick="location='/agaia/gerenciar_processos?escopo=minha_responsabilidade&page_size=20'" style="cursor:pointer"><h3>Meus Processos Judiciais</h3><p>Processos sob minha responsabilidade</p></div>
<div class="card"><h3>Acervo Geral</h3></div></body></html>"""
CASO = {"linhas": "presente"}      # presente | ausente | vazia


def lista(q):
    unidade = q.get("unidade", ["0"])[0]; tipo = q.get("tipo", [""])[0]
    opts = "".join(f'<option value="{i}"{" selected" if str(i) == unidade else ""}>{u}</option>' for i, u in enumerate(UNIDADES))
    ir = lambda n: f'<a class="btn" href="/agaia/prompts/moderno?numero_processo={n}&tipo_processo=judicial&acao_id=6&validado=True" style="background:#198754;color:#fff">► IR</a>'
    linha = lambda n, f: f'<tr><td><input type="checkbox"></td><td>{f}</td><td>Cível</td><td>Tutela Antecipada</td><td><select><option>Executar ExecChatAgaia</option></select> {ir(n)}</td></tr>'
    if tipo == "classificador" and unidade == "1":
        if CASO["linhas"] == "vazia": corpo = "<p>Exibindo 0 de 0 processos.</p>"
        elif CASO["linhas"] == "ausente": corpo = "<h4>CONCLUSO PARA DECISÃO SANEADORA</h4><table>" + linha("5111111.11.2025", "5111111-11.2025") + linha("5222222.22.2025", "5222222-22.2025") + "</table>"
        else: corpo = ("<h4>CONCLUSO PARA DECISÃO SANEADORA - Art. 357 CPC</h4><table>" + linha("5111111.11.2025", "5111111-11.2025") + "</table>"
                       "<h4>VISTA AO MINISTERIO PUBLICO</h4><table>" + linha("5875355.82.2025", "5875355-82.2025") + linha("5333333.33.2025", "5333333-33.2025") + "</table>")
    else:      # visão padrão (outra aba): outro processo vem primeiro
        corpo = "<h4>MINHA RESPONSABILIDADE</h4><table>" + linha("9999999.99.2025", "9999999-99.2025") + "</table>"
    return f"""<html><body><label for="u">Unidade do Projudi</label><select id="u" onchange="location='/agaia/gerenciar_processos?unidade='+this.value+'&tipo={tipo}'">{opts}</select>
<div>Visão da lista:
<button onclick="location='/agaia/gerenciar_processos?unidade={unidade}&tipo='">Minha Responsabilidade</button> <button>Acervo da Unidade</button> <button>Conclusos</button>
<button onclick="location='/agaia/gerenciar_processos?unidade={unidade}&tipo=classificador'">Classificador</button> <button>Prioridade</button></div>{corpo}</body></html>"""


def execucao(q):
    n = q.get("numero_processo", [""])[0]
    return """<html><body><input type="checkbox" id="consultar_juris_auto"><input type="checkbox" id="reanalisar_juris_auto"><input type="checkbox" id="incluir_contexto_ampliado_acuracia">
<input type="text" id="e_f444bb494c49" class="form-control js-ef-f" placeholder="Informe o número do processo 9999999.99.9999" value="%s">
<select id="e_193b967734a3"><option value="" selected>-- Selecione um prompt --</option>""" % n + "".join(f'<option value="{i+1}">{t}</option>' for i, t in enumerate(OPCOES)) + """</select>
<script>document.getElementById('e_193b967734a3').addEventListener('change',e=>{window.escolhido=e.target.selectedOptions[0].text})</script></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        u = urllib.parse.urlparse(s.path); q = urllib.parse.parse_qs(u.query)
        if u.path == "/__caso": CASO["linhas"] = q["x"][0]; html = "ok"
        elif u.path == "/agaia/home": html = HOME
        elif u.path == "/agaia/gestao": html = GESTAO
        elif u.path == "/agaia/gerenciar_processos": html = lista(q)
        elif u.path == "/agaia/prompts/moderno": html = execucao(q)
        else: html = PROC
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(html.encode())
    def log_message(*a): pass


tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
for f in ("manifest.json", "background.js", "agaia-rota.js"):
    t = (ext / f).read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/*").replace("https://simplesefacil.tjgo.jus.br/", "http://localhost:8781/").replace("https://*.tjgo.jus.br/*", "http://localhost/*")
    (ext / f).write_text(t)
srv = http.server.ThreadingHTTPServer(("localhost", 8781), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]


def rodar(ctx, caso):
    import urllib.request
    urllib.request.urlopen(f"http://localhost:8781/__caso?x={caso}")
    pg = ctx.new_page(); pg.goto("http://localhost:8781/proc"); pg.wait_for_selector("[data-projudi-ext=agaia]", timeout=15000)
    with ctx.expect_page() as nova: pg.click("[data-projudi-ext=agaia]")
    ag = nova.value
    return pg, ag


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    # 1) o processo está na lista do Classificador (não é o primeiro): clica no IR dele; unidade trocada; marcações e prompt como sempre
    pg, ag = rodar(ctx, "presente")
    ag.wait_for_function("document.documentElement.dataset.projudiAgaia", timeout=45000)
    print("1)", ag.url, ag.evaluate("document.documentElement.dataset.projudiAgaia"), ag.evaluate("window.escolhido"))
    assert "/agaia/prompts/moderno" in ag.url and "numero_processo=5875355.82.2025" in ag.url, ag.url
    assert ag.evaluate("document.documentElement.dataset.projudiAgaia") == "ok"
    assert ag.is_checked("#consultar_juris_auto") and ag.is_checked("#incluir_contexto_ampliado_acuracia") and not ag.is_checked("#reanalisar_juris_auto")
    assert ag.evaluate("window.escolhido") == "Outros Área Judicial - Fabrício Família e Sucessões"
    assert ag.input_value("#e_f444bb494c49") == "5875355.82.2025"
    ag.close(); pg.close()
    # 2) o processo NÃO está na lista: abre o primeiro e avisa claramente
    pg, ag = rodar(ctx, "ausente")
    ag.wait_for_function("document.documentElement.dataset.projudiAgaia", timeout=45000)
    msg = ag.evaluate("document.querySelector('[data-projudi-ext=agaia-aviso]').innerText"); print("2)", ag.url, msg)
    assert "numero_processo=5111111.11.2025" in ag.url and "não estava na lista" in msg and "5111111" in msg, (ag.url, msg)
    assert ag.is_checked("#consultar_juris_auto")      # as marcações continuam
    ag.close(); pg.close()
    # 3) lista vazia: para, diz qual etapa falhou e oferece o atalho direto
    pg, ag = rodar(ctx, "vazia")
    ag.wait_for_function("document.documentElement.dataset.projudiAgaiaRota", timeout=60000)
    st = ag.evaluate("document.documentElement.dataset.projudiAgaiaRota"); msg = ag.evaluate("document.querySelector('[data-projudi-ext=agaia-rota]').innerText"); print("3)", st, msg)
    assert st.startswith("falha:") and "IR" in msg and "Abrir direto" in msg
    assert ag.evaluate("document.querySelector('[data-projudi-ext=agaia-rota] a').href").endswith("numero_processo=5875355.82.2025&tipo_processo=judicial&acao_id=6&validado=True")
    ctx.close()
print("OK")
