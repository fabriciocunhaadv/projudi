"""Teste do OCR de PDF: gera um PDF com 1 página de texto nativo + 2 páginas só-imagem ("escaneadas"),
passa pela página ocr.html da extensão e confere o resultado com o pdftotext (poppler)."""
import base64, glob, os, shutil, subprocess, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
FRASES = [
    ["AÇÃO DE ALIMENTOS", "O requerente solicita pensão alimentícia em favor do filho", "menor, com guarda compartilhada e visitação quinzenal."],
    ["SENTENÇA", "Julgo procedente o pedido para condenar o requerido", "ao pagamento mensal de trinta por cento do salário mínimo."],
]


def gerar_pdf(pg, destino):
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
    b64 = pg.evaluate("""async (frases) => {
      const { PDFDocument, StandardFonts } = PDFLib;
      const doc = await PDFDocument.create();
      const fonte = await doc.embedFont(StandardFonts.Helvetica);
      const p1 = doc.addPage([595, 842]);
      p1.drawText('Pagina um com texto nativo: certidao de nascimento.', { x: 50, y: 780, size: 14, font: fonte });
      for (const linhas of frases) {                                  // páginas "escaneadas": só uma imagem
        const c = document.createElement('canvas'); c.width = 1240; c.height = 1754;   // ~150 dpi
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = '#000'; x.font = '34px "Liberation Serif", "DejaVu Serif", serif';
        linhas.forEach((l, i) => x.fillText(l, 100, 160 + i * 70));
        const png = await fetch(c.toDataURL('image/png')).then(r => r.arrayBuffer());
        const img = await doc.embedPng(png);
        const p = doc.addPage([595, 842]); p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
      }
      const bytes = await doc.save();
      let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
    }""", FRASES)
    Path(destino).write_bytes(base64.b64decode(b64))


def texto_pagina(pdf, n):
    return subprocess.run(["pdftotext", "-f", str(n), "-l", str(n), "-layout", str(pdf), "-"], capture_output=True, text=True).stdout


def main():
    tmp = Path(tempfile.mkdtemp())
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    entrada = tmp / "processo.pdf"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={RAIZ}", f"--load-extension={RAIZ}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        aux = ctx.new_page(); gerar_pdf(aux, entrada); aux.close()
        assert "certidao" in texto_pagina(entrada, 1) and not texto_pagina(entrada, 2).strip() and not texto_pagina(entrada, 3).strip()

        pg = ctx.new_page()
        msgs = []; pg.on("console", lambda m: msgs.append(m.text)); pg.on("pageerror", lambda e: msgs.append("ERRO: " + str(e)))
        pg.goto(f"chrome-extension://{ext_id}/ocr.html")
        pg.set_input_files("#arquivo", str(entrada))
        pg.select_option("#paralelo", "2")
        pg.click("#iniciar")
        t0 = time.time()
        try:
            pg.wait_for_selector("body[data-pronto='1']", timeout=300000)
        finally:
            print(pg.inner_text("#log")); print("status:", pg.inner_text("#status"), f"({time.time()-t0:.0f}s)")
            print(*[m for m in msgs if "ERRO" in m or "rror" in m][:5], sep="\n")
        link = pg.locator("#resultados a")
        assert link.count() == 1 and link.get_attribute("data-nome") == "processo-OCR.pdf"
        b64 = pg.evaluate("async () => { const r = await fetch(document.querySelector('#resultados a').href); const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }")
        saida = tmp / "saida.pdf"; saida.write_bytes(base64.b64decode(b64))
        ctx.close()

    t1, t2, t3 = (texto_pagina(saida, i) for i in (1, 2, 3))
    print("--- página 1 ---\n", t1, "--- página 2 ---\n", t2, "--- página 3 ---\n", t3)
    assert "certidao de nascimento" in t1                      # página nativa intacta
    norm = lambda t: " ".join(t.lower().split())
    for trecho in ["ação de alimentos", "pensão alimentícia", "guarda compartilhada"]:
        assert trecho in norm(t2), (trecho, norm(t2))          # acentos preservados
    for trecho in ["sentença", "julgo procedente", "salário mínimo"]:
        assert trecho in norm(t3), (trecho, norm(t3))
    # as imagens não foram recomprimidas: tamanho próximo do original
    print("tamanhos:", entrada.stat().st_size, "->", saida.stat().st_size)
    assert saida.stat().st_size < entrada.stat().st_size * 3
    print("OK")


if __name__ == "__main__":
    main()
