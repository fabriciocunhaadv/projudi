// Roda no MUNDO DA PÁGINA do Agaia (tem acesso ao jQuery/Summernote dele). Recebe o HTML do script da extensão e o coloca no editor pela API do próprio Summernote,
// que também atualiza o campo "conteudo" enviado ao salvar — o mesmo caminho de quando a pessoa cola o texto à mão.
(() => {
  if (window.__agaiaPromptMain) return;
  window.__agaiaPromptMain = true;
  addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.__agaiaPromptMain !== "codigo" || typeof d.id !== "string") return;
    let r;
    try {
      const $ = window.jQuery || window.$, $n = $ && $("#conteudo");
      if (!$n || !$n.length || typeof $n.summernote !== "function") throw new Error("o editor Summernote não está na página");
      $n.summernote("code", String(d.html || ""));
      $n.val($n.summernote("code"));
      r = { ok: true, tam: String($n.val() || "").length };
    } catch (e) { r = { ok: false, erro: String((e && e.message) || e) }; }
    window.postMessage({ __agaiaPromptMainResp: d.id, ...r }, "*");
  });
})();
