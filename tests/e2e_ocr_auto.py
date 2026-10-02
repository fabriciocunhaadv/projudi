"""OCR automático: o Chrome baixa um PDF "do Projudi" (anexo + só-imagem); a extensão detecta o download,
abre ocr.html em segundo plano, faz o OCR e salva <nome>-OCR.pdf em Downloads."""
import glob, http.server, os, shutil, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf, texto_pagina   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
PDF = {"bytes": b""}
PAGINA = b'<html><body><a id="a" href="/GerarPDF/processo.pdf">baixar</a><a id="b" href="/outro.pdf">outro</a></body></html>'


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path.endswith(".pdf"):
            s.send_response(200); s.send_header("Content-Type", "application/pdf")
            s.send_header("Content-Disposition", 'attachment; filename="processo-completo.pdf"')
            s.send_header("Content-Length", str(len(PDF["bytes"]))); s.end_headers(); s.wfile.write(PDF["bytes"]); return
        s.send_response(200); s.send_header("Content-Type", "text/html"); s.end_headers(); s.wfile.write(PAGINA)
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    (ext / "manifest.json").write_text((ext / "manifest.json").read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8767), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    entrada = tmp / "entrada.pdf"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, accept_downloads=True,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        aux = ctx.new_page(); gerar_pdf(aux, entrada); aux.close()
        PDF["bytes"] = entrada.read_bytes()

        pg = ctx.new_page(); pg.goto("http://localhost:8767/")
        with pg.expect_download() as dl:       # o assessor clica em "baixar" no Projudi
            pg.click("#a")
        dl.value.path()                          # espera terminar

        # a extensão abre ocr.html?auto=ID em segundo plano
        auto = None
        for _ in range(60):
            auto = next((q for q in ctx.pages if "ocr.html?auto=" in q.url), None)
            if auto: break
            pg.wait_for_timeout(500)
        assert auto, "a extensão não abriu a página de OCR automático"
        auto.wait_for_selector("body[data-pronto='1'], body[data-erro]", timeout=300000)
        print(auto.inner_text("#log"))
        assert auto.evaluate("document.body.dataset.erro") is None, auto.evaluate("document.body.dataset.erro")
        salvo = auto.evaluate("document.body.dataset.salvo")
        print("salvo em:", salvo)
        assert salvo   # (o Playwright troca o nome por um código; no Chrome real o arquivo é "<nome-original>-OCR.pdf")

        itens = sw.evaluate("chrome.downloads.search({}).then(l => l.map(i => ({f: i.filename, s: i.state, e: !!i.byExtensionId})))")
        print(itens)
        assert any(i["s"] == "complete" and i["e"] and i["f"] == salvo for i in itens)      # o salvo foi baixado pela extensão
        assert any(not i["e"] and i["s"] == "complete" for i in itens)                       # o original continua lá
        assert Path(salvo).exists()
        t = {n: " ".join(texto_pagina(salvo, n).lower().split()) for n in (1, 2, 3)}
        assert "certidao de nascimento" in t[1] and "pensão alimentícia" in t[2] and "salário mínimo" in t[3], t

        # o PDF que a própria extensão baixou não dispara outro OCR
        pg.wait_for_timeout(3000)
        assert len([q for q in ctx.pages if "ocr.html?auto=" in q.url]) <= 1
        ctx.close()
    print("OK")


if __name__ == "__main__":
    main()
