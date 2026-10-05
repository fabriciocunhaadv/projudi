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

// Pedidos para documents.batchUpdate (índices do Docs: UTF-16, começam em 1).
export function requisicoes(bruto) {
  const ps = paragrafos(bruto), texto = ps.map((p) => p.texto).join("\n");
  const total = texto.length;
  const R = [{ insertText: { location: { index: 1 }, text: texto } }];
  R.push({ updateDocumentStyle: { documentStyle: { pageSize: { width: { magnitude: 595.28, unit: "PT" }, height: { magnitude: 841.89, unit: "PT" } },
    marginTop: { magnitude: 3 * CM, unit: "PT" }, marginLeft: { magnitude: 3 * CM, unit: "PT" }, marginBottom: { magnitude: 2 * CM, unit: "PT" }, marginRight: { magnitude: 2 * CM, unit: "PT" } },
    fields: "pageSize,marginTop,marginLeft,marginBottom,marginRight" } });
  const todo = { startIndex: 1, endIndex: total + 1 };
  R.push({ updateTextStyle: { range: todo, textStyle: { weightedFontFamily: { fontFamily: "Times New Roman" }, fontSize: { magnitude: 12, unit: "PT" } }, fields: "weightedFontFamily,fontSize" } });
  R.push({ updateParagraphStyle: { range: todo, paragraphStyle: { alignment: "JUSTIFIED", lineSpacing: 150, indentFirstLine: { magnitude: 1.25 * CM, unit: "PT" }, spaceAbove: { magnitude: 0, unit: "PT" }, spaceBelow: { magnitude: 0, unit: "PT" } }, fields: "alignment,lineSpacing,indentFirstLine,spaceAbove,spaceBelow" } });
  let i = 1;
  for (const p of ps) {
    const ini = i, fim = i + p.texto.length;
    if (p.titulo) {
      R.push({ updateParagraphStyle: { range: { startIndex: ini, endIndex: Math.min(fim + 1, total + 1) }, paragraphStyle: { alignment: "CENTER", indentFirstLine: { magnitude: 0, unit: "PT" } }, fields: "alignment,indentFirstLine" } });
      R.push({ updateTextStyle: { range: { startIndex: ini, endIndex: fim }, textStyle: { bold: true }, fields: "bold" } });
    }
    for (const [a, b] of p.negritos) R.push({ updateTextStyle: { range: { startIndex: ini + a, endIndex: ini + b }, textStyle: { bold: true }, fields: "bold" } });
    i = fim + 1;
  }
  return R;
}

// Plano B (sem login do Google configurado): o mesmo texto em HTML para colar no documento em branco.
export function htmlMonografia(bruto) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const base = 'font-family:"Times New Roman";font-size:12pt;line-height:1.5;margin:0;';
  return paragrafos(bruto).map((p) => {
    let t = "", u = 0;
    for (const [a, b] of p.negritos) { t += esc(p.texto.slice(u, a)) + "<b>" + esc(p.texto.slice(a, b)) + "</b>"; u = b; }
    t += esc(p.texto.slice(u));
    return p.titulo ? `<p style='${base}text-align:center;'><b>${t}</b></p>` : `<p style='${base}text-align:justify;text-indent:1.25cm;'>${t}</p>`;
  }).join("");
}
