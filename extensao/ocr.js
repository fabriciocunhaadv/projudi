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

// ---------- obter o PDF baixado pelo Projudi ----------
const arquivoUrl = (caminho) => "file:///" + encodeURI(caminho.replace(/\\/g, "/").replace(/^\//, "")).replace(/#/g, "%23");
const ehPdf = (b) => b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // "%PDF"

async function obterBytes(job) {
  const falhas = [];
  // 1) o arquivo que o Chrome acabou de gravar (exige "Permitir acesso a URLs de arquivo" nos detalhes da extensão)
  try {
    if (job.filename && (await chrome.extension.isAllowedFileSchemeAccess())) {
      const r = await fetch(arquivoUrl(job.filename));
      const b = new Uint8Array(await r.arrayBuffer());
      if (r.ok && ehPdf(b)) return { bytes: b, origem: "arquivo baixado" };
      falhas.push("arquivo local ilegível");
    } else falhas.push("acesso a arquivos locais desligado");
  } catch (e) { falhas.push("arquivo local: " + e.message); }
  // 2) baixar de novo pelo mesmo endereço, com a sua sessão do Projudi
  try {
    const r = await fetch(job.url, { credentials: "include", cache: "no-store" });
    const b = new Uint8Array(await r.arrayBuffer());
    if (r.ok && ehPdf(b)) return { bytes: b, origem: "novo download" };
    falhas.push(`o endereço não devolveu PDF (HTTP ${r.status})`);
  } catch (e) { falhas.push("novo download: " + e.message); }
  throw new Error(falhas.join("; "));
}

const nomeBase = (caminho) => (caminho || "processo.pdf").split(/[\\/]/).pop().replace(/\.pdf$/i, "");

function esperarDownload(id, ms = 120000) {
  return new Promise((ok) => {
    const fim = setTimeout(() => ok(false), ms);
    const ouvir = (d) => { if (d.id === id && d.state && d.state.current !== "in_progress") { clearTimeout(fim); chrome.downloads.onChanged.removeListener(ouvir); ok(d.state.current === "complete"); } };
    chrome.downloads.onChanged.addListener(ouvir);
    chrome.downloads.search({ id }).then(([it]) => { if (it && it.state !== "in_progress") ouvir({ id, state: { current: it.state } }); });
  });
}

const avisar = (titulo, msg) => chrome.notifications.create({ type: "basic", iconUrl: "icone.png", title: titulo, message: msg });

async function automatico(idDownload) {
  document.body.dataset.modo = "auto";
  const chave = "ocr_" + idDownload;
  const job = (await chrome.storage.local.get(chave))[chave];
  if (!job) { log("Download não encontrado."); return; }
  const cfg = { ocrAutomatico: true, apagarOriginal: false, ...(await chrome.storage.sync.get("ocr")).ocr };
  rodando = true; cancelado = false; $("cancelar").disabled = false;
  $("status").textContent = "Lendo o PDF baixado…";
  try {
    const { bytes, origem } = await obterBytes(job);
    log(`PDF obtido (${origem}): ${(bytes.length / 1048576).toFixed(1)} MB`);
    const arquivo = new File([bytes], nomeBase(job.filename) + ".pdf", { type: "application/pdf" });
    const r = await processar(arquivo, { escala: +$("escala").value, paralelo: +$("paralelo").value, forcar: false });
    if (!r.ocr) {
      $("status").textContent = "Este PDF já tem texto selecionável em todas as páginas: nada a fazer.";
      avisar("PDF do Projudi", `${arquivo.name} já tem texto selecionável (OCR não necessário).`);
    } else {
      const nome = nomeBase(job.filename) + "-OCR.pdf";
      const url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
      const id = await chrome.downloads.download({ url, filename: nome, conflictAction: "uniquify", saveAs: false });
      const salvo = await esperarDownload(id);
      const [item] = await chrome.downloads.search({ id });
      $("status").textContent = salvo ? `Pronto: ${item.filename}` : "Não foi possível salvar o arquivo.";
      document.body.dataset.salvo = item ? item.filename : "";
      if (salvo) {
        avisar("PDF com OCR pronto", `${nome} salvo em Downloads (${r.ocr} de ${r.total} páginas com OCR).`);
        if (cfg.apagarOriginal) await chrome.downloads.removeFile(job.id).catch(() => {});
      }
      URL.revokeObjectURL(url);
    }
    await chrome.storage.local.remove(chave);
    rodando = false; $("cancelar").disabled = true; $("barra").hidden = true;
    document.body.dataset.pronto = "1";
    setTimeout(() => window.close(), 4000);
  } catch (e) {
    rodando = false; $("cancelar").disabled = true;
    log("✖ " + e.message);
    $("status").innerHTML = '<span class="erro">Não consegui ler o PDF baixado.</span> Solte o arquivo aqui em cima, ou ative “Permitir acesso a URLs de arquivo” nos detalhes da extensão (chrome://extensions).';
    avisar("OCR do PDF do Projudi", "Não consegui ler o PDF baixado. Abra a página de OCR e solte o arquivo, ou ative “Permitir acesso a URLs de arquivo” na extensão.");
    document.body.dataset.erro = e.message;
  }
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
  const auto = new URLSearchParams(location.search).get("auto");
  if (auto) automatico(+auto);
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando…"; };
})();
