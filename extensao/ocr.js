// OCR de PDF no próprio navegador: pdf.js (ler/desenhar) + tesseract.js (OCR) + pdf-lib (embutir o texto invisível).
import * as pdfjs from "./vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
const { PDFDocument, StandardFonts, TextRenderingMode, setTextRenderingMode, pushGraphicsState, popGraphicsState } = PDFLib;

const $ = (id) => document.getElementById(id);
const MIN_CHARS = 25; // página com menos texto que isto é tratada como imagem
let arquivos = [], cancelado = false, rodando = false;

const log = (t) => { const el = $("log"); el.textContent += t + "\n"; el.scrollTop = el.scrollHeight; };
const fmt = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

function escolher(lista) {
  arquivos = [...lista].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  $("iniciar").disabled = !arquivos.length || rodando;
  $("status").textContent = arquivos.length ? `${arquivos.length} arquivo(s): ${arquivos.map((f) => f.name).join(", ")}` : "";
}

async function textoDaPagina(page) {
  const tc = await page.getTextContent();
  return tc.items.reduce((n, it) => n + (it.str || "").trim().length, 0);
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
function seguro(font, texto) {
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

async function processar(arquivo, opcoes) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const n = pdf.numPages;
  log(`\n▶ ${arquivo.name}: ${n} página(s)`);

  // 1) quais páginas não têm texto
  const alvo = [];
  for (let i = 1; i <= n; i++) {
    if (cancelado) throw new Error("cancelado");
    const page = await pdf.getPage(i);
    if (opcoes.forcar || (await textoDaPagina(page)) < MIN_CHARS) alvo.push(i);
    page.cleanup();
    $("status").textContent = `Conferindo páginas… ${i}/${n}`;
  }
  log(`  ${n - alvo.length} página(s) já têm texto; ${alvo.length} precisam de OCR.`);
  if (!alvo.length) return { bytes, ocr: 0, total: n };

  // 2) OCR das páginas-imagem
  const ws = await criarWorkers(Math.min(opcoes.paralelo, alvo.length));
  const resultados = new Map();
  let proximo = 0, feitas = 0;
  const t0 = performance.now();
  $("barra").hidden = false; $("barra").max = alvo.length; $("barra").value = 0;
  try {
    await Promise.all(ws.map(async (w) => {
      while (!cancelado && proximo < alvo.length) {
        const i = alvo[proximo++];
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: opcoes.escala });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        const { data } = await w.recognize(canvas, {}, { blocks: true });
        resultados.set(i, { palavras: palavrasDe(data), viewport });
        canvas.width = canvas.height = 0; page.cleanup();
        feitas++;
        $("barra").value = feitas;
        const decorrido = (performance.now() - t0) / 1000;
        $("status").textContent = `OCR ${feitas}/${alvo.length} — faltam ~${fmt((decorrido / feitas) * (alvo.length - feitas))}`;
      }
    }));
  } finally {
    await Promise.all(ws.map((w) => w.terminate()));
  }
  if (cancelado) throw new Error("cancelado");

  // 3) embutir o texto invisível nas páginas originais
  $("status").textContent = "Gerando o PDF…";
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let palavras = 0;
  for (const [i, { palavras: ps, viewport }] of resultados) {
    const page = doc.getPage(i - 1);
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
    const s = opcoes.escala;
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

async function iniciar() {
  rodando = true; cancelado = false;
  $("iniciar").disabled = true; $("cancelar").disabled = false; $("resultados").textContent = "";
  const opcoes = { escala: +$("escala").value, paralelo: +$("paralelo").value, forcar: $("forcar").checked };
  for (const f of arquivos) {
    try {
      const r = await processar(f, opcoes);
      const nome = f.name.replace(/\.pdf$/i, "") + (r.ocr ? "-OCR.pdf" : "-ja-pesquisavel.pdf");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
      a.download = nome; a.textContent = `Baixar ${nome}`; a.dataset.nome = nome;
      const div = document.createElement("div"); div.className = "res"; div.append(a, ` — ${r.ocr} de ${r.total} página(s) com OCR`);
      $("resultados").append(div);
    } catch (e) {
      log(`  ✖ ${f.name}: ${e.message}`);
      const div = document.createElement("div"); div.className = "res erro"; div.textContent = `${f.name}: ${e.message}`; $("resultados").append(div);
      if (cancelado) break;
    }
  }
  rodando = false; $("cancelar").disabled = true; $("iniciar").disabled = !arquivos.length;
  $("status").textContent = cancelado ? "Cancelado." : "Pronto."; $("barra").hidden = true;
  document.body.dataset.pronto = "1";
}

(() => {
  const nucleos = navigator.hardwareConcurrency || 4, padrao = Math.max(1, Math.min(4, nucleos - 1));
  $("paralelo").innerHTML = [1, 2, 3, 4, 6, 8].map((n) => `<option ${n === padrao ? "selected" : ""}>${n}</option>`).join("");
  $("arquivo").onchange = (e) => escolher(e.target.files);
  const z = $("solta");
  z.ondragover = (e) => { e.preventDefault(); z.classList.add("sobre"); };
  z.ondragleave = () => z.classList.remove("sobre");
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove("sobre"); escolher(e.dataTransfer.files); };
  $("iniciar").onclick = iniciar;
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando…"; };
})();
