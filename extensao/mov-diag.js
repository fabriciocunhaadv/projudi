// Na moldura do processo que tem a tabela de Movimentações: lê a tabela (todas as movimentações, inclusive as sem arquivo) e guarda no navegador
// (chrome.storage.local "movs:<processo>") para a extensão mandar ao Studio junto com o texto dos autos. Nada vai para a internet.
// Mantém também o botão "Salvar movimentações" (arquivo .html) para diagnóstico.
(() => {
  if (window.__projudiMovDiag) return; window.__projudiMovDiag = true;
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const NUM = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
  // Os arquivos de cada movimentação só aparecem na linha seguinte depois que o Projudi os carrega (clique no clipe). Lê o que já está carregado.
  const nomesDosArquivos = (tr) => { const f = tr.nextElementSibling; if (!f || f.hasAttribute("movi_codigo")) return []; return [...f.querySelectorAll("a[href]")].map((a) => norm(a.textContent)).filter(Boolean).slice(0, 80); };
  const temTabela = () => !!document.querySelector("#tabListaProcesso tr[movi_codigo]");
  function ler() {
    const movs = [];
    document.querySelectorAll("#tabListaProcesso tr[movi_codigo]").forEach((tr) => {
      const c = tr.children; if (c.length < 4) return;
      const n = parseInt(norm(c[0].textContent), 10); if (!n) return;
      const tipoEl = c[1].querySelector(".filtro_tipo_movimentacao"), tipo = norm(tipoEl ? tipoEl.textContent : "");
      const compl = norm(c[1].textContent).slice(tipo.length).trim();
      const m = { n, tipo, complemento: compl, data: norm(c[2].textContent), usuario: norm(c[3].textContent), comArquivos: !!(c[4] && c[4].querySelector("a[href]")) };
      const arq = nomesDosArquivos(tr); if (arq.length) m.arquivos = arq;      // lista oficial de arquivos da movimentação (a ordem da tela = Arq. 1, 2, 3…)
      movs.push(m);
    });
    const proc = (norm(document.body.textContent).match(NUM) || [""])[0];
    return { proc, movs };
  }
  let ultimo = "";
  async function guardar(forcar) {
    try {
      const { proc, movs } = ler(); if (!proc || !movs.length) return;
      const ass = proc + "|" + movs.length + "|" + movs[0].n + "|" + movs[0].data + "|" + movs.reduce((n, m) => n + (m.arquivos ? m.arquivos.length : 0), 0); if (!forcar && ass === ultimo) return; ultimo = ass;
      const todos = (await chrome.storage.local.get(null)), chaves = Object.keys(todos).filter((k) => k.startsWith("movs:"));
      if (chaves.length > 60) { chaves.sort((a, b) => (todos[a].em || 0) - (todos[b].em || 0)); await chrome.storage.local.remove(chaves.slice(0, chaves.length - 50)); }      // guarda só os 50 processos mais recentes
      // a tela recarregada não traz a lista de arquivos (ela só carrega ao clicar): mantém a que já estava guardada para a mesma movimentação
      const antes = (await chrome.storage.local.get("movs:" + proc))["movs:" + proc];
      if (antes && Array.isArray(antes.movs)) { const old = new Map(antes.movs.filter((m) => m && m.arquivos).map((m) => [m.n, m.arquivos])); for (const m of movs) if (!m.arquivos && old.has(m.n)) m.arquivos = old.get(m.n); }
      await chrome.storage.local.set({ ["movs:" + proc]: { em: Date.now(), movs } });
    } catch (e) { /* extensão recarregada ou página carregando */ }
  }
  // Pedido da extensão (movimentacoes-quadro.js, depois de abrir as movimentações com arquivo no mundo MAIN da página): guarda já a lista completa.
  try { chrome.runtime.onMessage.addListener((msg, _s, resp) => { if (!msg || msg.tipo !== "movs-guardar" || !temTabela()) return false; guardar(true).then(() => { const l = ler().movs; resp({ ok: true, comLista: l.filter((m) => m.arquivos).length, comArquivos: l.filter((m) => m.comArquivos).length }); }, (e) => resp({ ok: false, erro: String(e && e.message || e) })); return true; }); } catch (e) { /* sem runtime */ }
  let botao = null;
  const criar = () => {
    const host = document.createElement("div"); host.setAttribute("data-projudi-ext", "mov-diag");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = '<style>button{position:fixed;right:8px;bottom:8px;z-index:2147483647;font:11px system-ui,sans-serif;padding:3px 7px;border:1px solid #555;background:#777;color:#fff;border-radius:5px;cursor:pointer;opacity:.7}</style><button type="button" title="Diagnóstico: salva só esta tabela como arquivo (nada vai para a internet)">⬇ Salvar movimentações</button>';
    sh.querySelector("button").addEventListener("click", () => {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script,style,link,svg,noscript,img,[data-projudi-ext]").forEach((e) => e.remove());
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([clone.outerHTML.replace(/\s+/g, " ")], { type: "text/html;charset=utf-8" })); a.download = "movimentacoes-projudi.html";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    document.documentElement.appendChild(host); botao = host;
  };
  const verificar = () => { try { if (!document.body || !temTabela()) return; if (!(botao && botao.isConnected)) criar(); void guardar(); } catch (e) { /* carregando */ } };
  verificar(); setInterval(verificar, 2500);
})();
