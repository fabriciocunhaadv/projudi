// Extrai o texto de um PDF (já com OCR) página por página, com quebras de linha, para enviar como texto ao Módulo Turbo.
import * as pdfjs from "./vendor/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

export async function textoDoPdf(bytes) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise, paginas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    let t = "", y = null;
    for (const it of tc.items) {
      const yy = it.transform ? Math.round(it.transform[5]) : y;
      if (y !== null && yy !== y && !t.endsWith("\n")) t += "\n";
      t += it.str || ""; if (it.hasEOL) t += "\n"; y = yy;
    }
    paginas.push(`[Página ${i}]\n` + t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
    page.cleanup();
  }
  await pdf.destroy();
  return paginas.join("\n\n");
}
