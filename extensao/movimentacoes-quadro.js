// Quadro de movimentações do Projudi (lido da tela do processo pelo mov-diag.js, que guarda em chrome.storage.local "movs:<processo>").
// Entra no texto enviado ao Studio: traz TODOS os movimentos, inclusive os sem arquivo (autos conclusos, certidões, término de suspensão…), que o PDF não mostra.
export const NUM_PROCESSO = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
export const numeroDoTexto = (t) => ((String(t || "").slice(0, 6000).match(/Processo\s*N[ºo°]?\s*:?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i) || String(t || "").slice(0, 6000).match(NUM_PROCESSO) || [])[1] || (String(t || "").slice(0, 6000).match(NUM_PROCESSO) || [""])[0]);

export function montarQuadro(movs, processo = "") {
  const l = (movs || []).filter((m) => m && m.n).slice().sort((a, b) => a.n - b.n);
  if (!l.length) return "";
  const linhas = l.map((m) => `Mov. ${m.n} · ${m.data || "sem data"} · ${m.tipo || "?"}${m.complemento ? " — " + String(m.complemento).slice(0, 400) : ""}${m.usuario ? " · por " + m.usuario : ""}${m.comArquivos ? " · com arquivo(s)" : ""}${Array.isArray(m.arquivos) && m.arquivos.length ? " · arquivos: " + m.arquivos.slice(0, 40).map((x, i) => `${i + 1}=${String(x).slice(0, 70)}`).join("; ") : ""}`);
  const u = l[l.length - 1];
  return `[QUADRO DE MOVIMENTAÇÕES DO PROJUDI${processo ? " — processo " + processo : ""} (lido da tela do processo; inclui movimentos sem arquivo; é a CRONOLOGIA OFICIAL; "arquivos: 1=…; 2=…" é a lista oficial de arquivos da movimentação, na ordem da tela)]\n${linhas.join("\n")}\nÚLTIMA MOVIMENTAÇÃO: Mov. ${u.n} (${u.tipo || "?"}${u.data ? ", " + u.data : ""}).\n[FIM DO QUADRO DE MOVIMENTAÇÕES]\n\n`;
}

/** Procura no armazenamento o quadro do processo do texto; "" se a tela do processo não foi aberta nesta máquina. */
export async function quadroDoProcesso(texto) {
  try {
    const num = numeroDoTexto(texto); if (!num) return "";
    const r = (await chrome.storage.local.get("movs:" + num))["movs:" + num];
    return r && Array.isArray(r.movs) ? montarQuadro(r.movs, num) : "";
  } catch { return ""; }
}

/** Abre, UMA a UMA, as movimentações com arquivo que o Projudi ainda não carregou (o clique no clipe roda no mundo MAIN da página, como o do Projudi) e manda o mov-diag.js guardar a lista completa.
 *  Limite de tempo; devolve {ok,total,abertas,falhas,ms} ou null; nunca lança. */
export async function completarArquivosDoQuadro(tabId, limiteMs = 100000) {
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", args: [limiteMs], func: async (limite) => {
      const linhas = [...document.querySelectorAll("#tabListaProcesso tr[movi_codigo]")]; if (!linhas.length) return null;
      const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms)), t0 = Date.now(); let abertas = 0, falhas = 0;
      const carregado = (tr) => { const f = tr.nextElementSibling; return !!(f && !f.hasAttribute("movi_codigo") && f.querySelector("a[href]")); };
      for (const tr of linhas) {
        if (Date.now() - t0 > limite) break;
        if (carregado(tr)) continue;
        const ancora = tr.children[4] && tr.children[4].querySelector('a[href*="buscarArquivosMovimentacaoJSON"]'); if (!ancora) continue;
        try { ancora.click(); } catch (e) { falhas++; continue; }
        let ok = false; for (let k = 0; k < 24; k++) { await dorme(250); if (carregado(tr)) { ok = true; break; } }
        if (ok) abertas++; else falhas++;
      }
      return { ok: true, total: linhas.length, abertas, falhas, ms: Date.now() - t0 };
    } }).catch(() => []);
    const res = (r || []).map((x) => x.result).find(Boolean) || null;
    if (!res) return null;
    await chrome.tabs.sendMessage(tabId, { tipo: "movs-guardar" }).catch(() => null);      // o mov-diag.js guarda a lista completa agora (sem esperar o ciclo de 2,5 s)
    return res;
  } catch { return null; }
}
