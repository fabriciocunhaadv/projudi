"""Download seletivo: aba "Navegação de Arquivos" simulada -> botão da extensão -> seleção -> PDF único com índice,
marcadores e OCR (e modo "um PDF por arquivo"). Confere o resultado com o pdftotext."""
import base64, glob, http.server, os, re, shutil, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf, texto_pagina   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
ARQ = {}
NAV = """<html><head><meta charset="utf-8"><title>Navegação de Arquivos do Processo</title></head><body>
<h2>Movimentações Processo 5293296-60.2026.8.09.0166</h2>
<ul><li><b>Sumário Movimentação</b><ul>
<li><b>1 - Petição Enviada -</b><ul>
  <li><a href="/arq/a.pdf" target="viewer">acaodealimentos.pdf</a> <a href="#"><img alt="info"></a></li>
  <li><a href="/arq/b.pdf" target="viewer">certidoes_escaneadas.pdf</a></li></ul></li>
<li><b>2 - Processo Distribuído - Vara de Família</b></li>
<li><b>3 - Juntada de Documento - Informativo BERNA:</b><ul><li><a href="/arq/c.html">analise_partes.html</a></li></ul></li>
<li><b>4 - Autos Conclusos - COM PEDIDO DE GRATUIDADE</b></li>
<li><b>5 - Decisão -> Determinação -> Emenda à Inicial -</b><ul><li><a href="/arq/d.png">foto_sentenca.png</a></li><li><a href="/arq/f.pdf">via_moldura.pdf</a></li></ul></li>
<li><b>6 - Intimação Expedida - Aguardando</b><ul><li><a href="/arq/e.mp3">audio.mp3</a></li><li><a href="javascript:void(0)">sem_endereco.pdf</a></li></ul></li>
</ul></li></ul></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path == "/nav":
            s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(NAV.encode()); return
        nome = s.path.rsplit("/", 1)[-1]
        if nome in ARQ:
            corpo, tipo = ARQ[nome]
            s.send_response(200); s.send_header("Content-Type", tipo); s.send_header("Content-Length", str(len(corpo))); s.end_headers(); s.wfile.write(corpo); return
        s.send_response(404); s.end_headers()
    def log_message(*a): pass


def pdf_texto_nativo(pg, destino, frase):
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
    b64 = pg.evaluate("""async (f) => { const { PDFDocument, StandardFonts } = PDFLib; const d = await PDFDocument.create();
      const fn = await d.embedFont(StandardFonts.Helvetica); d.addPage([595, 842]).drawText(f, { x: 50, y: 780, size: 14, font: fn });
      const b = await d.save(); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }""", frase)
    Path(destino).write_bytes(base64.b64decode(b64))


def png_com_texto(pg, destino, linhas):
    pg.set_content("<html><body></body></html>")
    b64 = pg.evaluate("""(linhas) => { const c = document.createElement('canvas'); c.width = 1240; c.height = 500; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = '34px "Liberation Serif", "DejaVu Serif", serif';
      linhas.forEach((l, i) => x.fillText(l, 60, 120 + i * 70)); return c.toDataURL('image/png').split(',')[1]; }""", linhas)
    Path(destino).write_bytes(base64.b64decode(b64))


def pdftotext(caminho, n=None):
    args = ["pdftotext", "-layout"] + (["-f", str(n), "-l", str(n)] if n else []) + [str(caminho), "-"]
    import subprocess
    return subprocess.run(args, capture_output=True, text=True).stdout


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8768), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, accept_downloads=True,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        aux = ctx.new_page()
        pdf_texto_nativo(aux, tmp / "a.pdf", "Peticao inicial de alimentos em texto nativo")
        gerar_pdf(aux, tmp / "b.pdf")      # 1 página nativa + 2 escaneadas (só imagem)
        pdf_texto_nativo(aux, tmp / "real.pdf", "Conteudo real servido atras da moldura")
        png_com_texto(aux, tmp / "d.png", ["SENTENÇA PROFERIDA NO PROCESSO", "Julgo extinto o feito sem resolução do mérito."])
        aux.close()
        ARQ.update({
            "a.pdf": ((tmp / "a.pdf").read_bytes(), "application/pdf"), "b.pdf": ((tmp / "b.pdf").read_bytes(), "application/pdf"),
            "real.pdf": ((tmp / "real.pdf").read_bytes(), "application/pdf"), "d.png": ((tmp / "d.png").read_bytes(), "image/png"),
            "c.html": ("<html><head><meta http-equiv='Content-Type' content='text/html; charset=ISO-8859-1'></head><body><h1>Decisão</h1><p>Defiro o pedido de gratuidade da justiça.</p>"
                       "<table><tr><td>Parte</td><td>Monara</td></tr></table><script>var x=1</script></body></html>".encode("latin-1"), "text/html; charset=ISO-8859-1"),
            "f.pdf": (b"<html><body><iframe src='/arq/real.pdf'></iframe></body></html>", "text/html"),
            "e.mp3": (os.urandom(4000), "audio/mpeg"),
        })

        nav = ctx.new_page(); nav.goto("http://localhost:8768/nav")
        nav.wait_for_selector("[data-projudi-ext=baixador]", state="attached", timeout=20000)
        assert "(7)" in nav.locator("[data-projudi-ext=baixador] button").inner_text()    # 7 links (um deles sem endereço)
        with ctx.expect_page() as nova:
            nav.locator("[data-projudi-ext=baixador] button").click()
        bx = nova.value; bx.wait_for_selector("body[data-carregado='1']", timeout=20000)

        # --- árvore de seleção ---
        print(bx.inner_text("#arvore"))
        assert bx.locator(".mov").count() == 4                       # movimentações 1, 3, 5, 6 (2 e 4 não têm arquivos)
        assert "1 - Petição Enviada" in bx.inner_text("#arvore") and "5 - Decisão -> Determinação" in bx.inner_text("#arvore")
        assert bx.locator("#arvore input[data-o]:disabled").count() == 1       # o link sem endereço
        assert bx.locator("#arvore input[data-o]").count() == 7
        bx.check("#todos")
        assert bx.locator("#arvore input[data-o]:checked").count() == 6 and "6 de 6" in bx.inner_text("#contagem")
        bx.uncheck("#arvore input[data-mov='6']")                    # desmarca a movimentação 6 inteira...
        assert bx.locator("#arvore input[data-o]:checked").count() == 5
        bx.check("#arvore input[data-mov='6']")                      # ...e marca de novo
        assert bx.locator("#arvore input[data-o]:checked").count() == 6

        # --- PDF único com OCR ---
        bx.check("input[name=modo][value=unico]")
        bx.click("#baixar")
        bx.wait_for_selector("body[data-pronto='1'], body[data-erro]", timeout=300000)
        print(bx.inner_text("#andamento")); print(bx.inner_text("#log")); print(bx.inner_text("#status"))
        assert bx.evaluate("document.body.dataset.erro") is None, bx.evaluate("document.body.dataset.erro")
        salvo = bx.evaluate("document.body.dataset.salvo").split("|")[0]
        total = pdftotext(salvo)
        print(total[:1800])
        assert "ÍNDICE DOS ARQUIVOS" in total and "Processo 5293296-60.2026.8.09.0166" in total
        assert "1 - Petição Enviada" in total and "audio.mp3" in total and "não incluído" in total
        assert total.index("1 - Petição Enviada") < total.index("3 - Juntada") < total.index("5 - Decisão")
        # cada arquivo na página que o índice informa
        pags = {nome: int(pg_) for nome, pg_ in re.findall(r"(\S+\.(?:pdf|html|png))\s+pág\. (\d+)", total)}
        print(pags)
        esperado = {"acaodealimentos.pdf": "peticao inicial de alimentos", "certidoes_escaneadas.pdf": "certidao de nascimento",
                    "analise_partes.html": "defiro o pedido de gratuidade", "foto_sentenca.png": "sentença proferida",
                    "via_moldura.pdf": "conteudo real servido"}
        for nome, trecho in esperado.items():
            assert nome in pags, (nome, pags)
            assert trecho in " ".join(pdftotext(salvo, pags[nome]).lower().split()), (nome, pags[nome], pdftotext(salvo, pags[nome]))
        # as páginas escaneadas receberam OCR (b.pdf: páginas seguintes à nativa) e o PNG também
        txt_b = " ".join(pdftotext(salvo).lower().split())
        for trecho in ["pensão alimentícia", "guarda compartilhada", "salário mínimo", "julgo extinto o feito"]:
            assert trecho in txt_b, trecho

        # --- marcadores (outline) ---
        b64 = base64.b64encode(Path(salvo).read_bytes()).decode()
        outline = bx.evaluate("""async (b64) => { const m = await import('./ocr-motor.js'); const pdf = await m.pdfjs.getDocument({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }).promise;
          const o = await pdf.getOutline(); return o.map(x => [x.title, (x.items || []).map(i => i.title)]); }""", b64)
        print(outline)
        assert [t for t, _ in outline] == ["Índice", "1 - Petição Enviada -", "3 - Juntada de Documento - Informativo BERNA:", "5 - Decisão -> Determinação -> Emenda à Inicial -", "6 - Intimação Expedida - Aguardando"][:len(outline)]
        assert outline[1][1] == ["acaodealimentos.pdf", "certidoes_escaneadas.pdf"]

        # --- modo "um PDF para cada arquivo" ---
        bx.reload(); bx.wait_for_selector("body[data-carregado='1']")
        bx.check("#arvore input[data-o='0']"); bx.check("#arvore input[data-o='3']")      # acaodealimentos.pdf + foto_sentenca.png
        bx.check("input[name=modo][value=separados]")
        bx.click("#baixar")
        bx.wait_for_selector("body[data-pronto='1'], body[data-erro]", timeout=300000)
        assert bx.evaluate("document.body.dataset.erro") is None
        arquivos = bx.evaluate("document.body.dataset.salvo").split("|")
        print(arquivos, bx.inner_text("#status"))
        assert len(arquivos) == 2
        assert "peticao inicial" in " ".join(pdftotext(arquivos[0]).lower().split())
        assert "julgo extinto o feito" in " ".join(pdftotext(arquivos[1]).lower().split()), pdftotext(arquivos[1])      # imagem passou por OCR
        ctx.close()
    print("OK")


if __name__ == "__main__":
    main()
