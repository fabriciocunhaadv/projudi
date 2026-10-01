// Documento invisível: o service worker não tem DOMParser, então a leitura do HTML é feita aqui.
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.alvo !== "offscreen") return;
  try {
    responder(msg.tipo === "lista" ? ProjudiParser.parseLista(msg.html)
                                   : ProjudiParser.parseConclusoes(msg.html));
  } catch (e) {
    responder({ erro: String(e) });
  }
});
