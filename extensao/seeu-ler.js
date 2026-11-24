// SEEU — leitores das telas. Cada função é INJETADA no frame da aba do SEEU (autocontida, só lê; não clica, não envia, não digita nada).
// lerAreasSeeu: tela "Área de atuação" (ul#listaAreavara). lerConclusoesSeeu: lista de Conclusões (.resultTable).
function lerAreasSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const links = [...document.querySelectorAll("#listaAreavara li a, #listaAreasAtuacaoVisitadas li a, #areasAtuacaoVisitadas li a")].filter((a) => /areaAtuacao\.do/.test(a.getAttribute("href") || ""));
  const vistos = new Set(), areas = [];
  links.forEach((a, i) => { const nome = (a.getAttribute("title") || t(a)).trim(); if (!nome || vistos.has(nome)) return; vistos.add(nome); areas.push({ nome, indice: i }); });
  return { areas, url: location.href.replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…") };
}
function lerConclusoesSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const tabela = document.querySelector("table.resultTable");
  if (!tabela) return { ok: false, erro: "Não achei a lista de Conclusões neste quadro." };
  const processos = [];
  tabela.querySelectorAll("tr").forEach((tr) => {
    const cb = tr.querySelector("input[name=idConclusoes]"), a = tr.querySelector('a[href*="visualizacaoProcesso.do"]');
    if (!cb || !a) return;
    const numero = (t(a.querySelector("em")) || t(a)).match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || t(a);
    const cels = [...tr.children].map(t);
    const data = (cels.join(" | ").match(/(?<!\d)\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/) || [""])[0];
    const partes = [...tr.querySelectorAll('a[href*="parteProcesso.do"]')].map(t).filter(Boolean);
    const tipo = (cels.find((c) => /^(DECIS[ÃA]O|DESPACHO|SENTEN[ÇC]A)/i.test(c)) || "").trim();
    processos.push({ idConclusao: cb.value, numero, urgente: /URGENTE/.test(tr.textContent), reuPreso: !!tr.querySelector('[class*="REU_PRESO"]'), entrada: data, tipo, partes: [...new Set(partes)], linha: cels.filter(Boolean).join(" | ").slice(0, 400) });
  });
  const contador = t(document.querySelector("#navigator .navLeft")) || (document.body.textContent.match(/\d+\s+registro\(s\)\s+encontrado\(s\)[^.]{0,60}/) || [""])[0];
  return { ok: true, processos, contador: contador.replace(/\s+/g, " ").trim(), url: location.href.replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…") };
}
if (typeof globalThis !== "undefined") { globalThis.lerAreasSeeu = lerAreasSeeu; globalThis.lerConclusoesSeeu = lerConclusoesSeeu; }
