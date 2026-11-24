// SEEU — diagnóstico das telas. A função abaixo é INJETADA em cada frame da aba do SEEU (o SEEU mostra tudo dentro de frames) e devolve o HTML já limpo:
// sem scripts/estilos, sem valores de senha e sem o token de segurança "_tj" das URLs. O que sobra são os nomes dos campos e botões, que é o que o desenvolvimento precisa.
function coletarFrameSeeu() {
  const limpaUrl = (u) => String(u || "").replace(/([?&;]?_tj=)[0-9a-zA-Z]+/g, "$1…").replace(/(jsessionid=)[^&;?"' ]+/gi, "$1…");
  try {
    const c = document.documentElement.cloneNode(true);
    c.querySelectorAll("script,style,link,svg,noscript,[data-projudi-ext]").forEach((e) => e.remove());
    c.querySelectorAll("input[type=password]").forEach((e) => { e.removeAttribute("value"); });
    c.querySelectorAll("input[type=hidden]").forEach((e) => { const n = (e.getAttribute("name") || "").toLowerCase(); if (/token|csrf|_tj|senha|password|session/.test(n)) e.setAttribute("value", "…"); });
    let html = c.outerHTML.replace(/\s+/g, " ").replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…").replace(/(jsessionid=)[^&;?"' ]+/gi, "$1…");
    const total = html.length; if (total > 150000) html = html.slice(0, 150000) + `\n[... cortado: ${total} caracteres no total ...]`;
    return { url: limpaUrl(location.href), titulo: document.title || "", topo: window === window.top, nome: window.name || "", html };
  } catch (e) { return { url: limpaUrl(location.href), erro: String(e && e.message || e) }; }
}
if (typeof globalThis !== "undefined") globalThis.coletarFrameSeeu = coletarFrameSeeu;
