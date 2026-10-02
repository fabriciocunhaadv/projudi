"""Download pelo PDF do próprio Projudi: Navegação (simulada) -> seleção -> a extensão abre a janela "Gerar PDF",
marca só os arquivos escolhidos e aperta Gerar. Também confere o caso "todos"."""
import glob, http.server, os, shutil, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
NAV = """<html><head><meta charset="utf-8"><title>Navegação</title></head><body>
<h2>Movimentações Processo 5293296-60.2026.8.09.0166</h2>
<a href="#" onclick="window.open('/PdfServico/GerarPDF?usu=1&chave=2&token=3','pdf','width=900,height=600');return false">Gerar PDF de Processo Completo</a>
<ul><li><b>Sumário</b><ul>
<li><b>1 - Petição Enviada -</b><ul><li><a href="/arq/a.pdf">acao.pdf</a></li><li><a href="/arq/b.pdf">docs.pdf</a></li></ul></li>
<li><b>2 - Juntada de Documento</b><ul><li><a href="/arq/c.pdf">laudo.pdf</a></li></ul></li>
<li><b>3 - Decisão</b><ul><li><a href="/arq/d.pdf">decisao.pdf</a></li><li><a href="/arq/e.pdf">anexo.pdf</a></li></ul></li>
</ul></li></ul></body></html>"""
GERAR = """<html><head><meta charset="utf-8"><title>Gerar PDF</title></head><body><div id="ListaCheckBox"><ul id="a0">
<li><input type="checkbox" name="chk0" id="todos" class="chk0" value="0" onclick="document.querySelectorAll('input[name=chk1],input[name=chk2]').forEach(c=>c.checked=this.checked)"><strong>Todos os Arquivos</strong><ul>
<li>1<input type="checkbox" id="m1" name="chk1" selecao="nivel1" value="11"><strong>Petição Enviada</strong><ul>
 <li><input type="checkbox" name="chk2" pai="11" value="101"> <strong>acao.pdf</strong> <span>(Tamanho arquivo: 120 kbytes)</span></li>
 <li><input type="checkbox" name="chk2" pai="11" value="102"> <strong>docs.pdf</strong></li></ul></li>
<li>2<input type="checkbox" name="chk1" selecao="nivel2" value="12"><strong>Juntada de Documento</strong><ul>
 <li><input type="checkbox" name="chk2" pai="12" value="103"> <strong>laudo.pdf</strong></li></ul></li>
<li>3<input type="checkbox" name="chk1" selecao="nivel3" value="13"><strong>Decisão</strong><ul>
 <li><input type="checkbox" name="chk2" pai="13" value="104"> <strong>decisao.pdf</strong></li>
 <li><input type="checkbox" name="chk2" pai="13" value="105"> <strong>anexo.pdf</strong></li></ul></li>
</ul></li></ul><div id="Volumes"><input type="radio" name="myradio" onclick="document.getElementById('divGerarPdf').style.display='block'" value="1">Volume 1</div></div>
<div id="divGerarPdf" style="display:none"><form onsubmit="return false">
<button type="submit" id="operacao" name="operacao" value="GerarPDF" onclick="document.title='GEROU:'+[...document.querySelectorAll('input[name=chk1]:checked,input[name=chk2]:checked')].map(c=>c.parentElement.querySelector('strong').textContent).join('|')"> Gerar Processo em PDF </button>
<button type="submit" id="operacao" name="operacao" value="GerarRelatorio"> Gerar Minuta </button></form></div></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        corpo = (NAV if s.path == "/nav" else GERAR if s.path.startswith("/PdfServico/GerarPDF") else "").encode()
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass


def ciclo(ctx, escolher):
    nav = ctx.new_page(); nav.goto("http://localhost:8769/nav")
    nav.wait_for_selector("[data-projudi-ext=baixador]", state="attached", timeout=20000)
    with ctx.expect_page() as nova:
        nav.locator("[data-projudi-ext=baixador] button").click()
    bx = nova.value; bx.wait_for_selector("body[data-carregado='1']", timeout=20000)
    assert bx.is_checked("input[name=modo][value=projudi]")
    escolher(bx)
    with ctx.expect_page() as popup:
        bx.click("#baixar")
    pop = popup.value
    pop.wait_for_function("document.title.startsWith('GEROU:')", timeout=20000)
    return bx, pop.title()


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8769), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        def parte(bx):  # só acao.pdf (mov 1) e anexo.pdf (mov 3)
            bx.check("#arvore input[data-o='0']"); bx.check("#arvore input[data-o='4']")
        bx, t = ciclo(ctx, parte); print(t)
        assert t == "GEROU:Petição Enviada|acao.pdf|Decisão|anexo.pdf", t
        assert "Abri a janela" in bx.inner_text("#status")
        bx, t = ciclo(ctx, lambda b: b.check("#todos")); print(t)
        assert t.startswith("GEROU:Petição Enviada|acao.pdf|docs.pdf|Juntada") and t.endswith("anexo.pdf"), t
        print("OK")
        ctx.close()


main()
