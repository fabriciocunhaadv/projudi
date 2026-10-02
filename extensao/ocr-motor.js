// Motor de OCR de PDF (sem interface): pdf.js lê/desenha, tesseract.js reconhece, pdf-lib embute o texto invisível.
// A página que importa este módulo precisa carregar antes vendor/pdf-lib.min.js e vendor/tesseract.min.js.
import * as pdfjs from "./vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
const { PDFDocument, StandardFonts, TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState } = PDFLib;

export { pdfjs };
export const MIN_CHARS = 25; // página com menos texto que isto é tratada como imagem
export const fmt = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

// Conta o texto do CONTEÚDO da página. O PDF gerado pelo Projudi carimba em toda página um cabeçalho ("Processo / Movimentação / Arquivo")
// no topo e uma tarja vertical na lateral; esse carimbo não conta, senão páginas escaneadas pareceriam "com texto".
export async function textoDaPagina(page) {
  const tc = await page.getTextContent();
  const [x0, y0, x1, y1] = page.view, alto = y1 - y0, largo = x1 - x0;
  return tc.items.reduce((n, it) => {
    const t = (it.str || "").trim();
    if (!t) return n;
    const [a, b, , , e, f] = it.transform;
    if (Math.abs(b) > 0.1 * Math.abs(a || 1)) return n;              // texto girado (tarja lateral)
    if (f - y0 > alto * 0.88 || e - x0 > largo * 0.93) return n;     // faixa do cabeçalho / margem direita
    return n + t.length;
  }, 0);
}

// Retângulos (no espaço do PDF) das imagens desenhadas na página, com a fração da página que cada uma cobre.
export async function imagensDaPagina(page) {
  const { OPS } = pdfjs, ol = await page.getOperatorList();
  const [x0, y0, x1, y1] = page.view, area = (x1 - x0) * (y1 - y0) || 1;
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let m = [1, 0, 0, 1, 0, 0]; const pilha = [], out = [];
  ol.fnArray.forEach((fn, i) => {
    if (fn === OPS.save) pilha.push(m);
    else if (fn === OPS.restore) m = pilha.pop() || m;
    else if (fn === OPS.transform) m = mul(m, ol.argsArray[i]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
      const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]], ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
      const r = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      out.push({ ...r, fracao: Math.abs(m[0] * m[3] - m[1] * m[2]) / area });
    }
  });
  return out;
}

// A página precisa de OCR se: (a) não tem texto de conteúdo; ou (b) tem uma imagem grande (foto/escaneado) SEM texto em cima dela.
// O Projudi, ao juntar o processo, joga fora o texto dos documentos e carimba cabeçalho, tarja e rodapé (selo digital) ao redor da imagem:
// esse texto fica FORA da imagem, então o que vale é o texto que cai dentro da área da imagem.
export async function precisaOcr(page) {
  if ((await textoDaPagina(page)) < MIN_CHARS) return true;
  const grandes = (await imagensDaPagina(page)).filter((r) => r.fracao >= 0.3);
  if (!grandes.length) return false;
  const tc = await page.getTextContent();
  const itens = tc.items.filter((it) => (it.str || "").trim());
  return grandes.some((r) => itens.reduce((n, it) => (it.transform[4] >= r.x0 && it.transform[4] <= r.x1 && it.transform[5] >= r.y0 && it.transform[5] <= r.y1 ? n + it.str.trim().length : n), 0) < MIN_CHARS);
}

async function criarWorkers(n) {
  const base = new URL("./vendor/", import.meta.url).href;
  const ws = [];
  for (let i = 0; i < n; i++) {
    ws.push(await Tesseract.createWorker("por", 1, {
      workerPath: base + "worker.min.js",
      corePath: base + "tesseract-core-simd-lstm.wasm.js",
      langPath: base,
      workerBlobURL: false, gzip: true, cacheMethod: "none",
    }));
  }
  return ws;
}

// caracteres que a fonte padrão do PDF (WinAnsi) não representa viram "?"
export function seguro(font, texto) {
  let r = "";
  for (const ch of texto) { try { font.encodeText(ch); r += ch; } catch { r += "?"; } }
  return r;
}

function palavrasDe(data) {
  const out = [];
  for (const bloco of data.blocks || [])
    for (const par of bloco.paragraphs || [])
      for (const linha of par.lines || [])
        for (const w of linha.words || []) if (w.text && w.text.trim() && w.bbox) out.push(w);
  return out;
}

// Fotos de documentos (fundo colorido, sombra, iluminação irregular) confundem o reconhecimento: tons de cinza + limiar local
// (cada pixel é comparado com a média da vizinhança, via imagem integral) deixam só o texto escuro sobre fundo branco.
export function melhorarParaOcr(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h, g = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let linha = 0; for (let x = 0; x < w; x++) { linha += g[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + linha; } }
  const r = Math.max(12, Math.round(Math.min(w, h) / 40));
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const soma = integral[yb * (w + 1) + xb] - integral[ya * (w + 1) + xb] - integral[yb * (w + 1) + xa] + integral[ya * (w + 1) + xa];
      const media = soma / ((xb - xa) * (yb - ya)), v = g[y * w + x];
      const preto = v < media * 0.88 ? 0 : 255;       // bem mais escuro que a vizinhança = tinta
      const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = preto; d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ganchos: { log(t), status(t), progresso(feitas, total), cancelado() }
// opcoes:  { escala, paralelo, forcar }
export async function fazerOcr(bytes, opcoes, ganchos = {}) {
  const log = ganchos.log || (() => {}), status = ganchos.status || (() => {}), progresso = ganchos.progresso || (() => {});
  const cancelado = ganchos.cancelado || (() => false);
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const n = pdf.numPages;

  // 1) quais páginas não têm texto
  const alvo = [];
  for (let i = 1; i <= n; i++) {
    if (cancelado()) throw new Error("cancelado");
    const page = await pdf.getPage(i);
    if (opcoes.forcar || (await precisaOcr(page))) alvo.push(i);
    page.cleanup();
    status(`Conferindo páginas… ${i}/${n}`);
  }
  log(`  ${n - alvo.length} página(s) já têm texto; ${alvo.length} precisam de OCR.`);
  if (!alvo.length) return { bytes, ocr: 0, total: n, palavras: 0 };

  // 2) OCR das páginas-imagem
  const ws = await criarWorkers(Math.min(opcoes.paralelo || 2, alvo.length));
  const resultados = new Map();
  let proximo = 0, feitas = 0;
  const t0 = performance.now();
  progresso(0, alvo.length);
  try {
    await Promise.all(ws.map(async (w) => {
      while (!cancelado() && proximo < alvo.length) {
        const i = alvo[proximo++];
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: opcoes.escala || 2.2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        melhorarParaOcr(ctx, canvas.width, canvas.height);
        const { data } = await w.recognize(canvas, {}, { blocks: true });
        resultados.set(i, { palavras: palavrasDe(data), viewport });
        canvas.width = canvas.height = 0; page.cleanup();
        feitas++;
        progresso(feitas, alvo.length);
        const decorrido = (performance.now() - t0) / 1000;
        status(`OCR ${feitas}/${alvo.length} — faltam ~${fmt((decorrido / feitas) * (alvo.length - feitas))}`);
      }
    }));
  } finally {
    await Promise.all(ws.map((w) => w.terminate()));
  }
  if (cancelado()) throw new Error("cancelado");

  // 3) embutir o texto invisível nas páginas originais
  status("Gerando o PDF…");
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let palavras = 0;
  const s = opcoes.escala || 2.2;
  for (const [i, { palavras: ps, viewport }] of resultados) {
    const page = doc.getPage(i - 1);
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
    for (const w of ps) {
      const txt = seguro(font, w.text);
      const [x, y] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y1 - (w.bbox.y1 - w.bbox.y0) * 0.2);
      const alturaPt = (w.bbox.y1 - w.bbox.y0) / s, larguraPt = (w.bbox.x1 - w.bbox.x0) / s;
      const natural = font.widthOfTextAtSize(txt, 1) || 1;
      const size = Math.max(1, Math.min(alturaPt * 0.95, larguraPt / natural));
      page.drawText(txt, { x, y, size, font });
      palavras++;
    }
    page.pushOperators(popGraphicsState());
  }
  const saida = await doc.save();
  log(`  ${palavras} palavras reconhecidas em ${alvo.length} página(s).`);

  // 4) conferência: o texto agora é extraível?
  const novo = await pdfjs.getDocument({ data: saida.slice() }).promise;
  let ok = 0;
  for (const i of alvo.slice(0, 5)) { const p = await novo.getPage(i); if ((await textoDaPagina(p)) >= MIN_CHARS) ok++; }
  log(`  Conferência: ${ok}/${Math.min(5, alvo.length)} páginas testadas já têm texto selecionável.`);
  return { bytes: saida, ocr: alvo.length, total: n, palavras };
}
