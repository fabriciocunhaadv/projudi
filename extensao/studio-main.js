// Roda no mundo da PÁGINA do app de IA: permite que a extensão confirme o "excluir documento" quando a página usa confirm() do navegador.
(() => {
  if (window.__projudiStudioMain) return;
  window.__projudiStudioMain = true;
  const original = window.confirm.bind(window);
  window.confirm = (msg) => (document.documentElement.dataset.projudiAutoConfirm === "1" ? true : original(msg));
})();
