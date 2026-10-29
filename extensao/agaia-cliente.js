// Esteira → Agaia: abre o processo na tela de execução do Agaia (sem baixar PDF: o Agaia lê os movimentos direto do Projudi) e devolve a minuta.
// Usa a aba do Agaia que o usuário já deixou aberta (só cria uma se não houver) e leva o resultado pelo storage, como o Studio.
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
export const urlDoProcesso = (numero) => AGAIA_URL + "prompts/moderno?numero_processo=" + encodeURIComponent(numero);

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
async function pronta(tabId, tentativas) {
  for (let i = 0; i < tentativas; i++) {
    try { const r = await chrome.tabs.sendMessage(tabId, { acao: "agaia-ping" }); if (r?.ok) return r; } catch { /* a página ainda carrega */ }
    if (i === 3) { try { await chrome.scripting.executeScript({ target: { tabId }, files: ["prompt-similar.js", "agaia-exec.js"] }); } catch { /* sem permissão: segue esperando */ } }
    await dorme(1000);
  }
  return null;
}

/** Executa o processo no Agaia. Devolve { ok, minutaHtml, minutaTexto, aproximado } ou { ok:false, erro, sessao?, verificacao? } com o texto que o Agaia mostrou. */
export async function executarNoAgaia(item, { aoAndamento = () => {}, limiteMs = 25 * 60000, aindaValido = async () => true, aoIniciar = () => {} } = {}) {
  const numero = numeroAgaia(item.processo);
  if (!numero) return { ok: false, erro: `o número ${item.processo} não tem o ano; o Agaia só abre o processo com o número completo (ex.: 5285460-70.2025.8.09.0166)` };
  const url = urlDoProcesso(numero);
  let aba = await abaDoAgaia();
  if (aba) await chrome.tabs.update(aba.id, { url, active: false });
  else aba = await chrome.tabs.create({ url, active: false });
  await carregou(aba.id);
  const r0 = await pronta(aba.id, 60);
  if (!r0) return { ok: false, erro: "a aba do Agaia não respondeu (confira se você está logado no Agaia)" };
  const reqId = "a" + Date.now() + Math.random().toString(36).slice(2, 6);
  let r;
  try { r = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-executar", reqId, numero, prompt: item.prompt || "", limiteMs }); }
  catch (e) { return { ok: false, erro: "o Agaia não recebeu o pedido (" + e.message + ")" }; }
  if (!r?.ok) return { ok: false, erro: r?.erro || "o Agaia não confirmou o pedido" };
  aoIniciar({ reqId, tabId: aba.id });
  return aguardarAgaia(reqId, aba.id, { aoAndamento, limiteMs, aindaValido });
}

/** Espera o resultado que a aba do Agaia grava no storage (sobrevive a recarregar a esteira, a rede ou o canal de mensagens). */
export async function aguardarAgaia(reqId, tabId, { aoAndamento = () => {}, limiteMs = 25 * 60000, aindaValido = async () => true } = {}) {
  const chave = "agaia_res_" + reqId, chp = "agaia_prog_" + reqId;
  const t0 = Date.now(); let ultimo = "";
  for (;;) {
    const d = await chrome.storage.local.get([chave, chp]);
    if (d[chave]) { await chrome.storage.local.remove([chave, chp]); return d[chave]; }
    if (d[chp]?.txt && d[chp].txt !== ultimo) { ultimo = d[chp].txt; aoAndamento(ultimo); }
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
