// Fala com a aba do app "Assessor Judicial" a partir de páginas da extensão. A extensão trabalha SOMENTE no app com MySQL (judicial-mysql.assessor.net.br).
// Se não houver aba aberta dele, a extensão abre uma.
export const STUDIO_URL = "https://judicial-mysql.assessor.net.br/";
export const DOMINIOS_STUDIO = [STUDIO_URL];
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Abas do app (a ordem entre elas é mantida). */
export function abasDoStudioEmOrdem(abas) {
  const lista = [];
  for (const dominio of DOMINIOS_STUDIO) for (const a of abas || []) if (String(a?.url || "").startsWith(dominio)) lista.push(a);
  return lista;
}

async function responde(aba, tentativas) {
  for (let i = 0; i < tentativas; i++) {      // espera a página carregar e o script da extensão responder
    try { if ((await chrome.tabs.sendMessage(aba.id, { acao: "studio-ping" }))?.ok) return true; } catch (e) { /* ainda carregando */ }
    if (i === 3) {      // aba aberta antes de a extensão ser (re)carregada: o script antigo morreu; injeta o novo sem precisar atualizar a página
      try {
        await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func: () => { delete window.__projudiStudioBase; } });
        await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, files: ["studio-base.js"] });
      } catch (e) { /* sem permissão: segue esperando */ }
    }
    await dorme(1000);
  }
  return false;
}

export async function acharStudio() {
  const padroes = chrome.runtime.getManifest().content_scripts.find((c) => c.js.includes("studio-base.js")).matches;
  const abertas = abasDoStudioEmOrdem(await chrome.tabs.query({ url: padroes }));
  // tenta as abas já abertas na ordem de prioridade ; uma aba que não responde (sem a extensão, por exemplo) não impede de usar a seguinte
  for (const aba of abertas) if (await responde(aba, abertas.length > 1 ? 8 : 60)) return aba;
  const nova = abertas.length ? null : await chrome.tabs.create({ url: STUDIO_URL, active: false });      // nenhuma aberta: abre o app
  if (nova && (await responde(nova, 60))) return nova;
  throw new Error("abra o app Assessor Judicial (e entre com a sua conta) e tente de novo");
}

const b64De = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

// Arquivos grandes vão em partes (limite de mensagem): devolve o id com que a página do app os conhece.
export async function enviarArquivo(tabId, bytes) {
  const id = "arq" + Date.now() + Math.random().toString(36).slice(2, 6), TAM = 6 * 1024 * 1024, n = Math.max(1, Math.ceil(bytes.length / TAM));
  for (let i = 0; i < n; i++) {
    const r = await chrome.tabs.sendMessage(tabId, { acao: "studio-parte", id, i, n, b64: b64De(bytes.subarray(i * TAM, (i + 1) * TAM)) });
    if (!r?.ok) throw new Error(r?.erro || "o app não recebeu o arquivo");
  }
  return id;
}

export async function enviarBase(nome, bytes, substituir = false) {          // cadastra/atualiza (substitui) um PDF na Base de Conhecimento
  const aba = await acharStudio();
  const arquivoId = await enviarArquivo(aba.id, bytes);
  const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-enviar-base", nome, arquivoId, substituir });
  if (!r?.ok) { const e = new Error(r?.erro || "o app não confirmou o envio"); e.existe = !!r?.existe; throw e; }
  return r;
}

// Opções: { nome, prompt, modo: "analise" | "lupa", tipo, processo, minuta }
export async function analisarNoStudio(bytes, opcoes) {
  const aba = await acharStudio();
  const arquivoId = opcoes.texto ? "" : await enviarArquivo(aba.id, bytes);
  return analisarTurbo(aba, arquivoId, opcoes);      // todos os modos: o app responde logo e entrega o resultado pelo storage (queda do canal de mensagem não perde a análise)
}

// Lê a minuta que já está pronta na tela do app (sem analisar de novo).
// Andamento dos processos gigantes que o app do Studio lê em lotes, em segundo plano
export async function consultarGigantes() {
  const aba = await acharStudio();
  const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-gigantes" });
  if (!r?.ok) throw new Error("não consegui consultar os processos gigantes do app");
  return r.jobs || [];
}

export async function lerMinutaAtual(processo = "", desde = 0) {
  const aba = await acharStudio();
  const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-ler-minuta", processo, desde });
  if (!r?.ok) throw new Error(r?.erro || "não consegui ler a minuta do app");
  return { texto: r.minuta, html: r.minutaHtml || "" };
}

// Análise (qualquer modo): o app responde logo e grava o resultado no storage; assim uma queda do canal de mensagem não perde a análise.
async function analisarTurbo(aba, arquivoId, opcoes) {
  const reqId = "t" + Date.now() + Math.random().toString(36).slice(2, 6), chave = "studio_res_" + reqId;
  let r;
  try { r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-analisar", arquivoId, reqId, ...opcoes }); }
  catch (e) { throw new Error("o app do Studio não recebeu o pedido (" + e.message + "). Atualize a aba do assessor-judicial e tente de novo"); }
  if (!r?.ok) throw Object.assign(new Error(r?.erro || "o app não confirmou a análise"), { opcoes: r?.opcoes });
  const t0 = Date.now(); let carregando = 0;
  const limiteMin = opcoes.modo === "mesa" || opcoes.modo === "mesa-ler" ? 18 : opcoes.modo === "turbo" ? 60 : 75;      // o limite de cada módulo está no app (studio-base) e não conta o tempo do mapa do processo (até 40 min a mais); aqui é só a rede de segurança. Análise normal e Lupa podem esperar a cota da IA renovar
  for (;;) {
    const res = (await chrome.storage.local.get(chave))[chave];
    if (res) { await chrome.storage.local.remove(chave); if (!res.ok) throw Object.assign(new Error(res.erro || "a análise falhou no app"), { opcoes: res.opcoes, semRetry: !!res.semRetry, grande: !!res.grande }); return res; }
    const aba2 = await chrome.tabs.get(aba.id).catch(() => null);
    if (!aba2) throw new Error("a aba do assessor-judicial foi fechada durante a análise");
    carregando = aba2.status === "loading" ? carregando + 1 : 0;
    if (carregando > 90) throw new Error("a aba do assessor-judicial recarregou durante a análise (ficou mais de 3 minutos carregando; confira se o Studio terminou de atualizar e tente de novo)");      // o Studio pode demorar a reabrir depois de uma atualização
    if (Date.now() - t0 > limiteMin * 60000) throw new Error(`a análise não terminou em ${limiteMin} minutos`);
    await dorme(2000);
  }
}
