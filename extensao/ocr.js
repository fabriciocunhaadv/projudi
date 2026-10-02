// Página de OCR: tela, arrastar/soltar e OCR automático dos PDFs baixados do Projudi. O trabalho pesado está em ocr-motor.js.
import { fazerOcr, fmt } from "./ocr-motor.js";
import { textoComOrigem } from "./texto-origem.js";

const $ = (id) => document.getElementById(id);
let arquivos = [], cancelado = false, rodando = false;

const log = (t) => { const el = $("log"); el.textContent += t + "\n"; el.scrollTop = el.scrollHeight; };

function escolher(lista) {
  arquivos = [...lista].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  $("iniciar").disabled = !arquivos.length || rodando;
  $("status").textContent = arquivos.length ? `${arquivos.length} arquivo(s): ${arquivos.map((f) => f.name).join(", ")}` : "";
}

async function processar(arquivo, opcoes) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  log(`\n▶ ${arquivo.name}`);
  $("barra").hidden = false;
  return fazerOcr(bytes, opcoes, {
    log,
    status: (t) => ($("status").textContent = t),
    progresso: (feitas, total) => { $("barra").max = total; $("barra").value = feitas; },
    cancelado: () => cancelado,
  });
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

// PDF pedido ao Projudi pela janela "Gerar PDF": a extensão recebe o PDF antes de ir para Downloads, faz o OCR e salva só o pesquisável.
async function interceptado(idJob) {
  document.body.dataset.modo = "auto";
  const chave = "gerar_" + idJob, job = (await chrome.storage.local.get(chave))[chave];
  if (!job) { log("Pedido não encontrado."); return; }
  rodando = true; cancelado = false; $("cancelar").disabled = false;
  $("status").textContent = "Pedindo o PDF ao Projudi (pode demorar)…";
  try {
    const r = await fetch(job.url, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: job.corpo });
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!r.ok || !ehPdf(bytes)) throw new Error(`o Projudi não devolveu um PDF (HTTP ${r.status}). Use o botão Gerar normal da janela: o OCR automático cuida do arquivo baixado.`);
    log(`PDF recebido do Projudi: ${(bytes.length / 1048576).toFixed(1)} MB`);
    const num = (job.nome || "").replace(/[^\w.\-]+/g, "_") || "processo", pasta = job.pasta ? job.pasta.replace(/[<>:"|?*\\]+/g, "_").replace(/^\/+|\/+$/g, "") + "/" : "";
    const res = await processar(new File([bytes], num + ".pdf", { type: "application/pdf" }), { escala: +$("escala").value, paralelo: +$("paralelo").value, forcar: false });
    const salvar = async (blob, nome) => {
      const url = URL.createObjectURL(blob);
      const id = await chrome.downloads.download({ url, filename: pasta + nome, conflictAction: "uniquify", saveAs: false });
      const ok = await esperarDownload(id), [item] = await chrome.downloads.search({ id });
      URL.revokeObjectURL(url);
      if (!ok) throw new Error("não foi possível salvar " + nome);
      return item.filename;
    };
    $("status").textContent = "Salvando o PDF…";
    const arqPdf = await salvar(new Blob([res.bytes], { type: "application/pdf" }), num + "-OCR.pdf");
    $("status").textContent = "Gerando o texto com a origem de cada trecho…";
    const t = await textoComOrigem(res.bytes, { processo: job.nome, paginasOcr: res.paginasOcr || [] });
    const arqTxt = await salvar(new Blob([t.texto], { type: "text/plain;charset=utf-8" }), num + "-OCR.txt");
    log(`Texto: ${t.paginas} páginas, ${t.comOrigem} com origem identificada.`);
    $("status").textContent = `Pronto: ${arqPdf} e ${arqTxt}`;
    document.body.dataset.salvo = arqPdf + "|" + arqTxt;
    avisar("PDF do processo pronto", `${num}-OCR.pdf e .txt salvos (${res.ocr} de ${res.total} páginas com OCR).`);
    if (job.lote) await chrome.storage.local.set({ ["lote_fim_" + job.lote]: { ok: true, pdf: arqPdf, txt: arqTxt, paginas: res.total, ocr: res.ocr } });
    await chrome.storage.local.remove(chave);
    document.body.dataset.pronto = "1";
    setTimeout(() => window.close(), 5000);
  } catch (e) {
    log("✖ " + e.message);
    $("status").innerHTML = `<span class="erro">${e.message}</span>`;
    avisar("PDF do processo", e.message);
    document.body.dataset.erro = e.message;
    if (job.lote) await chrome.storage.local.set({ ["lote_fim_" + job.lote]: { ok: false, erro: e.message } });
  } finally { rodando = false; $("cancelar").disabled = true; $("barra").hidden = true; }
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
  const ger = new URLSearchParams(location.search).get("gerar");
  if (ger) interceptado(ger);
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando…"; };
})();
