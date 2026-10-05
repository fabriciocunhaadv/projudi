"""Fila de download: dois processos -> abre cada um, pede o PDF completo, OCR, salva número-OCR.pdf."""
import base64, glob, http.server, os, shutil, subprocess, sys, tempfile, threading, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
PROC = """<html><head><meta charset="utf-8"><title>Processo</title></head><body><h3>Processo %s</h3>
<a href="#" onclick="window.open('/PdfServico/GerarPDF?usu=1&chave=2&token=%s','pdf','width=900,height=600');return false">Gerar PDF de Processo Completo</a></body></html>"""
GERAR = """<html><head><meta charset="utf-8"><title>Gerar PDF</title></head><body><div id="ListaCheckBox"><ul>
<li><input type="checkbox" name="chk0" id="todos" value="0" onclick="document.querySelectorAll('input[name=chk1],input[name=chk2]').forEach(c=>c.checked=this.checked)"><strong>Todos os Arquivos</strong><ul>
<li>1<input type="checkbox" name="chk1" selecao="nivel1" value="11"><strong>Petição Enviada</strong><ul><li><input type="checkbox" name="chk2" pai="11" value="101"> <strong>acao.pdf</strong></li></ul></li>
</ul></li></ul><div id="Volumes"><input type="radio" name="myradio" onclick="document.getElementById('divGerarPdf').style.display='block'" value="1">Volume 1</div></div>
<div id="divGerarPdf" style="display:none"><form id="formListaArquivos" method="POST" action="GerarPDF" onsubmit="return false"><input type="hidden" name="PaginaAtual" value="1">
<button type="submit" id="operacao" name="operacao" value="GerarPDF"> Gerar Processo em PDF </button></form></div></body></html>"""
PDF = {}
CORPOS = []


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path.startswith("/proc"):
            corpo = (PROC % (s.path, uuid.uuid4().hex[:6])).encode()
        elif s.path.startswith("/PdfServico"):
            corpo = GERAR.encode()
        else:
            corpo = b""
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)

    def do_POST(s):
        CORPOS.append(s.rfile.read(int(s.headers["Content-Length"])).decode())
        s.send_response(200); s.send_header("Content-Type", "application/pdf"); s.send_header("Content-Length", str(len(PDF["b"]))); s.end_headers(); s.wfile.write(PDF["b"])

    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8770), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        aux = ctx.new_page(); gerar_pdf(aux, tmp / "scan.pdf")      # página 1 nativa + 2 escaneadas
        aux.set_content("<html><body></body></html>"); aux.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
        b64 = aux.evaluate("""async (b64) => { const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib; const d = await PDFDocument.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
          const f = await d.embedFont(StandardFonts.HelveticaBold); let k = 0;
          for (const p of d.getPages()) { const { width, height } = p.getSize(); k++;
            const L = ['Processo: 5293296-60.2026.8.09.0166', 'Movimentacao ' + (k < 2 ? 1 : 8) + ' : ' + (k < 2 ? 'Peticao Enviada' : 'Juntada -> Peticao'), 'Arquivo ' + k + ': doc' + k + '.pdf - Pag.1/1'];
            L.forEach((t, i) => p.drawText(t, { x: 20, y: height - 14 - i * 10, size: 8, font: f, color: rgb(1, 0, 0) }));
            p.drawText('Usuario: FULANO 02/10/2026 17:36 PROJUDI', { x: width - 12, y: height - 60, size: 8, font: f, color: rgb(1, 0, 0), rotate: degrees(-90) }); }
          const b = await d.save(); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }""", base64.b64encode((tmp / "scan.pdf").read_bytes()).decode())
        PDF["b"] = base64.b64decode(b64); aux.close()

        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/lote.html")
        itens = [{"processo": "5293296-60.2026.8.09.0166", "url": "http://localhost:8770/proc?id=1", "classificador": "Emilly - minutando", "pasta": "Projudi/2026-10-02/Emilly"},
                 {"processo": "5000001-11.2026.8.09.0166", "url": "http://localhost:8770/proc?id=2", "classificador": "Emilly - minutando", "pasta": "Projudi/2026-10-02/Emilly"}]
        sw.evaluate("(j) => chrome.storage.local.set({ lote_t1: j })", {"itens": itens, "pasta": "Projudi"})
        pg.goto(f"chrome-extension://{ext_id}/lote.html?lote=t1")
        pg.wait_for_selector("body[data-pronto='1']", timeout=600000)
        print(pg.inner_text("#lista")); print(pg.inner_text("#status"))
        assert "2 de 2 processo(s) baixado(s)" in pg.inner_text("#status")
        assert len(CORPOS) == 2, CORPOS
        fins = [sw.evaluate("(k) => chrome.storage.local.get(k)", f"lote_fim_t1:{i}")[f"lote_fim_t1:{i}"] for i in (0, 1)]
        print(fins)
        pdf = subprocess.run(["pdftotext", "-layout", fins[0]["pdf"], "-"], capture_output=True, text=True).stdout.lower(); pdf = " ".join(pdf.split())
        ctx.close()
    assert "5293296-60.2026.8.09.0166" in pdf and "movimentacao 8 : juntada" in pdf       # carimbo do Projudi preservado
    assert "pensão alimentícia" in pdf and "guarda compartilhada" in pdf                  # texto das páginas-imagem, com OCR
    assert pdf.count("movimentacao 8 : juntada") == 2                                      # uma por página: o OCR não duplicou o carimbo

    print("OK")


main()
