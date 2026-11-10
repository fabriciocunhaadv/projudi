// Quadro de movimentações do Projudi (lido da tela do processo pelo mov-diag.js, que guarda em chrome.storage.local "movs:<processo>").
// Entra no texto enviado ao Studio: traz TODOS os movimentos, inclusive os sem arquivo (autos conclusos, certidões, término de suspensão…), que o PDF não mostra.
export const NUM_PROCESSO = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
export const numeroDoTexto = (t) => ((String(t || "").slice(0, 6000).match(/Processo\s*N[ºo°]?\s*:?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i) || String(t || "").slice(0, 6000).match(NUM_PROCESSO) || [])[1] || (String(t || "").slice(0, 6000).match(NUM_PROCESSO) || [""])[0]);

export function montarQuadro(movs, processo = "") {
  const l = (movs || []).filter((m) => m && m.n).slice().sort((a, b) => a.n - b.n);
  if (!l.length) return "";
  const linhas = l.map((m) => `Mov. ${m.n} · ${m.data || "sem data"} · ${m.tipo || "?"}${m.complemento ? " — " + String(m.complemento).slice(0, 400) : ""}${m.usuario ? " · por " + m.usuario : ""}${m.comArquivos ? " · com arquivo(s)" : ""}`);
  const u = l[l.length - 1];
  return `[QUADRO DE MOVIMENTAÇÕES DO PROJUDI${processo ? " — processo " + processo : ""} (lido da tela do processo; inclui movimentos sem arquivo; é a CRONOLOGIA OFICIAL)]\n${linhas.join("\n")}\nÚLTIMA MOVIMENTAÇÃO: Mov. ${u.n} (${u.tipo || "?"}${u.data ? ", " + u.data : ""}).\n[FIM DO QUADRO DE MOVIMENTAÇÕES]\n\n`;
}

/** Procura no armazenamento o quadro do processo do texto; "" se a tela do processo não foi aberta nesta máquina. */
export async function quadroDoProcesso(texto) {
  try {
    const num = numeroDoTexto(texto); if (!num) return "";
    const r = (await chrome.storage.local.get("movs:" + num))["movs:" + num];
    return r && Array.isArray(r.movs) ? montarQuadro(r.movs, num) : "";
  } catch { return ""; }
}
