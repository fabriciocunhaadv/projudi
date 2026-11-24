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
// Item "Processos Remetidos p/ Conclusão" do menu Conclusões (quadro da barra do SEEU). Funções AUTOCONTIDAS: são injetadas uma a uma, não enxergam nada fora delas.
function lerMenuConclusoesSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  return { ok: !![...document.querySelectorAll("#main-menu a[href]")].find((a) => /Processos Remetidos p\/? ?Conclus[ãa]o/i.test(t(a)) && /processo\/conclusao\.do/.test(a.getAttribute("href") || "")) };
}
// Abre a lista (é o mesmo clique que você daria; não confirma nada).
function abrirMenuConclusoesSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const a = [...document.querySelectorAll("#main-menu a[href]")].find((x) => /Processos Remetidos p\/? ?Conclus[ãa]o/i.test(t(x)) && /processo\/conclusao\.do/.test(x.getAttribute("href") || ""));
  if (!a) return { ok: false }; a.click(); return { ok: true };
}
// Lista de processos de TODAS as páginas, numa só: lê a página da tela e, se o SEEU diz que há mais registros, pede as outras páginas
// do mesmo jeito que os botões de página dele (reenvia o formulário da lista com outro número de página e 100 por página). Só leitura.
async function lerConclusoesSeeu() {
  const t = (e) => (e && e.textContent || "").replace(/\s+/g, " ").trim();
  const extrair = (doc) => {
    const tabela = doc.querySelector("table.resultTable"); if (!tabela) return null;
    const processos = [];
    tabela.querySelectorAll("tbody tr, tr").forEach((tr) => {
      if (tr.closest("thead")) return;
      const cb = tr.querySelector("input[name=idsConclusoesSelecionadas]") || tr.querySelector("input[name=idConclusoes]") || tr.querySelector("input[type=checkbox][value]:not([name=checker]):not([name=todos])");
      const cels = [...tr.children].map(t);
      const numero = (tr.textContent.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [""])[0];
      if (!cb || !numero) return;
      const data = (cels.join(" | ").match(/(?<!\d)\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/) || [""])[0];
      const partes = [...tr.querySelectorAll('a[href*="parteProcesso.do"]')].map(t).filter(Boolean);
      const tipo = (cels.find((c) => /^(DECIS[ÃA]O|DESPACHO|SENTEN[ÇC]A)/i.test(c)) || "").trim();
      const analisar = [...tr.querySelectorAll("a")].find((x) => /^analisar$/i.test(t(x)));
      processos.push({ idConclusao: cb.value, numero, urgente: /URGENTE/.test(tr.textContent), prioridade: !!tr.querySelector("em.attention"), reuPreso: !!tr.querySelector('[class*="REU_PRESO"]'), entrada: data, tipo, partes: [...new Set(partes)], agrupador: (cels[cels.length - 1] || "").trim(), responsavel: cels.find((c, i) => i > 4 && /\(Magistrado|^[A-ZÁÉÍÓÚ][a-záéíóúãõç]+ [A-Za-zÁÉÍÓÚáéíóúãõç ]+$/.test(c) && !/DECIS|DESPACHO|SENTEN|^Sim$|^N[ãa]o$/i.test(c)) || "", temAnalisar: !!analisar, analisarHref: analisar ? analisar.href : "", linha: cels.filter(Boolean).join(" | ").slice(0, 400) });
    });
    return processos;
  };
  const primeira = extrair(document);
  if (!primeira) return { ok: false, erro: "Não achei a lista de Conclusões neste quadro." };
  const contador = (t(document.querySelector("#navigator .navLeft")) || (document.body.textContent.match(/\d+\s+registro\(s\)\s+encontrado\(s\)[^.]{0,60}/) || [""])[0]).replace(/\s+/g, " ").trim();
  const total = +((contador.match(/(\d+)\s+registro/) || [])[1] || 0);
  let processos = primeira, aviso = "";
  const form = document.querySelector("#navigator")?.closest("form") || document.querySelector("table.resultTable")?.closest("form");
  const campoPag = form && [...form.elements].find((e) => /PageNumber$/.test(e.name || "")), campoTam = form && [...form.elements].find((e) => /PageSize$/.test(e.name || ""));
  if (total > primeira.length && campoPag && campoTam) {
    // pede 100 por página; se o SEEU ignorar o tamanho e devolver 20, continua página a página até juntar o total (ou parar de vir linha nova)
    const vistos = new Set(), todos = [], chave = (p) => p.idConclusao + "|" + p.numero;
    try {
      for (let n = 1; n <= 80 && vistos.size < total; n++) {
        const corpo = new URLSearchParams(new FormData(form)); corpo.set(campoPag.name, String(n)); corpo.set(campoTam.name, "100");
        const resp = await fetch(form.action || location.href, { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=ISO-8859-1" }, body: corpo.toString() });
        const html = new TextDecoder("iso-8859-1").decode(await resp.arrayBuffer());
        const lista = extrair(new DOMParser().parseFromString(html, "text/html")); if (!lista) throw new Error("página " + n + " sem lista (HTTP " + resp.status + ")");
        let novas = 0; for (const p of lista) { if (!vistos.has(chave(p))) { vistos.add(chave(p)); todos.push(p); novas++; } }
        if (!novas) break;
      }
      if (todos.length >= primeira.length) processos = todos;
      if (processos.length < total) aviso = `Li ${processos.length} de ${total} processos; o SEEU parou de devolver páginas.`;
    } catch (e) { aviso = "Não consegui ler todas as páginas (" + e.message + "); mostrando só a página da tela."; processos = primeira; }
  }
  return { ok: true, processos, total, contador, aviso, url: location.href.replace(/(_tj=)[0-9a-zA-Z]+/g, "$1…") };
}

// Do botão "Analisar" da linha até a tela de exportação do processo: lê as páginas em segundo plano (só leitura) e devolve o endereço da exportação.
async function descobrirExportarSeeu(analisarHref) {
  const passos = [], ler = async (u) => { const r = await fetch(u, { credentials: "include" }); const h = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer()); passos.push(`${new URL(u).pathname} → HTTP ${r.status}, ${h.length} caracteres`); return h; };
  const desescapa = (s) => s.replace(/&amp;/g, "&");
  // O botão que interessa é "Processo" (#exportarProcessoButton); o "Capa" (#exportarCapaButton) aponta para outra exportação (só a capa, 1 página) e NÃO serve.
  const achaExportar = (h) => {
    const doc = new DOMParser().parseFromString(h, "text/html");
    const alvo = (el) => { const src = el ? (el.getAttribute("onclick") || el.getAttribute("href") || "") : ""; const m = src.match(/['"]([^'"]*exportar\.do\?_tj=[^'"]*)['"]/); return m ? new URL(desescapa(m[1]), location.origin).href : ""; };
    let u = alvo(doc.querySelector("#exportarProcessoButton"));
    if (!u) u = alvo([...doc.querySelectorAll("input[type=button],button,a")].find((x) => /^\s*processo\s*$/i.test(x.value || x.textContent || "") && /exportar\.do/.test(x.getAttribute("onclick") || x.getAttribute("href") || "")));
    return u;
  };
  const links = (h) => [...new Set([...h.matchAll(/(?:href|src|action)=["']([^"']+\.do[^"']*)["']/gi)].map((m) => m[1].split("?")[0]))].slice(0, 30);
  try {
    let h = await ler(analisarHref), ex = achaExportar(h);
    if (ex) return { ok: true, exportarUrl: ex, passos };
    const p = h.match(/["']((?:https?:\/\/[^'"\/]+)?\/seeu\/(?:processo\/)?visualizacaoProcesso\.do\?[^'"]*_tj=[^'"]+)["']/);
    if (!p) return { ok: false, erro: "Na tela Analisar não achei o link do processo nem o da exportação.", passos, paginasVistas: links(h) };
    h = await ler(new URL(desescapa(p[1]), location.origin).href); ex = achaExportar(h);
    if (ex) return { ok: true, exportarUrl: ex, passos };
    return { ok: false, erro: "Na tela do processo não achei o botão Exportar ▾ → Processo.", passos, paginasVistas: links(h) };
  } catch (e) { return { ok: false, erro: "Falha ao ler o SEEU: " + e.message, passos }; }
}
// Roda na PÁGINA (world MAIN) da tela de exportação aberta numa aba: aperta o botão "Exportar" do próprio SEEU, mas intercepta o envio (formulário ou janela nova) e devolve o pedido, em vez de deixar abrir a janela em branco.
function capturarExportarSeeu() {
  return new Promise((resolve) => {
    let cap = null;
    const guarda = (f, via) => { if (cap) return; const a = f.getAttribute("action") || location.href; cap = { via, url: new URL(a, location.href).href, metodo: (f.getAttribute("method") || "get").toLowerCase(), campos: [...new FormData(f).entries()].filter(([, v]) => typeof v === "string") }; };
    HTMLFormElement.prototype.submit = function () { guarda(this, "submit()"); };
    HTMLFormElement.prototype.requestSubmit = function () { guarda(this, "requestSubmit()"); };
    document.addEventListener("submit", (e) => { guarda(e.target, "evento submit"); e.preventDefault(); e.stopImmediatePropagation(); }, true);
    window.open = function (u) { if (!cap && u) cap = { via: "window.open", url: new URL(u, location.href).href, metodo: "get", campos: [] }; return { document: { write() {}, close() {} }, close() {}, focus() {}, location: {} }; };
    window.alert = () => {}; window.confirm = () => true;      // só nesta aba de exportação (aberta pela extensão e fechada logo depois)
    const btn = [...document.querySelectorAll("input[type=button],input[type=submit],button,a")].find((x) => /^\s*exportar\s*$/i.test(x.value || x.textContent || ""));
    if (!btn) { resolve({ erro: "Não achei o botão Exportar nesta tela.", botoes: [...document.querySelectorAll("input[type=button],input[type=submit],button")].map((x) => (x.value || x.textContent || "").trim()).filter(Boolean).slice(0, 12) }); return; }
    btn.click();
    setTimeout(() => resolve(cap || { erro: "O botão Exportar não enviou nenhum pedido." }), 3000);
  });
}
if (typeof globalThis !== "undefined") { globalThis.lerAreasSeeu = lerAreasSeeu; globalThis.lerAtuacaoSeeu = lerAtuacaoSeeu; globalThis.descobrirExportarSeeu = descobrirExportarSeeu; globalThis.capturarExportarSeeu = capturarExportarSeeu; globalThis.lerMenuConclusoesSeeu = lerMenuConclusoesSeeu; globalThis.abrirMenuConclusoesSeeu = abrirMenuConclusoesSeeu; globalThis.lerConclusoesSeeu = lerConclusoesSeeu; }
