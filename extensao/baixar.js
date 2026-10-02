// Download seletivo dos arquivos de um processo (movimentação → arquivos), com índice, marcadores e OCR.
import { fazerOcr, pdfjs, seguro, fmt } from "./ocr-motor.js";

const { PDFDocument, StandardFonts, PDFHexString, PDFName, rgb } = PDFLib;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const log = (t) => { const el = $("log"); el.textContent += t + "\n"; el.scrollTop = el.scrollHeight; };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nomeSeguro = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "_").trim();
const A4 = [595, 842], MARGEM = 50;
let job = null, cancelado = false, rodando = false;

// ---------- obter e identificar cada arquivo ----------
const latin1 = (b) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return s; };

function detectar(b, ct = "") {
  const cab = latin1(b.subarray(0, 1024));
  const i = cab.indexOf("%PDF-");
  if (i >= 0 && i < 1024) return { tipo: "pdf", bytes: b.subarray(i) };
  if (b[0] === 0xff && b[1] === 0xd8) return { tipo: "jpg", bytes: b };
  if (b[0] === 0x89 && cab.slice(1, 4) === "PNG") return { tipo: "png", bytes: b };
  if (cab.startsWith("GIF")) return { tipo: "gif", bytes: b };
  if (cab.startsWith("BM")) return { tipo: "bmp", bytes: b };
  if (cab.slice(8, 12) === "WEBP") return { tipo: "webp", bytes: b };
  if (cab.startsWith("<") || /<\s*(!doctype|html|body|head)/i.test(cab) || /html/i.test(ct)) return { tipo: "html", bytes: b };
  if (/audio|video/i.test(ct)) return { tipo: "midia", bytes: b };
  return { tipo: "outro", bytes: b };
}

function decodificar(bytes) {
  const m = latin1(bytes.subarray(0, 2048)).match(/charset=["']?([\w-]+)/i);
  const cs = (m && m[1].toLowerCase()) || "windows-1252";
  try { return new TextDecoder(/utf-?8/.test(cs) ? "utf-8" : "windows-1252").decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// páginas "moldura" que só embutem o arquivo real (iframe/embed/object)
function destinoEmbutido(bytes, base) {
  const d = new DOMParser().parseFromString(decodificar(bytes), "text/html");
  if ((d.body && d.body.textContent.trim().length) > 300) return null;
  const el = d.querySelector("iframe[src],embed[src],object[data]");
  const src = el && (el.getAttribute("src") || el.getAttribute("data"));
  return src && !/^about:|^javascript:/i.test(src) ? new URL(src, base).href : null;
}

async function obter(url, saltos = 0) {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const d = detectar(bytes, r.headers.get("content-type") || "");
  if (d.tipo === "html" && saltos < 2) { const dest = destinoEmbutido(bytes, url); if (dest) return obter(dest, saltos + 1); }
  return d;
}

// ---------- converter cada tipo em páginas de PDF ----------
function textoLegivel(no, out = []) {
  const BLOCO = /^(P|DIV|LI|TR|H[1-6]|TABLE|UL|OL|BR|SECTION|ARTICLE|BLOCKQUOTE|PRE|HR)$/;
  for (const n of no.childNodes) {
    if (n.nodeType === 3) out.push(n.nodeValue.replace(/\s+/g, " "));
    else if (n.nodeType === 1 && !/^(SCRIPT|STYLE|NOSCRIPT|HEAD)$/.test(n.tagName)) {
      const b = BLOCO.test(n.tagName);
      if (b) out.push("\n");
      textoLegivel(n, out);
      if (/^(TD|TH)$/.test(n.tagName)) out.push(" | ");
      if (b) out.push("\n");
    }
  }
  return out;
}

function quebrar(font, size, texto, largura) {
  const linhas = [], esp = font.widthOfTextAtSize(" ", size);
  for (const par of texto.split("\n")) {
    if (!par.trim()) { linhas.push(""); continue; }
    let atual = "", larg = 0;
    for (let palavra of par.trim().split(/\s+/)) {
      let w = font.widthOfTextAtSize(palavra, size);
      while (w > largura) { // palavra maior que a linha: corta
        let k = palavra.length; while (k > 1 && font.widthOfTextAtSize(palavra.slice(0, k), size) > largura) k--;
        if (atual) { linhas.push(atual); atual = ""; larg = 0; }
        linhas.push(palavra.slice(0, k)); palavra = palavra.slice(k); w = font.widthOfTextAtSize(palavra, size);
      }
      if (atual && larg + esp + w <= largura) { atual += " " + palavra; larg += esp + w; }
      else { if (atual) linhas.push(atual); atual = palavra; larg = w; }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

function paginasDeTexto(out, fontes, titulo, texto) {
  const { r, b } = fontes, tam = 10.5, alt = 13.5, larg = A4[0] - 2 * MARGEM;
  const limpo = texto.split("\n").map((l) => seguro(r, l)).join("\n");   // (o \n não existe na fonte do PDF: filtra linha a linha)
  const linhas = [...quebrar(b, 12, seguro(b, titulo), larg), "", ...quebrar(r, tam, limpo, larg)];
  const nTit = quebrar(b, 12, seguro(b, titulo), larg).length;
  let pagina = null, y = 0, adicionadas = 0;
  linhas.forEach((l, i) => {
    if (!pagina || y < MARGEM) { pagina = out.addPage(A4); y = A4[1] - MARGEM; adicionadas++; }
    const titulo_ = i < nTit;
    if (l) pagina.drawText(l, { x: MARGEM, y, size: titulo_ ? 12 : tam, font: titulo_ ? b : r, color: rgb(0, 0, 0) });
    y -= titulo_ ? 15 : alt;
  });
  return adicionadas || (out.addPage(A4), 1);
}

async function imagemParaPagina(out, bytes, tipo) {
  let img;
  if (tipo === "jpg") img = await out.embedJpg(bytes);
  else if (tipo === "png") img = await out.embedPng(bytes);
  else { // gif, bmp, webp: o navegador decodifica e reencodamos como PNG
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    const png = new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, "image/png"))).arrayBuffer());
    img = await out.embedPng(png);
  }
  const f = Math.min(A4[0] / img.width, A4[1] / img.height, 1);
  const p = out.addPage([img.width * f, img.height * f]);
  p.drawImage(img, { x: 0, y: 0, width: img.width * f, height: img.height * f });
  return 1;
}

async function rasterizar(out, bytes) { // plano B para PDFs que o pdf-lib não consegue copiar
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), v1 = page.getViewport({ scale: 1 }), v = page.getViewport({ scale: 1.6 });
    const c = document.createElement("canvas"); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, canvas: c, viewport: v }).promise;
    const jpg = new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85))).arrayBuffer());
    const im = await out.embedJpg(jpg), p = out.addPage([v1.width, v1.height]);
    p.drawImage(im, { x: 0, y: 0, width: v1.width, height: v1.height });
    page.cleanup();
  }
  return pdf.numPages;
}

async function adicionarArquivo(out, fontes, f, d) {
  switch (d.tipo) {
    case "pdf": {
      try {
        const src = await PDFDocument.load(d.bytes, { ignoreEncryption: true });
        const pags = await out.copyPages(src, src.getPageIndices());
        pags.forEach((p) => out.addPage(p));
        return pags.length;
      } catch (e) { log(`  (${f.nome}: cópia direta falhou — "${e.message}" — convertendo páginas em imagem)`); return rasterizar(out, d.bytes); }
    }
    case "html": {
      const doc = new DOMParser().parseFromString(decodificar(d.bytes), "text/html");
      const texto = textoLegivel(doc.body).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!texto) throw new Error("documento HTML sem texto");
      return paginasDeTexto(out, fontes, f.nome, texto);
    }
    case "jpg": case "png": case "gif": case "bmp": case "webp": return imagemParaPagina(out, d.bytes, d.tipo);
    default: throw new Error(`tipo de arquivo não incluído no PDF (${d.tipo === "midia" ? "áudio/vídeo" : d.tipo})`);
  }
}

// ---------- índice e marcadores ----------
const cortar = (font, size, txt, larg) => { let t = txt; while (t.length > 3 && font.widthOfTextAtSize(t, size) > larg) t = t.slice(0, -2); return t === txt ? t : t.trimEnd() + "…"; };

function montarIndice(out, fontes, processo, movs, nCorpo) {
  const { r, b } = fontes, linhas = [];
  linhas.push({ t: "ÍNDICE DOS ARQUIVOS", bold: true, size: 14 });
  if (processo) linhas.push({ t: "Processo " + processo, bold: true, size: 11 });
  linhas.push({ t: "Gerado em " + new Date().toLocaleString("pt-BR"), size: 9 }, { t: "" });
  for (const m of movs) {
    linhas.push({ t: m.titulo, bold: true, size: 10.5 });
    for (const a of m.itens) linhas.push({ t: a.nome, ind: 16, pag: a.erro ? null : a.inicio, erro: a.erro });
  }
  const POR = Math.floor((A4[1] - 2 * MARGEM) / 14), k = Math.max(1, Math.ceil(linhas.length / POR));
  for (let i = 0; i < k; i++) out.insertPage(i, A4);
  linhas.forEach((l, i) => {
    const p = out.getPage(Math.floor(i / POR)), y = A4[1] - MARGEM - (i % POR) * 14;
    const fonte = l.bold ? b : r, size = l.size || 10, x = MARGEM + (l.ind || 0);
    const direita = l.pag != null ? `pág. ${l.pag + k + 1}` : l.erro ? "não incluído" : "";
    const larg = A4[0] - 2 * MARGEM - (l.ind || 0) - r.widthOfTextAtSize("não incluído  ", 9) - 8;
    const txt = seguro(fonte, cortar(fonte, size, seguro(fonte, l.t), l.erro ? larg - 140 : larg));
    p.drawText(txt, { x, y, size, font: fonte, color: l.erro ? rgb(0.7, 0, 0.1) : rgb(0, 0, 0) });
    if (direita) p.drawText(direita, { x: A4[0] - MARGEM - r.widthOfTextAtSize(direita, 9), y, size: 9, font: r, color: l.erro ? rgb(0.7, 0, 0.1) : rgb(0.1, 0.2, 0.5) });
    if (l.erro) p.drawText(seguro(r, cortar(r, 8, "— " + l.erro, 220)), { x: x + 4 + fonte.widthOfTextAtSize(txt, size), y, size: 8, font: r, color: rgb(0.7, 0, 0.1) });
  });
  return k;
}

function adicionarMarcadores(doc, itens) {
  const ctx = doc.context, paginas = doc.getPages();
  const criar = (lista, pai) => {
    const refs = lista.map(() => ctx.nextRef());
    lista.forEach((it, i) => {
      const d = ctx.obj({ Title: PDFHexString.fromText(it.titulo), Parent: pai, Dest: [paginas[it.pagina].ref, "XYZ", null, null, null] });
      if (i > 0) d.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < lista.length - 1) d.set(PDFName.of("Next"), refs[i + 1]);
      if (it.filhos && it.filhos.length) {
        const fr = criar(it.filhos, refs[i]);
        d.set(PDFName.of("First"), fr[0]); d.set(PDFName.of("Last"), fr[fr.length - 1]);
        d.set(PDFName.of("Count"), ctx.obj(it.filhos.length));
      }
      ctx.assign(refs[i], d);
    });
    return refs;
  };
  const raiz = ctx.nextRef(), refs = criar(itens, raiz);
  ctx.assign(raiz, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: itens.length }));
  doc.catalog.set(PDFName.of("Outlines"), raiz);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

// ---------- fluxo principal ----------
const ganchos = () => ({
  log, status: (t) => ($("status").textContent = t),
  progresso: (f, t) => { $("barra").hidden = false; $("barra").max = t; $("barra").value = f; },
  cancelado: () => cancelado,
});
const li = (f) => document.querySelector(`#andamento li[data-o="${f.ordem}"]`);
const marca = (f, html) => { const e = li(f); if (e) e.innerHTML = html; };

async function baixarTodos(sel, fontes, out) {
  const entradas = []; // por arquivo: { f, inicio, paginas, erro }
  for (const f of sel) {
    if (cancelado) throw new Error("cancelado");
    marca(f, `⏳ ${esc(f.nome)} — baixando…`);
    try {
      if (!f.url) throw new Error("o Projudi não informou o endereço deste arquivo");
      const d = await obter(f.url);
      const inicio = out.getPageCount();
      const n = await adicionarArquivo(out, fontes, f, d);
      entradas.push({ f, inicio, paginas: n });
      marca(f, `<span class="ok">✔</span> ${esc(f.nome)} — ${n} página(s)`);
    } catch (e) {
      entradas.push({ f, erro: e.message });
      marca(f, `<span class="erro">✖ ${esc(f.nome)} — ${esc(e.message)}</span>`);
      log(`✖ ${f.nome}: ${e.message}`);
    }
    await pausa(250); // ritmo humano
  }
  return entradas;
}

function agruparPorMov(entradas) {
  const m = new Map();
  for (const e of entradas) {
    const k = e.f.mov;
    if (!m.has(k)) m.set(k, { n: k, titulo: e.f.movTitulo, itens: [] });
    m.get(k).itens.push({ nome: e.f.nome, inicio: e.inicio, paginas: e.paginas, erro: e.erro });
  }
  return [...m.values()];
}

async function salvar(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const id = await chrome.downloads.download({ url, filename: nome, conflictAction: "uniquify", saveAs: false });
  const a = document.createElement("a"); a.href = url; a.download = nome.split("/").pop(); a.textContent = `Baixar de novo: ${nome}`;
  const div = document.createElement("div"); div.className = "res"; div.append(a); $("resultados").append(div);
  const [it] = await chrome.downloads.search({ id });
  document.body.dataset.salvo = (document.body.dataset.salvo ? document.body.dataset.salvo + "|" : "") + (it ? it.filename : nome);
  return id;
}

async function executar(sel, op) {
  rodando = true; cancelado = false;
  $("baixar").disabled = true; $("cancelar").disabled = false; $("resultados").textContent = "";
  $("andamento").innerHTML = sel.map((f) => `<li data-o="${f.ordem}">• ${esc(f.nome)}</li>`).join("");
  const processo = job.processo || "processo";
  const ocrOp = { escala: 2.2, paralelo: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), forcar: false };
  try {
    if (op.unico) {
      const out = await PDFDocument.create();
      const fontes = { r: await out.embedFont(StandardFonts.Helvetica), b: await out.embedFont(StandardFonts.HelveticaBold) };
      const entradas = await baixarTodos(sel, fontes, out);
      const corpo = out.getPageCount();
      if (!corpo) throw new Error("nenhum arquivo pôde ser baixado");
      $("status").textContent = "Montando índice e marcadores…";
      const movs = agruparPorMov(entradas);
      const k = montarIndice(out, fontes, job.processo, movs, corpo);
      const marcadores = [{ titulo: "Índice", pagina: 0 }, ...movs.filter((m) => m.itens.some((a) => !a.erro)).map((m) => {
        const ok = m.itens.filter((a) => !a.erro);
        return { titulo: m.titulo.slice(0, 120), pagina: ok[0].inicio + k, filhos: ok.map((a) => ({ titulo: a.nome, pagina: a.inicio + k })) };
      })];
      adicionarMarcadores(out, marcadores);
      let bytes = await out.save();
      log(`PDF montado: ${out.getPageCount()} página(s) (${k} de índice).`);
      let ocrFeito = 0;
      if (op.ocr) { const r = await fazerOcr(bytes, ocrOp, ganchos()); bytes = r.bytes; ocrFeito = r.ocr; }
      const todos = sel.length === job.movimentos.reduce((s, m) => s + m.arquivos.length, 0);
      await salvar(bytes, nomeSeguro(`${processo}-${todos ? "completo" : "selecionados"}${op.ocr ? "-OCR" : ""}.pdf`));
      $("status").textContent = `Pronto: ${out.getPageCount()} página(s)${op.ocr ? `, ${ocrFeito} com OCR` : ""}.`;
    } else {
      let feitos = 0;
      for (const f of sel) {
        if (cancelado) throw new Error("cancelado");
        marca(f, `⏳ ${esc(f.nome)} — baixando…`);
        try {
          if (!f.url) throw new Error("o Projudi não informou o endereço deste arquivo");
          const d = await obter(f.url);
          const doc = await PDFDocument.create();
          const fontes = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
          const n = await adicionarArquivo(doc, fontes, f, d);
          let bytes = await doc.save();
          if (op.ocr) { marca(f, `⏳ ${esc(f.nome)} — OCR…`); bytes = (await fazerOcr(bytes, ocrOp, ganchos())).bytes; }
          const nome = nomeSeguro(`Processo ${processo}/${String(f.ordem + 1).padStart(3, "0")} - ${f.nome.replace(/\.[a-z0-9]+$/i, "")}${op.ocr ? "-OCR" : ""}.pdf`);
          await salvar(bytes, nome); feitos++;
          marca(f, `<span class="ok">✔</span> ${esc(f.nome)} — ${n} página(s), salvo`);
        } catch (e) { if (cancelado) throw e; marca(f, `<span class="erro">✖ ${esc(f.nome)} — ${esc(e.message)}</span>`); log(`✖ ${f.nome}: ${e.message}`); }
      }
      $("status").textContent = `Pronto: ${feitos} de ${sel.length} arquivo(s) salvos na pasta "Processo ${processo}" em Downloads.`;
    }
    chrome.notifications.create({ type: "basic", iconUrl: "icone.png", title: "Arquivos do processo prontos", message: $("status").textContent });
    document.body.dataset.pronto = "1";
  } catch (e) {
    $("status").innerHTML = `<span class="erro">${esc(e.message)}</span>`;
    document.body.dataset.erro = e.message;
  } finally {
    rodando = false; $("barra").hidden = true; $("baixar").disabled = false; $("cancelar").disabled = true;
  }
}

// PDF completo gerado pelo próprio Projudi: a janela "Gerar PDF" recebe a seleção e a extensão captura o download.
async function pedirProjudi(sel) {
  const total = job.movimentos.reduce((s, m) => s + m.arquivos.length, 0);
  const idxEm = new Map(job.movimentos.flatMap((m) => m.arquivos.map((a, i) => [a.ordem, i])));
  const pedido = sel.length === total ? { todos: true } : { arquivos: sel.map((f) => ({ mov: f.mov, idx: idxEm.get(f.ordem), nome: f.nome })) };
  const r = await chrome.runtime.sendMessage({ acao: "gerar-pdf-projudi", tabId: job.tabId, pedido });
  $("status").innerHTML = r.erro ? `<span class="erro">${esc(r.erro)}</span>`
    : r.abriu ? "Abri a janela “Gerar PDF” do Projudi. Ela marca os arquivos e gera sozinha; o PDF será baixado automaticamente."
    : "Na aba do Projudi, clique em <b>Gerar PDF de processo completo</b>: a janela que abrir já virá com a sua seleção e gera sozinha.";
  document.body.dataset.pedido = JSON.stringify(pedido);
}

// ---------- tela de seleção ----------
function desenharArvore() {
  const movs = job.movimentos.filter((m) => m.arquivos.length);
  $("proc").textContent = job.processo || "";
  $("arvore").innerHTML = movs.map((m) => `<div class="mov"><label><input type="checkbox" data-mov="${m.n}"> ${esc(m.titulo)}</label><ul>` +
    m.arquivos.map((a) => `<li><label class="${a.url ? "" : "semurl"}"><input type="checkbox" data-o="${a.ordem}" ${a.url ? "" : "disabled"}> ${esc(a.nome)} <small>${a.tipo === "pdf" ? "PDF" : a.tipo === "html" ? "documento" : a.tipo === "imagem" ? "imagem" : esc(a.ext)}${a.url ? "" : " — sem endereço"}</small></label></li>`).join("") +
    `</ul></div>`).join("") || "Nenhum arquivo encontrado.";
  atualizarContagem();
}
const marcados = () => [...document.querySelectorAll("#arvore input[data-o]:checked")].map((c) => +c.dataset.o);
function atualizarContagem() {
  const n = marcados().length, total = document.querySelectorAll("#arvore input[data-o]:not(:disabled)").length;
  $("contagem").textContent = `${n} de ${total} arquivo(s) selecionado(s)`;
  $("baixar").disabled = rodando || !n;
  $("todos").checked = n > 0 && n === total;
}

(async () => {
  const id = new URLSearchParams(location.search).get("job");
  job = id ? (await chrome.storage.local.get("baixar_" + id))["baixar_" + id] : null;
  if (!job) { $("arvore").textContent = "Abra a aba “Navegação de Arquivos” de um processo e use o botão “Baixar arquivos do processo”."; return; }
  desenharArvore();
  $("arvore").addEventListener("change", (e) => {
    const c = e.target;
    if (c.dataset.mov !== undefined) c.closest(".mov").querySelectorAll("input[data-o]:not(:disabled)").forEach((x) => (x.checked = c.checked));
    else { const mov = c.closest(".mov"), todos = [...mov.querySelectorAll("input[data-o]:not(:disabled)")]; mov.querySelector("input[data-mov]").checked = todos.every((x) => x.checked); }
    atualizarContagem();
  });
  $("todos").onchange = () => { document.querySelectorAll("#arvore input[type=checkbox]:not(:disabled)").forEach((c) => (c.checked = $("todos").checked)); atualizarContagem(); };
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando…"; };
  $("baixar").onclick = () => {
    const ordens = new Set(marcados()), arquivos = [];
    for (const m of job.movimentos) for (const a of m.arquivos) if (ordens.has(a.ordem)) arquivos.push({ ...a, mov: m.n, movTitulo: m.titulo });
    const modo = document.querySelector("input[name=modo]:checked").value;
    if (modo === "projudi") return pedirProjudi(arquivos);
    executar(arquivos, { unico: document.querySelector("input[name=modo]:checked").value === "unico", ocr: $("ocr").checked });
  };
  $("diag").onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ origem: job.origem, processo: job.processo, lido: job.movimentos.slice(0, 15).map((m) => ({ ...m, arquivos: m.arquivos.slice(0, 6) })), html: job.html }, null, 1));
    $("diag").textContent = "Copiado! Cole no chat";
  };
  document.body.dataset.carregado = "1";
})();
