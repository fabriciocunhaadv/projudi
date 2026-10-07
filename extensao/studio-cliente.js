// Fala com a aba do app "Assessor Judicial" (AI Studio) a partir de páginas da extensão.
export const STUDIO_URL = "https://assessor-judicial.ai.studio/";
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function acharStudio() {
  const padroes = chrome.runtime.getManifest().content_scripts.find((c) => c.js.includes("studio-base.js")).matches;
  let [aba] = await chrome.tabs.query({ url: padroes });
  if (!aba) aba = await chrome.tabs.create({ url: STUDIO_URL, active: false });
  for (let i = 0; i < 60; i++) {     // espera a página carregar e o script da extensão responder
    try { if ((await chrome.tabs.sendMessage(aba.id, { acao: "studio-ping" }))?.ok) return aba; } catch (e) { /* ainda carregando */ }
    if (i === 3) {      // aba aberta antes de a extensão ser (re)carregada: o script antigo morreu; injeta o novo sem precisar atualizar a página
      try {
        await chrome.scripting.executeScript({ target: { tabId: aba.id }, func: () => { delete window.__projudiStudioBase; } });
        await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["studio-base.js"] });
      } catch (e) { /* sem permissão: segue esperando */ }
    }
    await dorme(1000);
  }
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
  if (opcoes.modo === "turbo") return analisarTurbo(aba, arquivoId, opcoes);
  const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-analisar", arquivoId, ...opcoes });
  if (!r?.ok) throw new Error(r?.erro || "o app não confirmou a análise");
  return r;
}

// Lê a minuta que já está pronta na tela do app (sem analisar de novo).
export async function lerMinutaAtual(processo = "") {
  const aba = await acharStudio();
  const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-ler-minuta", processo });
  if (!r?.ok) throw new Error(r?.erro || "não consegui ler a minuta do app");
  return { texto: r.minuta, html: r.minutaHtml || "" };
}

// Módulo Turbo: o app responde logo e grava o resultado no storage; assim uma queda do canal de mensagem não perde a análise.
async function analisarTurbo(aba, arquivoId, opcoes) {
  const reqId = "t" + Date.now() + Math.random().toString(36).slice(2, 6), chave = "studio_res_" + reqId;
  let r;
  try { r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-analisar", arquivoId, reqId, ...opcoes }); }
  catch (e) { throw new Error("o app do Studio não recebeu o pedido (" + e.message + "). Atualize a aba do assessor-judicial e tente de novo"); }
  if (!r?.ok) throw new Error(r?.erro || "o app não confirmou a análise");
  const t0 = Date.now(); let carregando = 0;
  for (;;) {
    const res = (await chrome.storage.local.get(chave))[chave];
    if (res) { await chrome.storage.local.remove(chave); if (!res.ok) throw new Error(res.erro || "o Módulo Turbo falhou"); return res; }
    const aba2 = await chrome.tabs.get(aba.id).catch(() => null);
    if (!aba2) throw new Error("a aba do assessor-judicial foi fechada durante a análise");
    carregando = aba2.status === "loading" ? carregando + 1 : 0;
    if (carregando > 10) throw new Error("a aba do assessor-judicial recarregou durante a análise");
    if (Date.now() - t0 > 12 * 60000) throw new Error("o Módulo Turbo não terminou em 12 minutos");
    await dorme(2000);
  }
}
