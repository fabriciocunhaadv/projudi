// Na moldura do processo que tem a tabela de Movimentações: lê a tabela (todas as movimentações, inclusive as sem arquivo) e guarda no navegador
// (chrome.storage.local "movs:<processo>") para a extensão mandar ao Studio junto com o texto dos autos. Nada vai para a internet.
// Mantém também o botão "Salvar movimentações" (arquivo .html) para diagnóstico.
(() => {
  if (window.__projudiMovDiag) return; window.__projudiMovDiag = true;
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const NUM = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
  const temTabela = () => !!document.querySelector("#tabListaProcesso tr[movi_codigo]");
  function ler() {
    const movs = [];
    document.querySelectorAll("#tabListaProcesso tr[movi_codigo]").forEach((tr) => {
      const c = tr.children; if (c.length < 4) return;
      const n = parseInt(norm(c[0].textContent), 10); if (!n) return;
      const tipoEl = c[1].querySelector(".filtro_tipo_movimentacao"), tipo = norm(tipoEl ? tipoEl.textContent : "");
      const compl = norm(c[1].textContent).slice(tipo.length).trim();
      movs.push({ n, tipo, complemento: compl, data: norm(c[2].textContent), usuario: norm(c[3].textContent), comArquivos: !!(c[4] && c[4].querySelector("a[href]")) });
    });
    const proc = (norm(document.body.textContent).match(NUM) || [""])[0];
    return { proc, movs };
  }
  let ultimo = "";
  async function guardar() {
    try {
      const { proc, movs } = ler(); if (!proc || !movs.length) return;
      const ass = proc + "|" + movs.length + "|" + movs[0].n + "|" + movs[0].data; if (ass === ultimo) return; ultimo = ass;
      const todos = (await chrome.storage.local.get(null)), chaves = Object.keys(todos).filter((k) => k.startsWith("movs:"));
      if (chaves.length > 60) { chaves.sort((a, b) => (todos[a].em || 0) - (todos[b].em || 0)); await chrome.storage.local.remove(chaves.slice(0, chaves.length - 50)); }      // guarda só os 50 processos mais recentes
      await chrome.storage.local.set({ ["movs:" + proc]: { em: Date.now(), movs } });
    } catch (e) { /* extensão recarregada ou página carregando */ }
  }
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
