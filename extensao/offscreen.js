// Documento invisível: o service worker não tem DOMParser, então a leitura do HTML é feita aqui.
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.alvo !== "offscreen") return;
  try {
    const f = { lista: "parseLista", conclusoes: "parseConclusoes", processos: "parseProcessos" }[msg.tipo];
    responder(ProjudiParser[f](msg.html));
  } catch (e) {
    responder({ erro: String(e) });
  }
});
