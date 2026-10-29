// Uma aba só do Projudi: a extensão NAVEGA dentro da aba que o usuário já deixou aberta (e logada) em vez de abrir abas novas.
// Abas novas do Projudi derrubam a sessão ("Essa sessão foi invalidada, pois esse usuário foi utilizado para fazer acesso ao sistema em outro computador").
// Só cria uma aba quando não existe nenhuma do Projudi aberta. A janela "Gerar PDF" é aberta pelo próprio Projudi e continua sendo uma aba nova.
const ORIGEM = "https://projudi.tjgo.jus.br/*";

/** A aba do Projudi que já está aberta (a do fluxo, se ela ainda existir; senão a primeira que não esteja fixada). */
export async function acharAbaProjudi(preferida = null) {
  const abertas = await chrome.tabs.query({ url: ORIGEM }).catch(() => []);
  return abertas.find((t) => t.id === preferida) || abertas.find((t) => !t.pinned) || abertas[0] || null;
}

/** Leva a aba existente para `url` (sem trazê-la para a frente) ou cria uma, se não houver nenhuma. `criada` diz se a extensão a abriu e pode fechá-la depois. */
export async function abrirAbaProjudi(url, { preferida = null, ativa = false } = {}) {
  const aba = await acharAbaProjudi(preferida);
  if (aba) { const urlOriginal = aba.url || ""; await chrome.tabs.update(aba.id, { url, active: ativa }); return { id: aba.id, criada: false, urlOriginal }; }
  const nova = await chrome.tabs.create({ url, active: ativa });
  return { id: nova.id, criada: true, urlOriginal: "" };
}

/** Termina o uso da aba: fecha só a que a extensão criou; a do usuário volta para a página em que estava. */
export async function soltarAbaProjudi(ref) {
  if (!ref) return;
  if (ref.criada) { chrome.tabs.remove(ref.id).catch(() => {}); return; }
  if (ref.urlOriginal && /^https:\/\/projudi\.tjgo\.jus\.br\//.test(ref.urlOriginal)) chrome.tabs.update(ref.id, { url: ref.urlOriginal }).catch(() => {});
}

/** Só um trabalho por vez usa a aba do Projudi (vale entre as páginas da extensão: esteira, lote, leitura de minuta). Devolve a função que libera. */
export function pegarTravaDaAba(nome = "projudi-aba") {
  return new Promise((pronto) => {
    if (!globalThis.navigator?.locks) return pronto(() => {});
    navigator.locks.request(nome, () => new Promise((fim) => pronto(() => fim()))).catch(() => pronto(() => {}));
  });
}
