import { montarPdf, nomePadrao, semBarra, acharServentia } from "./modelos-pdf.js";
import { enviarBase } from "./studio-cliente.js";
// Fila: para cada processo selecionado, abre o processo, pede o PDF completo ao Projudi e deixa a página de OCR salvar PDF + texto.
const BASE = "https://projudi.tjgo.jus.br/";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
let cancelado = false;

function carregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ou); ok(false); }, ms);
    const ou = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ou); ok(true); } };
    chrome.tabs.onUpdated.addListener(ou);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") ou(tabId, { status: "complete" }); }).catch(() => {});
  });
}

function esperarFim(chave, ms) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.storage.onChanged.removeListener(ou); ok({ ok: false, erro: "tempo esgotado" }); }, ms);
    const ou = (c, area) => { if (area === "local" && c[chave] && c[chave].newValue) { clearTimeout(fim); chrome.storage.onChanged.removeListener(ou); ok(c[chave].newValue); } };
    chrome.storage.onChanged.addListener(ou);
    chrome.storage.local.get(chave).then((o) => { if (o[chave]) ou({ [chave]: { newValue: o[chave] } }, "local"); });
  });
}

const registro = [];      // linha do tempo, para diagnóstico
const limite = (promessa, ms, msg) => Promise.race([promessa, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

// Minuta já escrita no editor da pré-análise (para a Lupa do Magistrado): abre a tela da pré-análise e lê o editor (CKEditor/TinyMCE).
async function lerMinutaPre(urlPre) {
  const tab = await chrome.tabs.create({ url: new URL(urlPre, BASE).href, active: false });
  try {
    await carregou(tab.id); await dorme(2000);
    for (let k = 0; k < 10; k++) {
      const r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", func: () => {
        try {
          const ck = window.CKEDITOR; if (ck && ck.instances) { const n = Object.keys(ck.instances)[0]; if (n) return ck.instances[n].getData(); }
          if (window.tinymce && window.tinymce.activeEditor) return window.tinymce.activeEditor.getContent();
        } catch (e) { /* sem editor neste quadro */ }
        return null;
      } }).catch(() => []);
      const html = r.map((x) => x.result).filter(Boolean).sort((a, b) => b.length - a.length)[0];
      if (html) {
        const d = new DOMParser().parseFromString(html, "text/html");
        d.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
        d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote").forEach((e) => e.append("\n"));
        return d.body.textContent.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      }
      await dorme(1000);
    }
    return "";
  } finally { chrome.tabs.remove(tab.id).catch(() => {}); }
}

async function processar(item, chave, pasta, etapa = () => {}, opcoes = {}) {
  const passo = (t) => { registro.push(new Date().toLocaleTimeString("pt-BR") + " " + item.processo + " — " + t); etapa(t); };
  passo("abrindo o processo");
  const url = new URL(item.url, BASE).href;
  const tab = await chrome.tabs.create({ url, active: false });
  let popup = null;
  try {
    await carregou(tab.id); await dorme(1500);
    passo("procurando o botão Gerar PDF");
    await chrome.storage.local.remove(["lote_fim_" + chave, "lote_prog_" + chave, "gerarpdf_pedido"]);
    let minuta = "";      // Lupa do Magistrado: usa a minuta que o assessor já escreveu na pré-análise
    if (opcoes.studio?.ativo && opcoes.studio.modo === "lupa" && item.situacao === "preAnalisadas" && item.urlPre) { passo("lendo a minuta escrita na pré-análise"); minuta = await limite(lerMinutaPre(item.urlPre), 60000, "a minuta da pré-análise não carregou").catch(() => ""); }
    await chrome.storage.local.set({ gerarpdf_pedido: { todos: true, processo: item.processo, pasta, lote: chave, ts: Date.now(), studio: opcoes.studio?.ativo ? { ativo: true, modo: opcoes.studio.modo, prompt: item.prompt || "", tipo: "", minuta, url: item.url, urlPre: item.urlPre || "", docs: !!opcoes.studio.docs && opcoes.studio.modo !== "lupa" } : null } });
    let r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a página do processo não respondeu (pode haver um aviso do Projudi aberto nela)");
    if (!r.achou) {   // o botão fica na aba "Navegação de Arquivos"
      await chrome.tabs.update(tab.id, { url: BASE + "BuscaProcesso?PaginaAtual=98&PassoBusca=4" });
      await carregou(tab.id); await dorme(1500);
      for (let k = 0; k < 8 && !r.achou; k++) { r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a aba “Navegação de Arquivos” não respondeu"); if (!r.achou) await dorme(1000); }
    }
    if (!r.achou) throw new Error("não achei o botão “Gerar PDF” no processo");
    passo("abrindo a janela Gerar PDF");
    if (r.url) popup = await chrome.tabs.create({ url: r.url, active: false });
    // a janela Gerar PDF consome o pedido; se ele continuar lá depois de 90 s, ela não abriu
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      if (!(await chrome.storage.local.get("gerarpdf_pedido")).gerarpdf_pedido) break;
      await dorme(1000);
    }
    if ((await chrome.storage.local.get("gerarpdf_pedido")).gerarpdf_pedido) throw new Error("a janela “Gerar PDF” não abriu ou não carregou");
    if (popup) { chrome.tabs.remove(popup.id).catch(() => {}); popup = null; }
    passo("janela Gerar PDF entregou o pedido; aguardando o início do OCR");
    const inicio = await esperarFim("lote_prog_" + chave, 150000);      // a página de OCR publica o andamento assim que recebe o pedido
    if (inicio.erro === "tempo esgotado" && !(await chrome.storage.local.get("lote_fim_" + chave))["lote_fim_" + chave]) throw new Error("a extensão não recebeu o pedido da janela Gerar PDF (a janela pode ter fechado antes de enviar)");
    passo("aguardando o Projudi gerar o PDF e a extensão fazer o OCR");
    const ouvir = (c, area) => { if (area === "local" && c["lote_prog_" + chave]?.newValue) passo(c["lote_prog_" + chave].newValue.txt); };
    chrome.storage.onChanged.addListener(ouvir);
    let fim;
    try { fim = await esperarFim("lote_fim_" + chave, 40 * 60000); } finally { chrome.storage.onChanged.removeListener(ouvir); }   // o OCR de um processo grande pode levar vários minutos
    if (!fim.ok) throw new Error(fim.erro || "falhou");
    return fim;
  } finally {
    if (popup) chrome.tabs.remove(popup.id).catch(() => {});
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

(async () => {
  const id = new URLSearchParams(location.search).get("lote");
  const job = id ? (await chrome.storage.local.get("lote_" + id))["lote_" + id] : null;
  if (!job) { $("status").textContent = "Selecione os processos no painel da extensão e use “Baixar PDFs dos selecionados”."; $("barra").hidden = true; return; }
  const itens = job.itens, pasta = job.pasta || "Projudi";
  $("lista").innerHTML = itens.map((p, i) => `<li data-i="${i}" class="fila">${esc(p.processo)} <small>${esc(p.classificador || "")}</small> — na fila</li>`).join("");
  $("barra").max = itens.length;
  const diag = document.createElement("button"); diag.textContent = "Copiar diagnóstico"; diag.style.marginLeft = "8px";
  diag.onclick = async () => { await navigator.clipboard.writeText(registro.join("\n")); diag.textContent = "Copiado! Cole no chat"; };
  $("cancelar").after(diag);
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando depois do processo atual…"; };
  const marca = (i, html, cls) => { const li = document.querySelector(`li[data-i="${i}"]`); li.className = cls; li.innerHTML = html; };
  if (job.opcoes?.atualizarBase) {     // cadastra/atualiza o PDF de modelos de cada vara selecionada na base do Studio
    const { modelos } = await chrome.storage.local.get("modelos");
    const varas = [...new Map(itens.map((p) => [p.serventia, p])).values()];
    $("base").hidden = false;
    for (const v of varas) {
      const li = document.createElement("li"); $("base").append(li);
      const d = acharServentia(modelos, v.serventia);
      if (!d || !d.modelos?.length) { li.innerHTML = `⚠ ${esc(v.serventia)} — sem modelos capturados do Projudi (pulei a base de conhecimento)`; continue; }
      try {
        li.textContent = `⏳ ${v.serventia} — montando e enviando o PDF de modelos…`;
        const nome = semBarra(v.arquivoModelos || nomePadrao(v.serventia)) + ".pdf";
        const r = await enviarBase(nome, await montarPdf({ serventia: v.serventia, modelos: d.modelos.map((m) => ({ ...m, serventia: v.serventia })) }));
        li.innerHTML = `<span class="ok">✔</span> ${esc(v.serventia)} — base de conhecimento: ${r.substituiu ? "documento substituído" : "documento cadastrado"} (${esc(nome)})`;
      } catch (e) {
        li.innerHTML = e.existe ? `⚠ <b>${esc(v.serventia)}</b> — ${esc(e.message)} (a análise segue normalmente; os modelos antigos continuam na base)` : `<span class="erro">✖ ${esc(v.serventia)} — base de conhecimento: ${esc(e.message)}</span>`;
      }
    }
  }
  let feitos = 0, erros = 0;
  for (let i = 0; i < itens.length && !cancelado; i++) {
    const p = itens[i];
    $("status").textContent = `Processo ${i + 1} de ${itens.length}: ${p.processo}`;
    marca(i, `⏳ ${esc(p.processo)} — baixando…`, "");
    try {
      const r = await processar(p, id + ":" + i, p.pasta || pasta, (t) => marca(i, `⏳ ${esc(p.processo)} — ${esc(t)}`, ""), job.opcoes || {});
      feitos++;
      await navigator.locks.request("baixados", async () => { const { baixados = {} } = await chrome.storage.local.get("baixados"); baixados[p.processo] = { em: Date.now(), arquivo: r.pdf }; await chrome.storage.local.set({ baixados }); });
      const st = r.studio ? (r.studio.ok ? (r.studio.parcial ? ` — Studio: ${esc(r.studio.mensagem)}` : r.studio.fila ? " — na esteira de minutas" : " — análise concluída no Studio" + (r.studio.docs ? (r.studio.docs.ok ? ` — Google Docs: ${esc(r.studio.docs.titulo)}` : ` — <span class="erro">Docs: ${esc(r.studio.docs.erro)}</span>`) : "")) : ` — <span class="erro">Studio: ${esc(r.studio.erro)}</span>`) : "";
      marca(i, `✔ ${esc(p.processo)} — ${r.paginas} páginas (${r.ocr} com OCR) — salvo${st}`, "ok");
    } catch (e) {
      erros++; marca(i, `✖ ${esc(p.processo)} — ${esc(e.message)}`, "erro");
    }
    $("barra").value = i + 1;
  }
  const resumo = `${cancelado ? "Cancelado. " : ""}${feitos} de ${itens.length} processo(s) baixado(s)${erros ? `, ${erros} com erro` : ""}.`;
  $("status").textContent = resumo; $("cancelar").disabled = true;
  document.body.dataset.pronto = "1"; document.body.dataset.resumo = JSON.stringify({ feitos, erros });
  chrome.notifications.create({ type: "basic", iconUrl: "icone.png", title: "PDFs dos processos", message: resumo });
})();
