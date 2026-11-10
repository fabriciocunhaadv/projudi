// Diagnóstico: na tela do processo (no quadro que tem a tabela de Movimentações), mostra um botão que salva só esse quadro como arquivo .html
// (sem scripts/estilos), para eu ver a estrutura real da tabela e programar a leitura das movimentações. Não envia nada pela internet.
(() => {
  if (window.__projudiMovDiag) return; window.__projudiMovDiag = true;
  const temTabela = () => { const t = (document.body && document.body.textContent) || ""; return /Autos Conclusos|Juntada|Intima[cç][aã]o (Expedida|Efetivada)/i.test(t) && (t.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/g) || []).length >= 5; };
  let botao = null;
  const criar = () => {
    const host = document.createElement("div"); host.setAttribute("data-projudi-ext", "mov-diag");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = '<style>button{position:fixed;right:8px;bottom:8px;z-index:2147483647;font:12px system-ui,sans-serif;padding:5px 9px;border:1px solid #7a3e00;background:#b45f06;color:#fff;border-radius:5px;cursor:pointer}</style><button type="button" title="Salva só esta tabela como arquivo, para enviar ao Claude (nada vai para a internet)">⬇ Salvar movimentações (para o Claude)</button>';
    sh.querySelector("button").addEventListener("click", () => {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script,style,link,svg,noscript,img,[data-projudi-ext]").forEach((e) => e.remove());
      const html = clone.outerHTML.replace(/\s+/g, " ");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); a.download = "movimentacoes-projudi.html";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    document.documentElement.appendChild(host); botao = host;
  };
  const verificar = () => { try { if (document.body && !(botao && botao.isConnected) && temTabela()) criar(); } catch (e) { /* carregando */ } };
  verificar(); setInterval(verificar, 2500);
})();
