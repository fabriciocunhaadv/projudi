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
  // Diário das gravações de auditorias da Lupa (só observa; não altera o que o app grava): ajuda a entender por que uma auditoria substitui outra.
  try {
    const registrar = (op, k, v) => {
      if (!/audit/i.test(String(k))) return;
      let resumo = "";
      try { const j = JSON.parse(v); resumo = Array.isArray(j) ? { n: j.length, campos: j[0] ? Object.keys(j[0]).slice(0, 14) : [], ids: j.slice(0, 12).map((x) => [x.id, x.processNumber || x.numeroProcesso || x.processo || x.numero || x.processNumberDetected || ""]) } : { chaves: Object.keys(j || {}).slice(0, 14) }; } catch (e) { resumo = { tam: v ? String(v).length : 0 }; }
      const log = JSON.parse(document.documentElement.dataset.projudiGravacoes || "[]");
      log.push({ t: new Date().toLocaleTimeString("pt-BR"), op, k: String(k), resumo });
      document.documentElement.dataset.projudiGravacoes = JSON.stringify(log.slice(-40));
    };
    const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) { try { registrar("grava", k, v); } catch (e) { /* observação nunca atrapalha */ } return set.apply(this, arguments); };
    Storage.prototype.removeItem = function (k) { try { registrar("apaga", k, null); } catch (e) { /* idem */ } return rem.apply(this, arguments); };
  } catch (e) { /* sem observação */ }
})();
