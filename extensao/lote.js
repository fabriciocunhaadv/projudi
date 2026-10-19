import { chaveProc } from "./proc-chave.js";
import { montarPdf, nomePadrao, semBarra, acharServentia } from "./modelos-pdf.js";
import { enviarBase } from "./studio-cliente.js";
import { manterAcordado } from "./acordado.js";
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

// Minuta já escrita no editor da pré-análise (para a Lupa do Magistrado). Na “Busca de Pré-Análises” o ícone Visualizar é um BOTÃO (sem link):
// abre a lista, acha a linha do processo, clica em Visualizar e lê o editor (CKEditor/TinyMCE) que abrir — na mesma aba ou em outra.
const lerEditor = (tabId) => chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: () => {
  try {
    const ck = window.CKEDITOR; if (ck && ck.instances) { const n = Object.keys(ck.instances)[0]; if (n) return ck.instances[n].getData(); }
    if (window.tinymce && window.tinymce.activeEditor) return window.tinymce.activeEditor.getContent();
    const fixo = document.getElementById("divTextoEditor");      // tela “Texto Pré-Análise”: a minuta já escrita fica em HTML fixo (não é um editor)
    if (fixo && fixo.innerText && fixo.innerText.trim().length > 20) return fixo.innerHTML;
  } catch (e) { /* sem editor neste quadro */ }
  return null;
} }).catch(() => []);
function htmlParaTexto(html) {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote").forEach((e) => e.append("\n"));
  d.querySelectorAll("img,hr").forEach((e) => e.remove());
  let t = d.body.textContent.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // a minuta começa no título do ato; o que vem antes é o timbre do gabinete e a identificação das partes
  const ini = t.search(/^(DESPACHO|DECIS[ÃA]O( INTERLOCUT[ÓO]RIA)?|SENTEN[ÇC]A)\s*$/m);
  if (ini > 0 && t.slice(0, ini).split("\n").length < 25) t = t.slice(ini);
  return t;
}
async function lerMinutaPre(item) {
  const digitos = chaveProc(item.processo), novas = [];
  const aoCriar = (t) => novas.push(t.id); chrome.tabs.onCreated.addListener(aoCriar);
  const tab = await chrome.tabs.create({ url: BASE + "PreAnalisarConclusao?PaginaAtual=6&tipo=todas", active: false });
  const motivo = { m: "" };
  try {
    // As listas do Projudi são da serventia ativa NA SESSÃO (e a verificação deixa a sessão na última serventia lida): escolhe a do processo antes.
    if (item.serventiaUrl) {
      await chrome.tabs.update(tab.id, { url: new URL(item.serventiaUrl, BASE).href }); await dorme(600);
      await carregou(tab.id); await dorme(1200);
      await chrome.tabs.update(tab.id, { url: BASE + "PreAnalisarConclusao?PaginaAtual=6&tipo=todas" }); await dorme(600);
    }
    await carregou(tab.id); await dorme(1500);
    const clicar = (alvo) => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", args: [alvo], func: (dig) => {
      // O Visualizar chama submeter2(...) e o Projudi abre o editor em NOVA aba; sem clique do usuário o Chrome bloquearia esse pop-up.
      // Nesta aba (só nela) o envio passa a abrir na própria aba, e a extensão lê o editor aqui mesmo.
      if (!window.__projudiMesmaAba) {
        window.__projudiMesmaAba = true;
        const sub = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { this.target = "_self"; return sub.call(this); };
        const rs = HTMLFormElement.prototype.requestSubmit; if (rs) HTMLFormElement.prototype.requestSubmit = function (...a) { this.target = "_self"; return rs.apply(this, a); };
        document.addEventListener("submit", (e) => { if (e.target && e.target.tagName === "FORM") e.target.target = "_self"; }, true);
        const abrir = window.open; window.open = function (u) { if (u) { location.href = u; return window; } return abrir.apply(this, arguments); };
      }
      const chave = (s) => { const t = String(s || ""), m = t.match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/); return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : t.replace(/\D/g, "").slice(0, 9); };      // (roda na página do Projudi: o módulo não existe aqui)
      const linhas = [...document.querySelectorAll("tr")].filter((tr) => tr.querySelector("a[href*='Id_Processo']"));
      const tr = linhas.find((r) => [...r.querySelectorAll("a[href*='Id_Processo']")].some((a) => chave(a.textContent) === dig));
      if (!tr) return linhas.length ? "linhas:" + linhas.length : "";
      const b = tr.querySelector("button[title='Visualizar'],a[title='Visualizar'],[title='Visualizar']") || tr.querySelector("button.imgIcons");
      if (!b) return "sem-botao"; b.click(); return "clicou";
    } }).then((r) => r.map((x) => x.result).find((x) => x === "clicou" || x === "sem-botao") || r.map((x) => x.result).find(Boolean) || "").catch(() => "");
    // a lista pode demorar a carregar: tenta por até ~30 s; no meio do caminho aperta “Consultar” uma vez (a lista pode vir vazia até isso)
    let r = "", viuLinhas = 0, consultou = false;
    for (let k = 0; k < 30 && r !== "clicou" && r !== "sem-botao"; k++) {
      r = await clicar(digitos);
      if (/^linhas:/.test(r)) viuLinhas = +r.split(":")[1];
      if (r !== "clicou" && r !== "sem-botao") {
        if (k === 8 && !consultou) { consultou = true; await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => document.getElementById("formLocalizarBotao")?.click() }).catch(() => {}); }
        await dorme(1000);
      }
    }
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    if (r === "sem-botao") { motivo.m = "não achei o botão Visualizar na linha do processo"; return { texto: "", motivo: motivo.m }; }
    if (r !== "clicou") { motivo.m = `o processo não apareceu na Busca de Pré-Análises (a lista tinha ${viuLinhas} linha(s); página: “${(t && t.title || "").slice(0, 60)}”)`; return { texto: "", motivo: motivo.m }; }
    for (let k = 0; k < 40; k++) {      // o editor abre na mesma aba ou em outra
      await dorme(1000);
      for (const id of [tab.id, ...novas]) {
        const html = (await lerEditor(id)).map((x) => x.result).filter(Boolean).sort((a, b) => b.length - a.length)[0];
        if (html) { const t = htmlParaTexto(html); if (t) return { texto: t, motivo: "" }; }
      }
    }
    return { texto: "", motivo: "cliquei em Visualizar, mas não achei o editor com a minuta (ou ele está vazio)" };
  } finally {
    chrome.tabs.onCreated.removeListener(aoCriar);
    for (const id of [tab.id, ...novas]) chrome.tabs.remove(id).catch(() => {});
  }
}

window.__lerMinutaPre = lerMinutaPre;      // usado nos testes

// O link do processo guardado no painel (BuscaProcesso?Id_Processo=…) expira ou fica preso à sessão: o Projudi responde “Código inválido, não foi possível validar o ID”.
async function paginaInvalida(tabId) {
  try { const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => /C[oó]digo inv[aá]lido|n[aã]o foi poss[ií]vel validar o ID/i.test(document.body?.innerText || "") }); return r.some((x) => x.result); } catch (e) { return false; }
}
// Pega um link NOVO do processo na lista da serventia (a lista é da serventia ativa na sessão: escolhe a do processo antes).
async function urlFresca(item) {
  const dig = chaveProc(item.processo), lista = BASE + (item.situacao === "preAnalisadas" ? "PreAnalisarConclusao?PaginaAtual=6&tipo=todas" : "PreAnalisarConclusao?PaginaAtual=2");
  const tab = await chrome.tabs.create({ url: lista, active: false });
  try {
    if (item.serventiaUrl) {
      await chrome.tabs.update(tab.id, { url: new URL(item.serventiaUrl, BASE).href }); await dorme(600);
      await carregou(tab.id); await dorme(1200);
      await chrome.tabs.update(tab.id, { url: lista }); await dorme(600);
    }
    await carregou(tab.id); await dorme(1500);
    for (let k = 0; k < 10; k++) {
      const r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, args: [dig], func: (d) => {
        const chave = (s) => { const t = String(s || ""), m = t.match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/); return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : t.replace(/\D/g, "").slice(0, 9); };
        const a = [...document.querySelectorAll("a[href*='Id_Processo']")].find((x) => chave(x.textContent) === d);
        return a ? a.href : "";
      } }).catch(() => []);
      const h = r.map((x) => x.result).find(Boolean); if (h) return h;
      await dorme(1000);
    }
    return "";
  } finally { chrome.tabs.remove(tab.id).catch(() => {}); }
}
window.__urlFresca = urlFresca;      // usado nos testes

let abaLoteId = null;
const irPara = async (tabId, url) => { await chrome.tabs.update(tabId, { url }); await dorme(600); await carregou(tabId); };
async function abaDoLote() {
  if (abaLoteId != null) { const t = await chrome.tabs.get(abaLoteId).catch(() => null); if (t) return t; }
  const t = await chrome.tabs.create({ url: BASE, active: false }); abaLoteId = t.id; await carregou(t.id); return t;
}
const fecharAbaDoLote = () => { if (abaLoteId != null) chrome.tabs.remove(abaLoteId).catch(() => {}); abaLoteId = null; };

async function processar(item, chave, pasta, etapa = () => {}, opcoes = {}) {
  const passo = (t) => { registro.push(new Date().toLocaleTimeString("pt-BR") + " " + item.processo + " — " + t); etapa(t); };
  passo("abrindo o processo");
  const url = new URL(item.url, BASE).href;
  // O Projudi só dá acesso aos arquivos do processo na serventia ESCOLHIDA na sessão (senão: “nível de acesso insuficiente”, PDF incompleto).
  // Por isso, antes de cada processo, a extensão entra na serventia dele (o mesmo clique da tela “Serventias Disponíveis”).
  // Navega DENTRO de uma única aba do Projudi (reaproveitada em todo o lote): serventia → processo; não abre aba nova a cada processo.
  const tab = await abaDoLote();
  let popup = null;
  try {
    if (item.serventiaUrl) { passo("entrando na serventia " + (item.serventia || "")); await irPara(tab.id, new URL(item.serventiaUrl, BASE).href); await dorme(1200); }
    await irPara(tab.id, url); await dorme(1500);
    if (await paginaInvalida(tab.id)) {
      passo("o link guardado do processo expirou (“Código inválido”); pegando um novo na lista");
      const nova = await urlFresca(item);
      if (!nova) throw new Error("o link do processo expirou e não achei o processo na lista da serventia (clique em “Verificar agora” no painel e tente de novo)");
      await irPara(tab.id, nova); await dorme(1500);
      if (await paginaInvalida(tab.id)) throw new Error("o Projudi recusou o link do processo (“Código inválido”)");
    }
    passo("procurando o botão Gerar PDF");
    await chrome.storage.local.remove(["lote_fim_" + chave, "lote_prog_" + chave, "gerarpdf_pedido"]);
    let minuta = "", motivoMinuta = "";      // Lupa do Magistrado: usa a minuta que o assessor já escreveu na pré-análise
    if (opcoes.studio?.ativo && opcoes.studio.modo === "lupa") {
      if (item.situacao !== "preAnalisadas") motivoMinuta = "processo não está pré-analisado (sem minuta do assessor)";
      else { passo("lendo a minuta do assessor (Visualizar)"); const r = await limite(lerMinutaPre(item), 120000, "a minuta da pré-análise não carregou").catch((e) => ({ texto: "", motivo: e.message })); minuta = r.texto; motivoMinuta = r.motivo; if (minuta) passo("minuta do assessor lida (" + minuta.length + " caracteres)"); else passo("⚠ " + motivoMinuta); }
    }
    await chrome.storage.local.set({ gerarpdf_pedido: { todos: true, processo: item.processo, pasta, lote: chave, ts: Date.now(), studio: opcoes.studio?.ativo ? { ativo: true, modo: opcoes.studio.modo, prompt: item.prompt || "", tipo: "", minuta, motivoMinuta, url: item.url, urlPre: item.urlPre || "", serventiaUrl: item.serventiaUrl || "", serventia: item.serventia || "", audData: item.audData || "", audHora: item.audHora || "", docs: !!opcoes.studio.docs && opcoes.studio.modo !== "lupa" } : null } });
    let r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a página do processo não respondeu (pode haver um aviso do Projudi aberto nela)");
    if (!r.achou) {   // o botão fica na aba "Navegação de Arquivos"
      await irPara(tab.id, BASE + "BuscaProcesso?PaginaAtual=98&PassoBusca=4"); await dorme(1500);
      for (let k = 0; k < 8 && !r.achou; k++) { r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a aba “Navegação de Arquivos” não respondeu"); if (!r.achou) await dorme(1000); }
    }
    if (!r.achou) {
      const d = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ u: location.href.slice(0, 120), t: document.title.slice(0, 80), x: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 160) }) }).then((x) => x[0]?.result).catch(() => null);
      throw new Error("não achei o botão “Gerar PDF” no processo" + (d ? ` (página vista: “${d.t}” — ${d.x})` : ""));
    }
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
    try {
      // vigia o andamento: o OCR de um processo grande pode levar vários minutos, mas sem NENHUM sinal da página de OCR por 5 min (ou 27 min enquanto o Projudi gera o PDF) ela travou
      const t0 = Date.now(), parado0 = (await chrome.storage.local.get("lote_parado_ms")).lote_parado_ms;
      for (;;) {
        const d = await chrome.storage.local.get(["lote_fim_" + chave, "lote_prog_" + chave]), pr = d["lote_prog_" + chave];
        if (d["lote_fim_" + chave]) { fim = d["lote_fim_" + chave]; break; }
        const semSinal = Date.now() - (pr?.t || t0), limite = parado0 || (/^Pedindo o PDF/i.test(pr?.txt || "") ? 27 * 60000 : 8 * 60000);
        if (semSinal > limite || Date.now() - t0 > 90 * 60000) {
          try { for (const c of await chrome.runtime.getContexts({ contextTypes: ["TAB"] })) if ((c.documentUrl || "").includes("ocr.html")) chrome.tabs.remove(c.tabId).catch(() => {}); } catch (e) { /* sem getContexts */ }
          throw new Error(`o OCR travou${pr?.txt ? ` em “${String(pr.txt).slice(0, 60)}”` : ""} (${Math.round(semSinal / 60000)} min sem sinal); a aba de OCR foi fechada e o processo pulado — tente de novo depois`);
        }
        await dorme(3000);
      }
    } finally { chrome.storage.onChanged.removeListener(ouvir); }
    if (!fim.ok) throw new Error(fim.erro || "falhou");
    return fim;
  } finally {
    if (popup) chrome.tabs.remove(popup.id).catch(() => {});
  }
}

(async () => {
  const id = new URLSearchParams(location.search).get("lote");
  const job = id ? (await chrome.storage.local.get("lote_" + id))["lote_" + id] : null;
  if (!job) { $("status").textContent = "Selecione os processos no painel da extensão e use “Baixar PDFs dos selecionados”."; $("barra").hidden = true; return; }
  const itens = job.itens, pasta = job.pasta || "Projudi";
  // o lote troca de serventia na sessão do Projudi: avisa a verificação (que lê números por serventia) para não rodar junto, e espera uma verificação em curso terminar
  for (let k = 0; k < 90 && (await chrome.storage.local.get("estado")).estado?.status === "verificando"; k++) { $("status").textContent = "Aguardando a verificação do Projudi terminar…"; await dorme(2000); }
  const marcaSessao = () => chrome.storage.local.set({ lote_sessao_ts: Date.now() }); marcaSessao();
  manterAcordado("lote", true); const sinal = setInterval(() => { manterAcordado("lote", true); marcaSessao(); }, 30000); addEventListener("pagehide", () => manterAcordado("lote", false));      // o computador não entra em espera enquanto o lote roda
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
      const rodar = (n) => processar(p, id + ":" + i + (n ? "r" : ""), p.pasta || pasta, (t) => marca(i, `⏳ ${esc(p.processo)} — ${esc(t)}`, ""), job.opcoes || {});
      let r;
      try { r = await rodar(0); }
      catch (e1) {      // OCR travado: uma nova tentativa automática, do zero
        if (!/^(o OCR travou|não achei o botão|a página do processo não respondeu|a aba “Navegação)/.test(e1.message) || cancelado) throw e1;
        marca(i, `⏳ ${esc(p.processo)} — ${/^o OCR/.test(e1.message) ? "o OCR travou" : "não achei o botão Gerar PDF"}; tentando de novo com um link novo do processo…`, "");
        if (!/^o OCR/.test(e1.message)) { const nova = await urlFresca(p).catch(() => null); if (nova) p.url = nova; }      // link novo pela lista da serventia
        r = await rodar(1);
      }
      feitos++;
      await navigator.locks.request("baixados", async () => { const { baixados = {} } = await chrome.storage.local.get("baixados"); baixados[p.processo] = { em: Date.now(), arquivo: r.pdf }; await chrome.storage.local.set({ baixados }); });
      const st = r.studio ? (r.studio.ok ? (r.studio.parcial ? ` — Studio: ${esc(r.studio.mensagem)}` : r.studio.fila ? " — na esteira de minutas" : " — análise concluída no Studio" + (r.studio.docs ? (r.studio.docs.ok ? ` — Google Docs: ${esc(r.studio.docs.titulo)}` : ` — <span class="erro">Docs: ${esc(r.studio.docs.erro)}</span>`) : "")) : ` — <span class="erro">Studio: ${esc(r.studio.erro)}</span>`) : "";
      marca(i, `✔ ${esc(p.processo)} — ${r.paginas} páginas (${r.ocr} com OCR) — salvo${st}${r.semAcesso?.length ? ` — ⚠ ${r.semAcesso.length} arquivo(s) sem acesso (sigilo/nível insuficiente), fora da análise: ${esc(r.semAcesso.slice(0, 6).join("; "))}` : ""}`, "ok");
    } catch (e) {
      erros++; marca(i, `✖ ${esc(p.processo)} — ${esc(e.message)}`, "erro");
    }
    $("barra").value = i + 1;
  }
  clearInterval(sinal); manterAcordado("lote", false); fecharAbaDoLote(); chrome.storage.local.remove("lote_sessao_ts");
  const resumo = `${cancelado ? "Cancelado. " : ""}${feitos} de ${itens.length} processo(s) baixado(s)${erros ? `, ${erros} com erro` : ""}.`;
  $("status").textContent = resumo; $("cancelar").disabled = true;
  document.body.dataset.pronto = "1"; document.body.dataset.resumo = JSON.stringify({ feitos, erros });
  chrome.notifications.create({ type: "basic", iconUrl: "icone.png", title: "PDFs dos processos", message: resumo });
})();
