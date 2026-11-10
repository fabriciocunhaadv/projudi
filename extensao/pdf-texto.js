// Extrai o texto de um PDF (já com OCR) página por página, com quebras de linha, para enviar como texto ao Módulo Turbo.
import * as pdfjs from "./vendor/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

// O Projudi carimba em toda página "Movimentacao N : título" e "Arquivo M: nome - Pag.x/y". A IA não deve adivinhar esses números
// (em autos longos ela os desloca): o marcador da página os traz prontos, lidos do carimbo, para serem apenas copiados na citação.
// Página sem carimbo fica só com o número da página (a localização herdada não é afirmada: a IA não deve supor Mov. onde o PDF não o diz).
export function localizacaoDoCarimbo(t, anterior) {
  const x = String(t || "").replace(/\s+/g, " ");
  const mov = x.match(/Movimenta[cç][aã]o\s*(\d{1,5})\s*:/i), arq = x.match(/Arquivo\s*(\d{1,4})\s*:.{0,200}?Pag\.?\s*(\d{1,5})\s*\/\s*(\d{1,5})/i);
  if (!mov) return anterior ? { ...anterior, herdada: true } : null;
  return { mov: +mov[1], arq: arq ? +arq[1] : null, pag: arq ? +arq[2] : null, de: arq ? +arq[3] : null };
}
export function marcadorDaPagina(i, total, loc) {
  const l = loc && !loc.herdada ? ` | Mov. ${loc.mov}${loc.arq != null ? `, Arq. ${loc.arq}, Pág. ${loc.pag}/${loc.de}` : ""}` : "";
  return `[Página ${i} de ${total}${l}]`;
}

// simples=true: marcador só `[Página N de M]` (formato que o Studio entende; ele lê o carimbo do Projudi que continua no texto da página e anota Mov./Arq./Pág. sozinho).
export async function textoDoPdf(bytes, { simples = false } = {}) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise, paginas = [];
  let loc = null;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    let t = "", y = null;
    for (const it of tc.items) {
      const yy = it.transform ? Math.round(it.transform[5]) : y;
      if (y !== null && yy !== y && !t.endsWith("\n")) t += "\n";
      t += it.str || ""; if (it.hasEOL) t += "\n"; y = yy;
    }
    const limpo = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    loc = localizacaoDoCarimbo(limpo.slice(0, 600), loc);      // o carimbo fica no topo da página
    paginas.push(`${simples ? `[Página ${i} de ${pdf.numPages}]` : marcadorDaPagina(i, pdf.numPages, loc)}\n` + limpo);
    page.cleanup();
  }
  await pdf.destroy();
  return paginas.join("\n\n");
}
