// Na aba "Navegação de Arquivos": mostra o botão "Baixar arquivos" que abre a página de seleção da extensão.
(() => {
  const A = globalThis.ProjudiArquivos;
  if (!A || window.__projudiBaixadorCarregado) return;
  window.__projudiBaixadorCarregado = true;
  let botao = null;

  function criar(dados) {
    if (botao && botao.isConnected) { botao.shadowRoot.querySelector("button").textContent = rotulo(dados); return; }
    const host = document.createElement("div");
    host.setAttribute("data-projudi-ext", "baixador");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `<style>button{position:fixed;left:6px;bottom:8px;z-index:2147483647;font:12px system-ui,sans-serif;padding:5px 9px;border:1px solid #1a56a0;background:#1a56a0;color:#fff;border-radius:5px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35)}button:hover{background:#12407a}</style><button></button>`;
    sh.querySelector("button").textContent = rotulo(dados);
    sh.querySelector("button").addEventListener("click", () => {
      const d = A.descobrir(document);
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script,style,link,svg,noscript,[data-projudi-ext]").forEach((e) => e.remove());
      const html = clone.outerHTML.replace(/\s+/g, " ").slice(0, 150000);   // para diagnóstico, se a leitura não bater com a tela
      chrome.runtime.sendMessage({ acao: "baixar-arquivos", job: { processo: d.processo, movimentos: d.movimentos, origem: location.href, html } });
    });
    document.documentElement.appendChild(host);
    botao = host;
  }
  const rotulo = (d) => `⬇ Baixar arquivos do processo (${d.total})`;

  function verificar() {
    if (!document.body) return;
    try { if (A.ehNavegacao(document)) criar(A.descobrir(document)); } catch (e) { /* página ainda carregando */ }
  }
  verificar();
  let n = 0;
  const t = setInterval(() => { verificar(); if (++n > 20) { clearInterval(t); if (botao) setInterval(verificar, 10000); } }, 1500);   // outras telas: para de procurar
})();
