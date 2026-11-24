// SEEU — leitores das telas. Cada função é INJETADA no frame da aba do SEEU (autocontida, só lê; não clica, não envia, não digita nada).
// lerAreasSeeu: tela "Área de atuação" (ul#listaAreavara). lerConclusoesSeeu: lista de Conclusões (.resultTable).
async function lerAreasSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const doDoc = (doc) => {
    const vistos = new Set(), areas = [];
    const add = (nome, atual) => { nome = (nome || "").replace(/\s+/g, " ").trim(); if (!nome || vistos.has(nome)) return; vistos.add(nome); areas.push({ nome, atual: !!atual }); };
    // 1) tela "Área de atuação" (lista completa)
    [...doc.querySelectorAll("#listaAreavara li a, #listaAreasAtuacaoVisitadas li a, #areasAtuacaoVisitadas li a")].filter((a) => /areaAtuacao\.do/.test(a.getAttribute("href") || "")).forEach((a) => add(a.getAttribute("title") || t(a)));
    // 2) menu suspenso do topo ("Últimas visitadas"): itens com cara de nome de vara/serventia
    if (!areas.length) [...doc.querySelectorAll("a, li, div, span, button")].filter((e) => !e.querySelector("a, li, div, button") && /^[A-ZÇÃÕ]{2,6}\s+-\s+\S/.test(t(e)) && t(e).length < 160 && /vara|ju[ií]zo|serventia|corregedoria|comarca|execu[cç][aã]o|presidio|presídio/i.test(t(e))).forEach((e) => add(t(e)));
    return areas;
  };
  let areas = doDoc(document), fonte = "tela";
  // 3) não está na tela: acha o link "Alterar atuação" do próprio SEEU e lê a página em segundo plano (só leitura, sem clicar nem trocar nada)
  if (areas.length < 2) {
    const link = [...document.querySelectorAll("a[href]")].find((a) => /areaAtuacao\.do|alterarAtuacao|AlterarAtua[cç][aã]o/i.test(a.getAttribute("href") || "") && !/areaAtuacao\.do\?[^#]*(idArea|codigoArea|id=)/i.test(a.getAttribute("href") || ""));
    if (link) { try { const resp = await fetch(link.href, { credentials: "include" }); const buf = await resp.arrayBuffer(); const html = new TextDecoder("iso-8859-1").decode(buf); const outra = doDoc(new DOMParser().parseFromString(html, "text/html")); if (outra.length > areas.length) { areas = outra; fonte = "página Alterar atuação"; } } catch (e) { /* fica com o que achou */ } }
  }
  const atual = t(document.querySelector("[class*=atuacao i] [class*=selected i], #areaAtuacaoAtual, .area-atuacao-atual"));
  return { areas, fonte, atual, url: location.href.replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…") };
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
