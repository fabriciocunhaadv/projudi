"""Captura dos modelos do Projudi (simulado com a estrutura real: quadro Principal com a lista Busca de Modelo, paginação, tela de edição e outra serventia que deve ser ignorada)."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
SERV = "Montes Claros de Goias - Vara de Família e Sucessões"
DADOS = {"modelos": [{"id": 504000 + i, "nome": f"Modelo {i:02d} teste", "tipo": ["Decisão", "Despacho", "Sentença"][i % 3],
                      "texto": f"<p>Texto do modelo {i}.</p><p>Segundo parágrafo&nbsp;do {i}.</p>"} for i in range(1, 21)]}

OUTRA = "Goiania - 3a Vara Civel"
OUTROS = [{"id": 700000 + i, "nome": f"Outro {i:02d}", "tipo": "Despacho", "texto": "<p>x</p>", "serv": OUTRA} for i in range(1, 8)]

SHELL = """<html><body><iframe id="Principal" name="userMainFrame" src="/inicio" style="width:900px;height:600px"></iframe></body></html>"""
LISTA = """<html><body><h3>Busca de Modelo</h3><input id="nomeBusca1"><button id="formLocalizarBotao" onclick="consultar()">Consultar</button>
<table><tbody id="CorpoTabela"></tbody></table><div id="Paginacao"></div>
<script>
let lista = [];
async function consultar(){ const f=document.getElementById('nomeBusca1').value; lista=await (await fetch('/lista?f='+encodeURIComponent(f))).json(); pagina(1) }
function pagina(p){ const ini=(p-1)*15, fatia=lista.slice(ini,ini+15);
  document.getElementById('CorpoTabela').innerHTML = fatia.map(m=>`<tr data_id1="${m.id}" data_desc1="${m.nome}" data_descs="desc2;${m.serv};desc3;${m.tipo};"><td>${m.id}</td><td>${m.nome}</td><td><button name="formLocalizarimgEditar" onclick="location.href='/ModeloEditar?id=${m.id}'">E</button><button name="formLocalizarimgexcluir">X</button></td></tr>`).join('');
  document.getElementById('Paginacao').innerHTML=`<input id="CaixaTextoPosicionar" value="${p}"><button class="BotaoIr" onclick="pagina(+document.getElementById('CaixaTextoPosicionar').value)">Ir</button> Total de: ${lista.length}` }
</script></body></html>"""
EDITAR = """<html><body><h3>Cadastro de Modelo</h3><div id="ed" contenteditable></div>
<script>window.CKEDITOR={instances:{editor1:{getData:()=>document.getElementById('ed').innerHTML,document:{$:document}}}};
fetch('/texto'+location.search).then(r=>r.text()).then(t=>setTimeout(()=>{document.getElementById('ed').innerHTML=t},300))</script></body></html>"""


def todos(): return [{**m, "serv": SERV} for m in DADOS["modelos"]] + OUTROS


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s.path); q = parse_qs(u.query)
        if u.path == "/": corpo, tipo = SHELL, "text/html"
        elif u.path == "/inicio": corpo, tipo = "<html><body>inicio</body></html>", "text/html"
        elif u.path == "/Modelo": corpo, tipo = LISTA, "text/html"
        elif u.path == "/ModeloEditar": corpo, tipo = EDITAR, "text/html"
        elif u.path == "/lista":
            f = (q.get("f") or [""])[0].lower()
            corpo, tipo = json.dumps([{"id": m["id"], "nome": m["nome"], "serv": m["serv"], "tipo": m["tipo"]} for m in todos() if f in m["nome"].lower()]), "application/json"
        elif u.path == "/texto":
            mid = int(q["id"][0]); corpo, tipo = next(m["texto"] for m in DADOS["modelos"] if m["id"] == mid), "text/html"
        else: s.send_response(404); s.end_headers(); return
        s.send_response(200); s.send_header("Content-Type", tipo + "; charset=utf-8"); s.end_headers(); s.wfile.write(corpo.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    srv = http.server.ThreadingHTTPServer(("localhost", 8776), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        sw.evaluate("(n) => chrome.storage.sync.set({automacao: {[n]: {ativa: true}}})", SERV)
        proj = ctx.new_page(); proj.goto("http://localhost:8776/"); proj.wait_for_timeout(2500)
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/modelos.html"); pg.wait_for_selector("body[data-pronto='1']")

        def capturar():
            pg.evaluate("() => { delete document.body.dataset.capturado; delete document.body.dataset.erro; }")
            pg.click("#atualizar")
            for _ in range(400):
                if pg.evaluate("() => !!(document.body.dataset.capturado || document.body.dataset.erro)"): break
                pg.wait_for_timeout(250)
            assert pg.evaluate("() => document.body.dataset.erro") is None, pg.evaluate("() => document.body.dataset.erro")
            return json.loads(pg.evaluate("() => document.body.dataset.capturado"))
        r1 = capturar(); print(r1, pg.inner_text("#mudancas"))
        assert r1["total"] == 20 and r1["falhas"] == 0 and len(r1["diff"]["novos"]) == 20
        guardado = sw.evaluate("() => chrome.storage.local.get('modelos')")["modelos"]
        ms = guardado["serventias"][SERV]["modelos"]
        assert len(ms) == 20 and ms[0]["texto"] == "Texto do modelo 1.\nSegundo parágrafo do 1." and {m["tipo"] for m in ms} == {"Decisão", "Despacho", "Sentença"}, ms[0]
        assert "Modelo 20 teste" in pg.inner_text("#lista") or "20 modelo(s)" in pg.inner_text("#lista")
        # muda um modelo e exclui outro no "Projudi": a segunda captura aponta alterado e excluído
        DADOS["modelos"][2]["texto"] = "<p>Texto NOVO do modelo 3.</p>"
        excluido = DADOS["modelos"].pop(5)
        r2 = capturar(); print(r2["diff"], pg.inner_text("#mudancas"))
        assert r2["total"] == 19 and r2["diff"]["alterados"] == ["504003"] and [e["id"] for e in r2["diff"]["excluidos"]] == [str(excluido["id"])] and r2["diff"]["novos"] == []
        assert "1</b> alterado" in pg.inner_html("#mudancas") and "Atualize o PDF" in pg.inner_text("#mudancas")
        ctx.close()
    print("OK")


main()
