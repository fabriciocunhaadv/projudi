// Mantém o computador acordado (sem entrar em espera/suspensão) enquanto a extensão trabalha: download em lote ou fila da esteira.
// Cada página avisa que está ativa (sinal a cada 60 s); sem nenhum sinal recente, a extensão libera o computador sozinha.
const VALIDADE = 3 * 60000;
export async function manterAcordado(origem, ativo) {
  try {
    if (!chrome.power) return;
    if (ativo) { await chrome.storage.local.set({ ["acordado_" + origem]: Date.now() }); chrome.power.requestKeepAwake("system"); return; }
    await chrome.storage.local.remove("acordado_" + origem);
    await conferirAcordado();
  } catch (e) { /* sem a permissão "power": segue sem */ }
}
export async function conferirAcordado() {
  try {
    if (!chrome.power) return;
    const todos = await chrome.storage.local.get(null), agora = Date.now();
    const vivo = Object.entries(todos).some(([k, v]) => k.startsWith("acordado_") && typeof v === "number" && agora - v < VALIDADE);
    if (!vivo) chrome.power.releaseKeepAwake();
  } catch (e) { /* ignora */ }
}
// Liga o sinal periódico de uma página enquanto `esta()` for verdadeiro.
export function vigiarAcordado(origem, esta) {
  let ligado = false;
  const ciclo = async () => { const ativo = !!(await esta()); if (ativo) await manterAcordado(origem, true); else if (ligado) await manterAcordado(origem, false); ligado = ativo; };
  ciclo(); setInterval(ciclo, 60000);
  return ciclo;
}
