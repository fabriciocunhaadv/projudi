"""OCR com uma página impossível de ler (gigante demais para desenhar): o PDF não pode ser perdido.
As páginas boas recebem o OCR, a ruim fica sem OCR e é avisada no log; o erro nunca aparece como "undefined"."""
import base64, glob, os, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import RAIZ, FRASES, texto_pagina   # noqa: E402


def gerar_pdf_com_pagina_ruim(pg, destino):
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
    b64 = pg.evaluate("""async (frases) => {
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.create();
      const imagem = async (w, h, linhas) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.font = '34px "Liberation Serif", "DejaVu Serif", serif';
        linhas.forEach((l, i) => x.fillText(l, 100, 160 + i * 70));
        return doc.embedPng(await fetch(c.toDataURL('image/png')).then(r => r.arrayBuffer()));
      };
      for (const linhas of frases) { const img = await imagem(1240, 1754, linhas); const p = doc.addPage([595, 842]); p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 }); }
      const ruim = await imagem(200, 200, ['pagina impossivel']);
      const pr = doc.addPage([20000, 20000]); pr.drawImage(ruim, { x: 0, y: 0, width: 20000, height: 20000 });      // 60000 px a 3x: estoura o limite do canvas
      const bytes = await doc.save();
      let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
    }""", FRASES)
    Path(destino).write_bytes(base64.b64decode(b64))


def main():
    tmp = Path(tempfile.mkdtemp())
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    entrada = tmp / "processo.pdf"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={RAIZ}", f"--load-extension={RAIZ}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        aux = ctx.new_page(); gerar_pdf_com_pagina_ruim(aux, entrada); aux.close()
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/ocr.html")
        pg.set_input_files("#arquivo", str(entrada)); pg.select_option("#paralelo", "2"); pg.click("#iniciar")
        try:
            pg.wait_for_selector("body[data-pronto='1']", timeout=300000)
        finally:
            log = pg.inner_text("#log"); print(log); print("status:", pg.inner_text("#status"))
        assert "undefined" not in log, "o erro não pode aparecer como undefined"
        assert "página 3 ficou SEM OCR" in log, "a página ruim deve ser pulada e avisada"
        b64 = pg.evaluate("async () => { const r = await fetch(document.querySelector('#resultados a').href); const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }")
        saida = tmp / "saida.pdf"; saida.write_bytes(base64.b64decode(b64)); ctx.close()
    norm = lambda t: " ".join(t.lower().split())
    assert "pensão alimentícia" in norm(texto_pagina(saida, 1)), "página boa 1 com OCR"
    assert "julgo procedente" in norm(texto_pagina(saida, 2)), "página boa 2 com OCR"
    print("OK")


if __name__ == "__main__":
    main()
