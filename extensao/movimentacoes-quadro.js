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

/** Abre as movimentações com arquivo que o Projudi ainda não carregou, VÁRIAS POR VEZ (o clique no clipe roda no mundo MAIN da página, como o do Projudi), e manda o mov-diag.js guardar a lista.
 *  Orçamento curto (padrão 35 s): estourou, para na hora (a página é avisada para abortar) e segue com o que leu; nunca deixa nada rodando na página. Devolve {ok,total,abertas,falhas,ms,parcial} ou null; nunca lança. */
export async function completarArquivosDoQuadro(tabId, limiteMs = 35000) {
  const abortar = () => chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: () => { window.__movsAbort = true; } }).catch(() => {});
  let corte = null;
  try {
    const exec = chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", args: [limiteMs], func: async (limite) => {
      const linhas = [...document.querySelectorAll("#tabListaProcesso tr[movi_codigo]")]; if (!linhas.length) return null;
      window.__movsAbort = false;
      const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms)), t0 = Date.now(); let abertas = 0, falhas = 0, parcial = false;
      const carregado = (tr) => { const f = tr.nextElementSibling; return !!(f && !f.hasAttribute("movi_codigo") && f.querySelector("a[href]")); };
      const pendentes = linhas.filter((tr) => !carregado(tr) && tr.children[4] && tr.children[4].querySelector('a[href*="buscarArquivosMovimentacaoJSON"]'));
      const LOTE = 8;
      for (let i = 0; i < pendentes.length; i += LOTE) {
        if (window.__movsAbort || Date.now() - t0 > limite) { parcial = true; break; }
        const grupo = pendentes.slice(i, i + LOTE);
        for (const tr of grupo) { try { tr.children[4].querySelector('a[href*="buscarArquivosMovimentacaoJSON"]').click(); } catch (e) { falhas++; } }
        for (let k = 0; k < 20 && !window.__movsAbort; k++) { await dorme(250); if (grupo.every(carregado)) break; }
        for (const tr of grupo) { if (carregado(tr)) abertas++; else falhas++; }
      }
      return { ok: true, total: linhas.length, abertas, falhas, parcial, ms: Date.now() - t0 };
    } }).catch(() => []);
    const r = await Promise.race([exec, new Promise((ok) => { corte = setTimeout(() => ok("corte"), limiteMs + 8000); })]);
    clearTimeout(corte);
    if (r === "corte") { await abortar(); await chrome.tabs.sendMessage(tabId, { tipo: "movs-guardar" }).catch(() => null); return { ok: true, total: 0, abertas: 0, falhas: 0, parcial: true, ms: limiteMs + 8000 }; }
    const res = (r || []).map((x) => x.result).find(Boolean) || null;
    if (!res) return null;
    const g = await chrome.tabs.sendMessage(tabId, { tipo: "movs-guardar" }).catch(() => null);      // o mov-diag.js guarda a lista completa agora (sem esperar o ciclo de 2,5 s)
    return { ...res, comLista: g && g.comLista, comArquivos: g && g.comArquivos };      // quantas movimentações com arquivo têm a lista guardada
  } catch { await abortar(); return null; }
}
