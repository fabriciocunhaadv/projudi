// "Saúde do sistema": a extensão deixa aqui, numa fila pequena no chrome.storage.local, os problemas que viu (OCR que falhou, item da esteira em erro,
// Agaia que não terminou, erro solto de uma página da extensão). O script que roda na aba do Studio (studio-base.js) recolhe a fila e o app a envia
// ao painel do Super Admin. Nada de texto de processo: só a mensagem curta do erro (o servidor ainda mascara número de processo, CPF e e-mail).
const CHAVE = "saudeFila", MAX = 60, SILENCIO_MS = 10 * 60_000;
const recentes = new Map();

/** Anota um evento. Nunca lança erro e nunca atrapalha a tarefa da extensão. */
export async function reportarSaude(modulo, severidade, mensagem, detalhe) {
  try {
    const msg = String(mensagem || "").replace(/\s+/g, " ").trim().slice(0, 400); if (!msg) return;
    const chave = modulo + "|" + msg.replace(/\d+/g, "#"), agora = Date.now();
    if (agora - (recentes.get(chave) || 0) < SILENCIO_MS) return;      // o mesmo problema repetido: só o primeiro a cada 10 minutos
    recentes.set(chave, agora); if (recentes.size > 200) recentes.clear();
    const { [CHAVE]: fila = [] } = await chrome.storage.local.get(CHAVE);
    fila.push({ id: agora.toString(36) + Math.random().toString(36).slice(2, 6), ts: agora, versao: chrome.runtime.getManifest().version, modulo, severidade, mensagem: msg, detalhe });
    await chrome.storage.local.set({ [CHAVE]: fila.slice(-MAX) });
  } catch (e) { /* sem armazenamento: segue sem monitor */ }
}

/** Erros soltos da página (script que quebrou, promessa sem tratamento) também vão para a fila. */
export function instalarSaude(modulo) {
  try {
    addEventListener("error", (ev) => { const m = String(ev?.message || ""); if (m && !/ResizeObserver/i.test(m)) void reportarSaude(modulo, "erro", "Erro de página: " + m, { arquivo: String(ev?.filename || "").split("/").pop(), linha: ev?.lineno }); });
    addEventListener("unhandledrejection", (ev) => { const r = ev?.reason, m = String(r?.message || r || ""); if (m && !/abort|cancel/i.test(m)) void reportarSaude(modulo, "erro", "Promessa sem tratamento: " + m); });
  } catch (e) { /* sem ouvintes */ }
}
