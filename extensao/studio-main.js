// Roda no mundo da PÁGINA do app de IA: permite que a extensão confirme o "excluir documento" quando a página usa confirm() do navegador.
(() => {
  if (window.__projudiStudioMain) return;
  window.__projudiStudioMain = true;
  const original = window.confirm.bind(window);
  window.confirm = (msg) => (document.documentElement.dataset.projudiAutoConfirm === "1" ? true : original(msg));
  // O botão "Copiar" do app grava a minuta na área de transferência: guardamos o texto para a extensão ler.
  try {
    const w = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { document.documentElement.dataset.projudiCopiado = String(t); return w(t).catch(() => {}); };
  } catch (e) { /* sem clipboard */ }
})();
