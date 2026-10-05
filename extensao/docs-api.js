// Cria o documento no Google Docs e abre o PDF do processo lado a lado com ele.
import { requisicoes, htmlMonografia, tipoDaMinuta, nomeDoc } from "./docs-core.js";
export { tipoDaMinuta, nomeDoc };

export const DOCS_API = "https://docs.googleapis.com/v1/documents";
const configurado = () => { const id = chrome.runtime.getManifest().oauth2?.client_id || ""; return id && !/^COLE_AQUI/.test(id); };
const token = () => new Promise((ok, erro) => chrome.identity.getAuthToken({ interactive: true }, (t) => (chrome.runtime.lastError || !t ? erro(new Error(chrome.runtime.lastError?.message || "sem autorização do Google")) : ok(typeof t === "string" ? t : t.token))));

async function chamar(url, t, corpo) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`Google Docs respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Devolve { url, id, via: "api" | "colar" }.
export async function criarDocumento(titulo, minuta, paragrafos) {
  const conteudo = paragrafos || minuta;
  if (configurado()) {
    const t = await token();
    const doc = await chamar(DOCS_API, t, { title: titulo });
    await chamar(`${DOCS_API}/${doc.documentId}:batchUpdate`, t, { requests: requisicoes(conteudo) });
    return { id: doc.documentId, url: `https://docs.google.com/document/d/${doc.documentId}/edit`, via: "api" };
  }
  // Plano B: documento em branco com o título; a minuta já fica copiada, formatada, para dar Ctrl+V.
  let copiou = false;
  try {
    const html = htmlMonografia(conteudo);
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([minuta], { type: "text/plain" }) })]);
    copiou = true;
  } catch (e) { /* página sem foco: o usuário usa o botão Copiar do app */ }
  return { url: "https://docs.google.com/document/create?title=" + encodeURIComponent(titulo), via: "colar", copiou, html: htmlMonografia(conteudo) };
}

// Abre o Google Docs e o PDF. "abas" (padrão): duas abas vizinhas, agrupadas, na mesma janela (dá para usar o "Dividir guia" do Chrome com um clique);
// "janelas": duas janelas, cada uma em metade da tela.
export async function abrirLadoALado(urlDoc, urlPdf, modo = "abas") {
  if (modo !== "janelas") {
    const doc = await chrome.tabs.create({ url: urlDoc, active: true });
    const pdf = await chrome.tabs.create({ url: urlPdf, active: false, windowId: doc.windowId, index: doc.index + 1 });
    try { const g = await chrome.tabs.group({ tabIds: [doc.id, pdf.id] }); await chrome.tabGroups.update(g, { title: "Minuta + PDF", color: "blue" }); } catch (e) { /* sem agrupar */ }
    return { doc: doc.id, pdf: pdf.id };
  }
  const W = screen.availWidth || 1366, H = screen.availHeight || 768, L = screen.availLeft || 0, T = screen.availTop || 0, meio = Math.floor(W / 2);
  const criar = (o) => chrome.windows.create(o).catch(() => chrome.windows.create({ url: o.url, focused: o.focused }));      // posição recusada pelo Chrome (monitor atípico): abre sem posicionar
  const doc = await criar({ url: urlDoc, left: L, top: T, width: meio, height: H, focused: true });
  const pdf = await criar({ url: urlPdf, left: L + meio, top: T, width: W - meio, height: H, focused: false });
  return { doc: doc.id, pdf: pdf.id };
}

// Lê de volta o documento já conferido/corrigido: devolve { texto, html } com parágrafos, citações (recuo >= 3 cm), negrito e itálico.
export async function lerDocumento(id) {
  if (!configurado()) return null;
  const r = await fetch(`${DOCS_API}/${id}`, { headers: { Authorization: "Bearer " + await token() } });
  if (!r.ok) throw new Error(`Google Docs respondeu ${r.status} ao ler o documento`);
  const d = await r.json(), esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textos = [], html = [];
  for (const b of d.body?.content || []) {
    if (!b.paragraph) continue;
    const els = b.paragraph.elements || [];
    const txt = els.map((e) => e.textRun?.content || "").join("").replace(/\n$/, "");
    if (!txt.trim()) continue;
    const estilo = b.paragraph.paragraphStyle || {}, recuo = estilo.indentStart?.magnitude || 0;
    const interno = els.map((e) => { const c = (e.textRun?.content || "").replace(/\n/g, ""); if (!c) return ""; let h = esc(c); const ts = e.textRun.textStyle || {}; if (ts.bold) h = `<b>${h}</b>`; if (ts.italic) h = `<i>${h}</i>`; return h; }).join("");
    textos.push(txt);
    html.push(estilo.alignment === "CENTER" ? `<h3>${interno}</h3>` : recuo >= 80 ? `<blockquote><p>${interno}</p></blockquote>` : `<p>${interno}</p>`);
  }
  return { texto: textos.join("\n"), html: html.join("") };
}
export const idDoDocumento = (url) => (url || "").match(/\/d\/([\w-]+)/)?.[1] || "";
