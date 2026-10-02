"""Download pelo PDF do próprio Projudi: Navegação (simulada) -> seleção -> a extensão abre a janela "Gerar PDF",
marca só os arquivos escolhidos e aperta Gerar. Também confere o caso "todos"."""
import glob, http.server, os, shutil, subprocess, sys, tempfile, threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright
from test_ocr import gerar_pdf   # noqa: E402

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
<div id="divGerarPdf" style="display:none"><form id="formListaArquivos" method="POST" action="GerarPDF" onsubmit="return false"><input type="hidden" name="PaginaAtual" value="1"><input type="hidden" name="codigosArquivos" value="x"><input type="hidden" name="codigosMovimentacoes" value="y">
<button type="submit" id="operacao" name="operacao" value="GerarPDF" onclick="document.title='GEROU:'+[...document.querySelectorAll('input[name=chk1]:checked,input[name=chk2]:checked')].map(c=>c.parentElement.querySelector('strong').textContent).join('|')"> Gerar Processo em PDF </button>
<button type="submit" id="operacao" name="operacao" value="GerarRelatorio"> Gerar Minuta </button></form></div></body></html>"""


PDF = {}
CORPOS = []


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(s):
        CORPOS.append(s.rfile.read(int(s.headers["Content-Length"])).decode())
        s.send_response(200); s.send_header("Content-Type", "application/pdf"); s.send_header("Content-Length", str(len(PDF["b"]))); s.end_headers(); s.wfile.write(PDF["b"])
    def do_GET(s):
        corpo = (NAV if s.path == "/nav" else GERAR if s.path.startswith("/PdfServico/GerarPDF") else "").encode()
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass


def ciclo(ctx, escolher):
    for p in list(ctx.pages):
        if "ocr.html" in p.url: p.close()
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
    pop.wait_for_timeout(1500)
    ocr = next((p for p in ctx.pages if "ocr.html" in p.url), None)
    if ocr is None:
        with ctx.expect_page(lambda p: "ocr.html" in p.url, timeout=30000) as o:
            pass
        ocr = o.value
    ocr.wait_for_selector("body[data-pronto='1'], body[data-erro]", timeout=300000)
    assert ocr.evaluate("document.body.dataset.erro") is None, ocr.evaluate("document.body.dataset.erro")
    return bx, ocr.evaluate("document.body.dataset.salvo")


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
        aux = ctx.new_page(); gerar_pdf(aux, tmp / "scan.pdf"); 
        # carimba o cabeçalho do Projudi (topo + tarja vertical) em todas as páginas, como o PDF real
        aux.set_content("<html><body></body></html>"); aux.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
        import base64
        b64 = aux.evaluate("""async (b64) => { const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib; const d = await PDFDocument.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
          const f = await d.embedFont(StandardFonts.HelveticaBold);
          for (const p of d.getPages()) { const { width, height } = p.getSize();
            p.drawText('Processo: 5293296-60.2026.8.09.0166 Movimentacao 1 : Peticao Enviada Arquivo 1: acao.pdf - Pag.1/1', { x: 20, y: height - 14, size: 8, font: f, color: rgb(1, 0, 0) });
            p.drawText('Assinado digitalmente codigo 12345', { x: 60, y: 20, size: 8, font: f });
            p.drawText('Usuario: FULANO 02/10/2026 17:36 PROJUDI', { x: width - 12, y: height - 60, size: 8, font: f, color: rgb(1, 0, 0), rotate: degrees(-90) }); }
          const b = await d.save(); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }""", base64.b64encode((tmp / "scan.pdf").read_bytes()).decode())
        (tmp / "scan.pdf").write_bytes(base64.b64decode(b64))
        aux.close()   # 1 página nativa + 2 escaneadas
        PDF["b"] = (tmp / "scan.pdf").read_bytes()
        def parte(bx):  # só acao.pdf (mov 1) e anexo.pdf (mov 3)
            bx.check("#arvore input[data-o='0']"); bx.check("#arvore input[data-o='4']")
        bx, salvo = ciclo(ctx, parte); print(salvo)
        assert "acao.pdf" in CORPOS[-1] or "101" in CORPOS[-1]
        from urllib.parse import parse_qs
        q = parse_qs(CORPOS[-1]); print(q)
        assert q["codigosArquivos"] == ["101;104;"] or q["codigosArquivos"] == ["101;105;"], q   # acao.pdf e anexo.pdf
        assert q["codigosMovimentacoes"] == ["11;13;"] and q["operacao"] == ["GerarPDF"]
        txt = " ".join(subprocess.run(["pdftotext", "-layout", salvo, "-"], capture_output=True, text=True).stdout.lower().split())
        print(txt[:300]); assert "pensão alimentícia" in txt and "guarda compartilhada" in txt
        bx, salvo = ciclo(ctx, lambda b: b.check("#todos"))
        print(CORPOS); assert parse_qs(CORPOS[-1])["codigosArquivos"] == ["101;102;103;104;105;"]
        print("OK")
        ctx.close()


main()
