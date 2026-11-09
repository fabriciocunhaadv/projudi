// Esteira → IA externa (ChatGPT, Gemini, Claude): abre/usa a aba da IA, anexa o PDF (já com OCR), cola o prompt do Studio, envia,
// espera a resposta e devolve a minuta para a esteira lançar no Histórico do Studio.
export const SITES_IA = {
  chatgpt: { nome: "ChatGPT", url: "https://chatgpt.com/", padrao: ["https://chatgpt.com/*", "https://chat.openai.com/*"] },
  gemini: { nome: "Gemini", url: "https://gemini.google.com/app", padrao: ["https://gemini.google.com/*"] },
  jusbrasil: { nome: "IA do Jusbrasil", url: "https://ia.jusbrasil.com.br/conversa", padrao: ["https://ia.jusbrasil.com.br/*"] },
  claude: { nome: "Claude", url: "https://claude.ai/new", padrao: ["https://claude.ai/*"] },
};
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
const b64De = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export const temPermissao = (id) => chrome.permissions.contains({ origins: SITES_IA[id].padrao });
export const pedirPermissao = (id) => chrome.permissions.request({ origins: SITES_IA[id].padrao });      // só pode ser chamado a partir de um clique do usuário

/** Texto que a IA recebe: o prompt do Studio + a indicação dos autos anexados. */
export function montarMensagem(promptTexto, processo) {
  return `${String(promptTexto).trim()}\n\n---\nOs autos do processo ${processo || ""} estão no PDF anexado a esta mensagem (texto já reconhecido por OCR). Leia o PDF inteiro e responda SOMENTE com a minuta pronta, sem comentários antes ou depois.`.trim();
}

async function abaDaIa(id, nova) {
  const s = SITES_IA[id];
  if (!(await temPermissao(id))) throw Object.assign(new Error(`falta autorizar a extensão a usar o ${s.nome} (botão “Autorizar ${s.nome}” no painel)`), { semRetry: true });
  let aba = (await chrome.tabs.query({ url: s.padrao }))[0];
  if (!aba) aba = await chrome.tabs.create({ url: s.url, active: false });
  else if (nova) { await chrome.tabs.update(aba.id, { url: s.url }); await dorme(1200); }      // cada processo começa em conversa nova (sem misturar autos)
  for (let i = 0; i < 60; i++) {
    const t = await chrome.tabs.get(aba.id);
    if (t.status === "complete") break;
    await dorme(500);
  }
  await dorme(2500);      // o app da IA monta a tela depois do load
  await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["ia-agente.js"] });
  return aba;
}
const msg = async (aba, m) => { const r = await chrome.tabs.sendMessage(aba.id, m); if (!r?.ok) throw new Error(r?.erro || "a tela da IA não respondeu"); return r; };

/** Diagnóstico: o que o agente enxerga na aba da IA (abre a aba se preciso, SEM trocar de conversa). */
export async function diagnosticarIa(id) {
  const s = SITES_IA[id];
  if (!(await temPermissao(id))) throw new Error(`autorize o ${s.nome} primeiro`);
  let aba = (await chrome.tabs.query({ url: s.padrao }))[0] || await chrome.tabs.create({ url: s.url, active: false });
  await dorme(2500);
  await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["ia-agente.js"] });
  return await msg(aba, { acao: "ia-diagnosticar" });
}

/** Executa um processo: { ok, minutaTexto, minutaHtml } ou { ok:false, erro, sessao?, semRetry? }. */
export async function executarNaIa(it, { id, bytes, promptTexto, aoAndamento = () => {}, aindaValido = async () => true }) {
  const s = SITES_IA[id];
  try {
    aoAndamento(`abrindo ${s.nome}…`);
    const aba = await abaDaIa(id, true);
    const diag = await msg(aba, { acao: "ia-diagnosticar" });
    if (!diag.logado) return { ok: false, sessao: true, erro: `${s.nome} pediu login: entre na conta na aba dele` };
    if (diag.bloqueio) return { ok: false, sessao: true, erro: `${s.nome} pediu verificação humana (captcha): resolva na aba dele` };
    if (!diag.compositor) return { ok: false, erro: `não achei a caixa de mensagem do ${s.nome} (tela mudou?): rode “Diagnosticar tela da IA”`, semRetry: true };
    aoAndamento("enviando o PDF…");
    const b64 = b64De(bytes), tam = 1500000, pid = "ia" + Date.now();
    for (let n = 0, i = 0; i < b64.length; n++, i += tam) await msg(aba, { acao: "ia-parte", id: pid, n, dados: b64.slice(i, i + tam) });
    await msg(aba, { acao: "ia-anexar", id: pid, nome: it.pdfNome && /\.pdf$/i.test(it.pdfNome) ? it.pdfNome : `${String(it.processo).replace(/\D/g, "") || "autos"}.pdf` });
    if (!(await aindaValido())) return { ok: false, cancelado: true };
    aoAndamento("colando o prompt…");
    await msg(aba, { acao: "ia-escrever", texto: montarMensagem(promptTexto, it.processo) });
    aoAndamento("enviado; esperando a resposta…");
    await msg(aba, { acao: "ia-enviar" });
    const t0 = Date.now();
    for (;;) {      // espera em fatias (o canal de mensagem não aguenta uma espera de 10 minutos de uma vez)
      if (!(await aindaValido())) return { ok: false, cancelado: true };
      try {
        const r = await msg(aba, { acao: "ia-esperar", ms: 90000, estavelMs: 6000 });
        if ((r.texto || "").trim().length < 400) return { ok: false, erro: `não consegui capturar a minuta do ${s.nome}: só veio um texto curto (“${(r.texto || "").slice(0, 80)}”). A minuta pode estar num painel lateral: rode “Diagnosticar tela da IA” e me envie o resultado.` };
        return { ok: true, minutaTexto: r.texto, minutaHtml: r.html || "" };
      } catch (e) {
        if (!/tempo limite|Receiving end|message channel/i.test(e.message) || Date.now() - t0 > 12 * 60000) throw e;
        aoAndamento(`${s.nome} ainda respondendo… (${Math.round((Date.now() - t0) / 60000)} min)`);
      }
    }
  } catch (e) { return { ok: false, erro: String(e.message || e), semRetry: !!e.semRetry }; }
}
