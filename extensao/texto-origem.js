// Gera o texto completo de um PDF do Projudi indicando, para cada trecho, de onde veio (movimentação, arquivo, página do arquivo e do PDF).
// A origem é lida do carimbo que o próprio Projudi coloca no alto de cada página:
//   "Processo: 5565967-52.2026.8.09.0084 / Movimentação 8 : Juntada -> Petição / Arquivo 2: 03doc.id..pdf - Pag.1/4"
import { pdfjs } from "./ocr-motor.js";

const RE_CAB = /Movimenta[cç][aã]o\s+(\d+)\s*:\s*(.+?)\s+Arquivo\s+(\d+)\s*:\s*(.+?)\s*-\s*Pag\.\s*(\d+)\s*\/\s*(\d+)/i;
const RE_PROC = /Processo:\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i;

// texto da página na ordem de leitura aproximada (linhas de cima para baixo), sem a tarja girada
function textoDaPagina(tc) {
  const todos = tc.items.filter((it) => (it.str || "").trim());
  const girados = todos.filter((it) => Math.abs(it.transform[1]) > 0.1 * Math.abs(it.transform[0] || 1));   // tarja lateral do Projudi
  const itens = todos.filter((it) => !girados.includes(it));
  const linhas = [];
  for (const it of itens) {
    const y = it.transform[5], x = it.transform[4];
    const l = linhas.find((l) => Math.abs(l.y - y) <= Math.max(2, (it.height || 8) * 0.4));
    if (l) l.itens.push({ x, s: it.str, fim: x + (it.width || 0) }); else linhas.push({ y, itens: [{ x, s: it.str, fim: x + (it.width || 0) }] });
  }
  const lateral = girados.sort((a, b) => b.transform[5] - a.transform[5]).map((it) => it.str.trim()).join(" ").replace(/\s+/g, " ").trim();
  const corpo = linhas.sort((a, b) => b.y - a.y).map((l) => {
    l.itens.sort((a, b) => a.x - b.x);
    let t = "", fim = null;
    for (const i of l.itens) { t += (fim !== null && i.x - fim > 1.5 ? " " : "") + i.s; fim = i.fim; }
    return t.replace(/\s+/g, " ").trim();
  }).filter(Boolean).join("\n");
  return corpo + (lateral ? `\n[carimbo lateral] ${lateral}` : "");
}

// bytesOriginal: PDF como o Projudi entregou (tem os carimbos); bytesFinal: PDF depois do OCR; paginasOcr: páginas que receberam OCR.
export async function textoComOrigem(bytesFinal, { processo = "", paginasOcr = [] } = {}) {
  const pdf = await pdfjs.getDocument({ data: bytesFinal.slice() }).promise;
  const ocr = new Set(paginasOcr);
  const paginas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const texto = textoDaPagina(await page.getTextContent());
    const m = texto.match(RE_CAB);
    paginas.push({ i, texto, ocr: ocr.has(i), mov: m ? { n: +m[1], titulo: m[2].trim(), arq: +m[3], nome: m[4].trim(), pg: +m[5], de: +m[6] } : null, proc: (texto.match(RE_PROC) || [])[1] });
    page.cleanup();
  }
  const num = processo || (paginas.find((p) => p.proc) || {}).proc || "";
  // índice: movimentação -> arquivo -> páginas do PDF
  const indice = [];
  for (const p of paginas) {
    if (!p.mov) continue;
    let m = indice.find((x) => x.n === p.mov.n);
    if (!m) indice.push((m = { n: p.mov.n, titulo: p.mov.titulo, arquivos: [] }));
    let a = m.arquivos.find((x) => x.arq === p.mov.arq);
    if (!a) m.arquivos.push((a = { arq: p.mov.arq, nome: p.mov.nome, de: p.mov.de, de1: p.i, ate: p.i, ocr: 0 }));
    a.ate = p.i; if (p.ocr) a.ocr++;
  }
  const L = [];
  L.push(`PROCESSO ${num}`, `Texto integral extraído do PDF completo do Projudi (${pdf.numPages} páginas), com a origem de cada trecho.`,
    `Páginas marcadas [OCR] eram imagem e foram reconhecidas por OCR; o resto é texto original do PDF. Confira o original em caso de dúvida.`, "");
  L.push("ÍNDICE (movimentação → arquivo → páginas do PDF)");
  for (const m of indice) {
    L.push(`  Movimentação ${m.n} — ${m.titulo}`);
    for (const a of m.arquivos) L.push(`    Arquivo ${a.arq}: ${a.nome} — PDF págs. ${a.de1}${a.ate !== a.de1 ? "–" + a.ate : ""}${a.ocr ? ` (${a.ocr} com OCR)` : ""}`);
  }
  L.push("", "=".repeat(78));
  for (const p of paginas) {
    const o = p.mov ? `Movimentação ${p.mov.n} (${p.mov.titulo}) | Arquivo ${p.mov.arq}: ${p.mov.nome} | pág. ${p.mov.pg} de ${p.mov.de} do arquivo` : "origem não identificada no carimbo";
    L.push("", `##### PDF pág. ${p.i}/${pdf.numPages} — ${o}${p.ocr ? " [OCR]" : ""}`, p.texto || "(página sem texto)");
  }
  return { texto: L.join("\n") + "\n", paginas: paginas.length, comOrigem: paginas.filter((p) => p.mov).length, indice };
}
