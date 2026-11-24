// SEEU — leitores das telas. Cada função é INJETADA no frame da aba do SEEU (autocontida, só lê; não clica, não envia, não digita nada).
// lerAreasSeeu: tela "Área de atuação" (ul#listaAreavara). lerConclusoesSeeu: lista de Conclusões (.resultTable).
async function lerAreasSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const doDoc = (doc, solta) => {
    const vistos = new Set(), areas = [];
    const add = (nome) => { nome = (nome || "").replace(/\s+/g, " ").trim(); if (!nome || vistos.has(nome)) return; vistos.add(nome); areas.push({ nome }); };
    [...doc.querySelectorAll("#listaAreavara li a, #listaAreasAtuacaoVisitadas li a, #areasAtuacaoVisitadas li a")].filter((a) => /areaAtuacao\.do/.test(a.getAttribute("href") || "")).forEach((a) => add(a.getAttribute("title") || t(a)));
    if (!areas.length && solta) [...doc.querySelectorAll("li > a[href*='areaAtuacao.do']")].filter((a) => t(a).length > 5).forEach((a) => add(a.getAttribute("title") || t(a)));
    return areas;
  };
  // atuação atual: bloco "Atuação:" do cabeçalho do usuário
  const atual = [...document.querySelectorAll("#userinfo .group")].map((g) => (/Atua[cç][aã]o/i.test(t(g.querySelector(".userinfo_label"))) ? (g.querySelector("span[title]:not(.userinfo_label)")?.getAttribute("title") || "") : "")).find(Boolean) || "";
  let areas = doDoc(document), fonte = "tela";
  if (!areas.length) {
    // o ícone "Alterar atuação" guarda o endereço dentro de javascript:openSubmitDialog('...areaAtuacao.do?_tj=...'): lê essa página em segundo plano (só leitura)
    let u = "";
    for (const a of document.querySelectorAll("a[href]")) { const m = (a.getAttribute("href") || "").match(/openSubmitDialog\(\s*['"]([^'"]*areaAtuacao\.do[^'"]*)['"]/i); if (m) { u = m[1]; break; } }
    if (!u) { const l = [...document.querySelectorAll("a[href]")].find((a) => /^\/?(seeu\/)?usuario\/areaAtuacao\.do|^https?:.*areaAtuacao\.do/i.test(a.getAttribute("href") || "")); if (l) u = l.getAttribute("href"); }
    if (u) { try { const resp = await fetch(new URL(u, location.href).href, { credentials: "include" }); const html = new TextDecoder("iso-8859-1").decode(await resp.arrayBuffer()); areas = doDoc(new DOMParser().parseFromString(html, "text/html"), true); fonte = "página Alterar atuação"; } catch (e) { /* sem resultado */ } }
  }
  if (!areas.length) {
    // cabeçalho novo do SEEU (<seeu-header>, componente com shadow DOM): lê os itens "TJGO - ... Vara/Corregedoria..." do menu suspenso, se já estiverem montados
    const raizes = [], ach = (no) => { for (const e of no.querySelectorAll("*")) if (e.shadowRoot) { raizes.push(e.shadowRoot); ach(e.shadowRoot); } }; ach(document);
    const vistos = new Set();
    raizes.forEach((rz) => [...rz.querySelectorAll("*")].filter((e) => !e.children.length && /^[A-Z]{2,6}\s+-\s+\S/.test(t(e)) && t(e).length < 160 && /vara|ju[ií]zo|serventia|corregedoria|comarca|execu[cç][aã]o/i.test(t(e))).forEach((e) => { const n = t(e); if (!vistos.has(n)) { vistos.add(n); areas.push({ nome: n }); } }));
    if (areas.length) fonte = "menu do cabeçalho";
  }
  if (!areas.length && atual) { areas = [{ nome: atual }]; fonte = "só a atuação atual"; }
  return { areas, atual, fonte, url: location.href.replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…") };
}
// Atuação (serventia) em que o usuário está logado agora: só lê o cabeçalho do usuário na tela.
function lerAtuacaoSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const atual = [...document.querySelectorAll("#userinfo .group")].map((g) => (/Atua[cç][aã]o/i.test(t(g.querySelector(".userinfo_label"))) ? (g.querySelector("span[title]:not(.userinfo_label)")?.getAttribute("title") || "") : "")).find(Boolean) || "";
  return { atual };
}
// Item "Processos Remetidos p/ Conclusão" do menu Conclusões (quadro da barra do SEEU). Só existe nesse quadro.
const ACHAR_REMETIDOS = () => { const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim(); return [...document.querySelectorAll("#main-menu a[href]")].find((a) => /Processos Remetidos p\/? ?Conclus[ãa]o/i.test(t(a)) && /processo\/conclusao\.do/.test(a.getAttribute("href") || "")); };
function lerMenuConclusoesSeeu() { return { ok: !!ACHAR_REMETIDOS() }; }
// Abre a lista (é o mesmo clique que você daria; não confirma nada).
function abrirMenuConclusoesSeeu() { const a = ACHAR_REMETIDOS(); if (!a) return { ok: false }; a.click(); return { ok: true }; }
function lerConclusoesSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const tabela = document.querySelector("table.resultTable");
  if (!tabela) return { ok: false, erro: "Não achei a lista de Conclusões neste quadro." };
  const processos = [];
  tabela.querySelectorAll("tr").forEach((tr) => {
    const cb = tr.querySelector("input[name=idConclusoes]") || tr.querySelector("input[type=checkbox][value]:not([name=todos])"), a = tr.querySelector('a[href*="visualizacaoProcesso.do"]') || [...tr.querySelectorAll("a")].find((x) => /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(t(x)));
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
if (typeof globalThis !== "undefined") { globalThis.lerAreasSeeu = lerAreasSeeu; globalThis.lerAtuacaoSeeu = lerAtuacaoSeeu; globalThis.lerMenuConclusoesSeeu = lerMenuConclusoesSeeu; globalThis.abrirMenuConclusoesSeeu = abrirMenuConclusoesSeeu; globalThis.lerConclusoesSeeu = lerConclusoesSeeu; }
