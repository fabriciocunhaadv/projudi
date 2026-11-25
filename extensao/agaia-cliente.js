// Esteira → Agaia: abre o processo na tela de execução do Agaia (sem baixar PDF: o Agaia lê os movimentos direto do Projudi) e devolve a minuta.
// Usa a aba do Agaia que o usuário já deixou aberta (só cria uma se não houver) e leva o resultado pelo storage, como o Studio.
import { classificarPaginaDeErro, ehPaginaDeErroDoNavegador } from "./pagina-erro.js";
export const AGAIA_URL = "https://simplesefacil.tjgo.jus.br/agaia/";
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** 5285460-70.2025.8.09.0166 → 5285460.70.2025 (formato da URL do Agaia). Sem o ano não dá para abrir o processo. */
export function numeroAgaia(proc) {
  const s = String(proc || "");
  let m = s.match(/(\d{1,7})[.\-](\d{1,2})[.\-](\d{4})/);
  if (m) return `${m[1].padStart(7, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
  const d = s.replace(/\D/g, ""); if (d.length >= 13) return `${d.slice(0, 7)}.${d.slice(7, 9)}.${d.slice(9, 13)}`;
  return "";
}
export const urlDoProcesso = (numero) => AGAIA_URL + "prompts/moderno?numero_processo=" + encodeURIComponent(numero) + "&tipo_processo=judicial&acao_id=6&validado=True";      // o mesmo endereço que o Projudi usa para abrir o Agaia: sem os três últimos itens o formulário não abre

async function abaDoAgaia() {
  const abertas = await chrome.tabs.query({ url: AGAIA_URL + "*" }).catch(() => []);
  return abertas.find((t) => !t.pinned) || abertas[0] || null;
}
function carregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const f = (id, i) => { if (id === tabId && i.status === "complete") { chrome.tabs.onUpdated.removeListener(f); clearTimeout(t); ok(true); } };
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(f); ok(false); }, ms);
    chrome.tabs.onUpdated.addListener(f);
  });
}
/** A aba do Agaia mostra uma página de ERRO (502/503/504 do Cloudflare, falha de rede)? Devolve a mensagem para a esteira ou "" se está normal. */
export async function paginaDeErro(tabId) {
  const aba = await chrome.tabs.get(tabId).catch(() => null);
  if (!aba) return "";
  if (ehPaginaDeErroDoNavegador(aba.url)) return "O navegador não conseguiu abrir o Agaia (sem conexão ou servidor fora do ar). Tente de novo em alguns minutos, ou rode no Studio ou em outra IA.";
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => `${document.title || ""} ${(document.body && document.body.innerText) || ""}`.slice(0, 2500) });
    return classificarPaginaDeErro(r?.result || "");
  } catch { return ""; }
}
async function pronta(tabId, tentativas) {
  for (let i = 0; i < tentativas; i++) {
    if (i % 5 === 4) { const e = await paginaDeErro(tabId); if (e) return { erroDaPagina: e }; }      // página de erro: não adianta esperar o script responder
    try { const r = await chrome.tabs.sendMessage(tabId, { acao: "agaia-ping" }); if (r?.ok) return r; } catch { /* a página ainda carrega */ }
    if (i === 3) { try { await chrome.scripting.executeScript({ target: { tabId }, files: ["prompt-similar.js", "agaia-exec.js"] }); } catch { /* sem permissão: segue esperando */ } }
    await dorme(1000);
  }
  return null;
}

/** Nomes dos prompts que o formulário do Agaia oferece (a mesma lista em que a esteira escolhe). Abre o processo na aba do Agaia, como na execução, mas não executa nada. */
export async function listarPromptsAgaia(processo) {
  const numero = numeroAgaia(processo);
  if (!numero) return { ok: false, erro: "número do processo sem o ano" };
  const url = urlDoProcesso(numero);
  let aba = await abaDoAgaia();
  if (aba) await chrome.tabs.update(aba.id, { url, active: false }); else aba = await chrome.tabs.create({ url, active: false });
  await carregou(aba.id);
  if (!(await pronta(aba.id, 60))) return { ok: false, erro: "a aba do Agaia não respondeu (confira se você está logado no Agaia)" };
  try { return await chrome.tabs.sendMessage(aba.id, { acao: "agaia-opcoes" }); } catch (e) { return { ok: false, erro: "o Agaia não respondeu (" + e.message + ")" }; }
}

/** Executa o processo no Agaia. Devolve { ok, minutaHtml, minutaTexto, aproximado } ou { ok:false, erro, sessao?, verificacao? } com o texto que o Agaia mostrou. */
const b64De = (bytes) => { let t = ""; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(t); };
/** O PDF vai à aba do Agaia em partes (limite de mensagem); devolve o id com que o script da página o conhece. */
async function enviarPdfAoAgaia(tabId, bytes) {
  const id = "pdf" + Date.now() + Math.random().toString(36).slice(2, 6), TAM = 6 * 1024 * 1024, n = Math.max(1, Math.ceil(bytes.length / TAM));
  for (let i = 0; i < n; i++) {
    const r = await chrome.tabs.sendMessage(tabId, { acao: "agaia-parte", id, i, n, b64: b64De(bytes.subarray(i * TAM, (i + 1) * TAM)) });
    if (!r?.ok) throw new Error(r?.erro || "o Agaia não recebeu o PDF");
  }
  return id;
}
export async function executarNoAgaia(item, { aoAndamento = () => {}, limiteMs = 25 * 60000, aindaValido = async () => true, aoIniciar = () => {}, pdf = null, aceiteSigilo = false } = {}) {
  const numero = numeroAgaia(item.processo);
  if (!numero) return { ok: false, erro: `o número ${item.processo} não tem o ano; o Agaia só abre o processo com o número completo (ex.: 5285460-70.2025.8.09.0166)` };
  const url = urlDoProcesso(numero);
  let aba = await abaDoAgaia();
  if (aba) await chrome.tabs.update(aba.id, { url, active: false });
  else aba = await chrome.tabs.create({ url, active: false });
  await carregou(aba.id, 30000);
  const erroInicial = await paginaDeErro(aba.id);
  if (erroInicial) return { ok: false, erro: erroInicial, indisponivel: true };
  const r0 = await pronta(aba.id, 60);
  if (r0?.erroDaPagina) return { ok: false, erro: r0.erroDaPagina, indisponivel: true };
  if (!r0) return { ok: false, erro: "a aba do Agaia não respondeu (confira se você está logado no Agaia)" };
  const reqId = "a" + Date.now() + Math.random().toString(36).slice(2, 6);
  let r;
  let arquivoId = "";
  if (pdf?.bytes) { try { aoAndamento("enviando o PDF do processo ao Agaia"); arquivoId = await enviarPdfAoAgaia(aba.id, pdf.bytes); } catch (e) { return { ok: false, erro: "não consegui entregar o PDF ao Agaia (" + e.message + ")" }; } }
  try { r = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-executar", reqId, numero, prompt: item.prompt || "", limiteMs, modoPdf: !!arquivoId, arquivoId, pdfNome: pdf?.nome || "processo.pdf", aceiteSigilo: !!aceiteSigilo }); }
  catch (e) { return { ok: false, erro: "o Agaia não recebeu o pedido (" + e.message + ")" }; }
  if (!r?.ok) return { ok: false, erro: r?.erro || "o Agaia não confirmou o pedido" };
  aoIniciar({ reqId, tabId: aba.id });
  return aguardarAgaia(reqId, aba.id, { aoAndamento, limiteMs, aindaValido });
}

/** Espera o resultado que a aba do Agaia grava no storage (sobrevive a recarregar a esteira, a rede ou o canal de mensagens). */
export async function aguardarAgaia(reqId, tabId, { aoAndamento = () => {}, limiteMs = 25 * 60000, aindaValido = async () => true } = {}) {
  const chave = "agaia_res_" + reqId, chp = "agaia_prog_" + reqId;
  const t0 = Date.now(); let ultimo = "", ultimaMudanca = Date.now(), ultimaOlhada = 0;
  for (;;) {
    const d = await chrome.storage.local.get([chave, chp]);
    if (d[chave]) { await chrome.storage.local.remove([chave, chp]); return d[chave]; }
    if (d[chp]?.txt && d[chp].txt !== ultimo) { ultimo = d[chp].txt; ultimaMudanca = Date.now(); aoAndamento(ultimo); }
    // andamento parado há 20 s (ex.: "abrindo o formulário"): a página pode ser um erro 502; olha a cada 10 s
    if (Date.now() - ultimaMudanca > 20000 && Date.now() - ultimaOlhada > 10000) { ultimaOlhada = Date.now(); const e = await paginaDeErro(tabId); if (e) { await chrome.storage.local.remove([chave, chp]); return { ok: false, erro: e, indisponivel: true }; } }
    if (!(await aindaValido())) { await chrome.storage.local.remove([chave, chp]); return { ok: false, cancelado: true, erro: "cancelado" }; }
    const a2 = await chrome.tabs.get(tabId).catch(() => null);
    if (!a2) { const d2 = await chrome.storage.local.get(chave); if (d2[chave]) { await chrome.storage.local.remove([chave, chp]); return d2[chave]; } return { ok: false, erro: "a aba do Agaia foi fechada durante a execução" }; }
    if (Date.now() - t0 > limiteMs + 120000) return { ok: false, erro: "o Agaia não terminou no tempo previsto" };
    await dorme(2000);
  }
}

/** Esteira recarregada, energia que voltou: se esta execução já terminou (resultado guardado) ou ainda está rodando na aba do Agaia, aproveita; senão devolve null (executa de novo). */
export async function retomarExecucao(pedido, opcoes = {}) {
  if (!pedido?.reqId) return null;
  const chave = "agaia_res_" + pedido.reqId, chp = "agaia_prog_" + pedido.reqId;
  const d = await chrome.storage.local.get([chave, chp]);
  if (d[chave]) { await chrome.storage.local.remove([chave, chp]); return d[chave]; }
  const aba = pedido.tabId != null ? await chrome.tabs.get(pedido.tabId).catch(() => null) : null;
  if (aba && d[chp] && Date.now() - d[chp].t < 4 * 60000) return aguardarAgaia(pedido.reqId, pedido.tabId, opcoes);
  return null;
}
