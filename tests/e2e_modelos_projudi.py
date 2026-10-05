"""Captura dos modelos do Projudi (simulado com a mesma estrutura da moldura: janela de pesquisa #busca_padrao, #CorpoTabela, #PaginacaoBuscaPadrao,
quadro 'Principal' com Cadastro de Modelo e editor). Confere lista paginada, texto de cada modelo e as diferenças entre duas capturas."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
SERV = "Montes Claros de Goias - Vara de Família e Sucessões"
DADOS = {"modelos": [{"id": 504000 + i, "nome": f"Modelo {i:02d} teste", "tipo": ["Decisão", "Despacho", "Sentença"][i % 3],
                      "texto": f"<p>Texto do modelo {i}.</p><p>Segundo parágrafo&nbsp;do {i}.</p>"} for i in range(1, 21)]}

SHELL = """<html><body><div id="busca_padrao" style="display:none"><div id="modalBusca-content-titulo"><span class="modal_close" onclick="fechar()">x</span></div>
<div id="busca_padrao_campos"><input id="nomeBusca1" placeholder="Modelo"></div><input type="submit" id="busca_padraoLocalizar" value="Consultar" onclick="consultar(1);return false">
<table id="tabelaLocalizar"><thead><tr><th></th><th>Id</th><th>Modelo</th><th>Serventia</th><th>Tipo Modelo</th></tr></thead><tbody id="CorpoTabela">&nbsp;</tbody></table><div id="PaginacaoBuscaPadrao"></div></div>
<iframe id="Principal" name="userMainFrame" src="/inicio" style="width:800px;height:500px"></iframe>
<script>
let lista = [];
function MostrarBuscaPadrao(){ document.getElementById('busca_padrao').style.display='block' }
function fechar(){ document.getElementById('busca_padrao').style.display='none' }
async function consultar(p){ const f=document.getElementById('nomeBusca1').value; const r=await fetch('/lista?f='+encodeURIComponent(f)); lista=await r.json(); pagina(p) }
function pagina(p){ const ini=(p-1)*15, fatia=lista.slice(ini,ini+15);
  document.getElementById('CorpoTabela').innerHTML = fatia.map((m,i)=>'<tr onclick="selecionar('+m.id+')"><td>'+(ini+i+1)+'</td><td>'+m.id+'</td><td>'+m.nome+'</td><td>'+m.serventia+'</td><td>'+m.tipo+'</td></tr>').join('') || '<tr><td colspan=5>Nenhum</td></tr>';
  const n=Math.ceil(lista.length/15); let h='Página '; for(let k=1;k<=n;k++) h += k===p ? '| '+k+' | ' : '<a href="#" onclick="pagina('+k+');return false">'+k+'</a> ';
  document.getElementById('PaginacaoBuscaPadrao').innerHTML = h + ' Total de: '+lista.length }
function selecionar(id){ fechar(); document.getElementById('Principal').contentWindow.carregar(id) }
</script></body></html>"""
QUADRO = """<html><body><h3>Cadastro de Modelo</h3><img title="Localizar - Localiza um registro no banco" onclick="parent.MostrarBuscaPadrao()" width=20 height=20 src="data:,">
<div id="ed" contenteditable></div>
<script>window.CKEDITOR={instances:{editor1:{getData:()=>document.getElementById('ed').innerHTML,document:{$:document}}}};
async function carregar(id){ const r=await fetch('/texto?id='+id); const t=await r.text(); setTimeout(()=>{document.getElementById('ed').innerHTML=t},300) }</script></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s.path); q = parse_qs(u.query)
        if u.path == "/": corpo, tipo = SHELL, "text/html"
        elif u.path in ("/inicio", "/Modelo"): corpo, tipo = (QUADRO if u.path == "/Modelo" else "<html><body>inicio</body></html>"), "text/html"
        elif u.path == "/lista":
            f = (q.get("f") or [""])[0].lower()
            corpo, tipo = json.dumps([{"id": m["id"], "nome": m["nome"], "serventia": SERV, "tipo": m["tipo"]} for m in DADOS["modelos"] if f in m["nome"].lower()]), "application/json"
        elif u.path == "/texto":
            mid = int(q["id"][0]); corpo, tipo = next(m["texto"] for m in DADOS["modelos"] if m["id"] == mid), "text/html"
        else: s.send_response(404); s.end_headers(); return
        s.send_response(200); s.send_header("Content-Type", tipo + "; charset=utf-8"); s.end_headers(); s.wfile.write(corpo.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8776), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
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
