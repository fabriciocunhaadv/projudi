// Regras puras (sem chrome.*) para levar a minuta ao Google Docs no padrão de monografia.
// A4, margens 3 cm (superior/esquerda) e 2 cm (inferior/direita), Times New Roman 12, justificado,
// espaçamento 1,5, recuo de 1,25 cm na primeira linha, títulos centralizados em negrito.
const CM = 28.3465;      // pontos por centímetro

export function tipoDaMinuta(texto) {
  const t = (texto || "").slice(0, 1500).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (/DECISAO SANEADORA|SANEAMENTO E ORGANIZACAO|DECISAO DE SANEAMENTO/.test(t)) return "decisão saneadora";
  if (/DECISAO INTERLOCUTORIA/.test(t)) return "decisão interlocutória";
  if (/\bSENTENCA\b|ISTO POSTO.*JULGO|DISPOSITIVO/.test(t)) return "sentença";
  if (/\bDESPACHO\b/.test(t)) return "despacho";
  if (/\bDECISAO\b/.test(t)) return "decisão interlocutória";
  return "minuta";
}

export const nomeDoc = (processo, tipo) => `${processo} – ${tipo}`;

// Texto da tela → parágrafos { texto, titulo, negritos:[[ini,fim]] } já sem marcas de markdown.
export function paragrafos(bruto) {
  const saida = [];
  for (let linha of String(bruto || "").replace(/\r/g, "").split("\n")) {
    linha = linha.replace(/ /g, " ").trim();
    if (!linha) continue;
    let titulo = false;
    const h = linha.match(/^#{1,6}\s+(.*)$/);
    if (h) { linha = h[1]; titulo = true; }
    const negritos = []; let limpo = "";
    for (const parte of linha.split(/(\*\*[^*]+\*\*)/)) {
      if (/^\*\*[^*]+\*\*$/.test(parte)) { const x = parte.slice(2, -2); negritos.push([limpo.length, limpo.length + x.length]); limpo += x; }
      else limpo += parte.replace(/\*/g, "");
    }
    limpo = limpo.trim();
    const letras = limpo.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (!titulo && letras.length >= 4 && limpo.length <= 90 && limpo === limpo.toUpperCase() && !/[.;]$/.test(limpo)) titulo = true;
    saida.push({ texto: limpo, titulo, negritos: titulo ? [] : negritos });
  }
  return saida;
}

// HTML da minuta (títulos, parágrafos, citações em <blockquote>, negrito/itálico) -> parágrafos { texto, titulo, citacao, negritos, italicos }.
export function paragrafosDeHtml(html) {
  const d = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html"), saida = [];
  const BLOCOS = "p,div,li,blockquote,h1,h2,h3,h4,h5,h6,ul,ol";
  const inline = (no, est, acc) => {
    if (no.nodeType === 3) {
      const t = no.nodeValue.replace(/\s+/g, " "); if (!t) return;
      const ini = acc.texto.length; acc.texto += t;
      if (est.b) acc.b.push([ini, acc.texto.length]); if (est.i) acc.i.push([ini, acc.texto.length]); return;
    }
    if (no.nodeType !== 1) return;
    if (no.tagName === "BR") { acc.texto += "\n"; return; }
    const e = { ...est }; if (/^(B|STRONG)$/.test(no.tagName)) e.b = true; if (/^(I|EM)$/.test(no.tagName)) e.i = true;
    for (const c of no.childNodes) inline(c, e, acc);
  };
  const emitir = (el, { titulo = false, citacao = false } = {}) => {
    const acc = { texto: "", b: [], i: [] }; for (const c of el.childNodes) inline(c, {}, acc);
    // quebras de linha (<br>) dentro do bloco viram parágrafos separados
    let ini = 0;
    for (const trecho of acc.texto.split("\n")) {
      const fim = ini + trecho.length, lead = trecho.length - trecho.trimStart().length, t = trecho.trim();
      if (t) {
        const fatia = (r) => r.map(([x, y]) => [Math.max(x, ini + lead) - (ini + lead), Math.min(y, ini + lead + t.length) - (ini + lead)]).filter(([x, y]) => y > x && x >= 0);
        saida.push({ texto: t, titulo, citacao, negritos: titulo ? [] : fatia(acc.b), italicos: fatia(acc.i) });
      }
      ini = fim + 1;
    }
  };
  const percorrer = (no, ctx) => {
    for (const el of no.children) {
      const tag = el.tagName, tembloco = !!el.querySelector(BLOCOS);
      if (/^H[1-6]$/.test(tag)) emitir(el, { titulo: true });
      else if (tag === "BLOCKQUOTE") { if (tembloco) percorrer(el, { citacao: true }); else emitir(el, { citacao: true }); }
      else if (/^(P|LI|DIV)$/.test(tag) && !tembloco) emitir(el, ctx);
      else percorrer(el, ctx);
    }
  };
  percorrer(d.body, {});
  return saida;
}

const normalizar = (x) => (Array.isArray(x) ? x : paragrafos(x));

// Pedidos para documents.batchUpdate (índices do Docs: UTF-16, começam em 1). Aceita texto simples ou parágrafos.
export function requisicoes(entrada) {
  const ps = normalizar(entrada), texto = ps.map((p) => p.texto).join("\n");
  const total = texto.length;
  const PT = (n) => ({ magnitude: n, unit: "PT" });
  const R = [{ insertText: { location: { index: 1 }, text: texto } }];
  R.push({ updateDocumentStyle: { documentStyle: { pageSize: { width: PT(595.28), height: PT(841.89) },
    marginTop: PT(3 * CM), marginLeft: PT(3 * CM), marginBottom: PT(2 * CM), marginRight: PT(2 * CM) },
    fields: "pageSize,marginTop,marginLeft,marginBottom,marginRight" } });
  const todo = { startIndex: 1, endIndex: total + 1 };
  R.push({ updateTextStyle: { range: todo, textStyle: { weightedFontFamily: { fontFamily: "Times New Roman" }, fontSize: PT(12) }, fields: "weightedFontFamily,fontSize" } });
  R.push({ updateParagraphStyle: { range: todo, paragraphStyle: { alignment: "JUSTIFIED", lineSpacing: 150, indentFirstLine: PT(1.25 * CM), indentStart: PT(0), spaceAbove: PT(0), spaceBelow: PT(0) }, fields: "alignment,lineSpacing,indentFirstLine,indentStart,spaceAbove,spaceBelow" } });
  let i = 1;
  for (const p of ps) {
    const ini = i, fim = i + p.texto.length, faixaPar = { startIndex: ini, endIndex: Math.min(fim + 1, total + 1) };
    if (p.titulo) {
      R.push({ updateParagraphStyle: { range: faixaPar, paragraphStyle: { alignment: "CENTER", indentFirstLine: PT(0) }, fields: "alignment,indentFirstLine" } });
      R.push({ updateTextStyle: { range: { startIndex: ini, endIndex: fim }, textStyle: { bold: true }, fields: "bold" } });
    } else if (p.citacao) {      // citação: recuo de 4 cm da margem, fonte 10, itálico, espaçamento simples
      R.push({ updateParagraphStyle: { range: faixaPar, paragraphStyle: { indentStart: PT(4 * CM), indentFirstLine: PT(0), lineSpacing: 100 }, fields: "indentStart,indentFirstLine,lineSpacing" } });
      R.push({ updateTextStyle: { range: { startIndex: ini, endIndex: fim }, textStyle: { fontSize: PT(10), italic: true }, fields: "fontSize,italic" } });
    }
    for (const [a, b] of p.negritos || []) R.push({ updateTextStyle: { range: { startIndex: ini + a, endIndex: ini + b }, textStyle: { bold: true }, fields: "bold" } });
    if (!p.citacao) for (const [a, b] of p.italicos || []) R.push({ updateTextStyle: { range: { startIndex: ini + a, endIndex: ini + b }, textStyle: { italic: true }, fields: "italic" } });
    i = fim + 1;
  }
  return R;
}

// Plano B (sem login do Google): o mesmo texto em HTML para colar no documento em branco.
export function htmlMonografia(entrada) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const base = 'font-family:"Times New Roman";margin:0;';
  return normalizar(entrada).map((p) => {
    const marcas = [];      // [pos, abre?, tag]
    for (const [a, b] of p.negritos || []) marcas.push([a, 1, "b"], [b, 0, "b"]);
    for (const [a, b] of p.italicos || []) marcas.push([a, 1, "i"], [b, 0, "i"]);
    marcas.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let t = "", u = 0;
    for (const [pos, abre, tag] of marcas) { t += esc(p.texto.slice(u, pos)) + (abre ? "<" : "</") + tag + ">"; u = pos; }
    t += esc(p.texto.slice(u));
    if (p.titulo) return `<p style='${base}font-size:12pt;line-height:1.5;text-align:center;'><b>${t}</b></p>`;
    if (p.citacao) return `<p style='${base}font-size:10pt;line-height:1;text-align:justify;margin-left:4cm;font-style:italic;'>${t}</p>`;
    return `<p style='${base}font-size:12pt;line-height:1.5;text-align:justify;text-indent:1.25cm;'>${t}</p>`;
  }).join("");
}
