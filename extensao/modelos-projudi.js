// Lê os modelos de decisão/despacho/sentença do Projudi (Cadastros -> Modelo) conduzindo a própria tela, como o usuário faria:
//   abre "Modelo", clica em Localizar, Consultar, percorre todas as páginas da lista e, para cada modelo, carrega o texto no editor e lê.
// Roda só na moldura do Projudi (a lista de pesquisa e o quadro principal "Principal" ficam nela).
(() => {
  if (window.top !== window || window.__projudiModelos) return;
  window.__projudiModelos = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const sem = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const quadro = () => document.getElementById("Principal");
  async function esperar(fn, ms, passo = 200) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(passo); } }
  let cancelar = false;

  function navegar(url) {
    return new Promise((ok) => {
      const f = quadro(), fim = setTimeout(() => ok(false), 30000);
      f.addEventListener("load", () => { clearTimeout(fim); setTimeout(() => ok(true), 500); }, { once: true });
      f.contentWindow.location.href = url;
    });
  }
  // A tela Cadastros → Modelo ("Busca de Modelo") fica DENTRO do quadro "Principal": campo "Modelo", botão Consultar, tabela #CorpoTabela
  // (cada linha traz data_id1 = Id, data_desc1 = nome e data_descs = "desc2;Serventia;desc3;Tipo;"), paginação #Paginacao com caixa "Ir".
  const D = () => quadro().contentDocument;
  const linhasQuadro = () => [...D().querySelectorAll("#CorpoTabela tr[data_id1]")];
  const primeiroId = () => linhasQuadro()[0]?.getAttribute("data_id1") || "";
  // "Modelo" abre primeiro o CADASTRO de modelo (barra de ícones); a lista "Busca de Modelo" aparece ao clicar na lupa "Localizar" da barra.
  async function abrirLista() {
    if (D().getElementById("formLocalizarBotao")) return;
    const cand = [...D().querySelectorAll("[title*=ocalizar i],[alt*=ocalizar i],[name*=ocalizar i],[id*=ocalizar i]")]
      .filter((e) => !e.closest("#CorpoTabela") && !/^formLocalizarBotao$/.test(e.id));
    if (!cand.length) throw new Error("não achei a lupa Localizar na tela Modelo");
    const alvo = cand.find((e) => /^(button|a|img|input|i|span)$/i.test(e.tagName) && !e.closest("td,label,.campo")) || cand[0];
    const aberta = () => D().getElementById("formLocalizarBotao");
    // tenta o próprio ícone, depois o botão/link que o envolve e o ícone dentro dele
    for (const e of [alvo.querySelector("img"), alvo, alvo.closest("button,a")]) {
      if (!e || aberta()) continue;
      e.click();
      if (await esperar(aberta, 3000)) break;
    }
    if (!(await esperar(aberta, 10000))) throw new Error("cliquei em Localizar, mas a lista de modelos não abriu");
    await dorme(300);
  }
  async function consultar(filtro) {
    await abrirLista();
    const d = D(), campo = d.getElementById("nomeBusca1"), botao = d.getElementById("formLocalizarBotao");
    if (!botao) throw new Error("não achei o botão Consultar da tela Modelo");
    if (campo) { campo.value = filtro || ""; campo.dispatchEvent(new Event("input", { bubbles: true })); }
    const antes = linhasQuadro().map((r) => r.getAttribute("data_id1")).join("|");
    botao.click();
    if (!(await esperar(() => { const a = linhasQuadro().map((r) => r.getAttribute("data_id1")).join("|"); return a && (a !== antes || !antes); }, 20000))) {
      if (!linhasQuadro().length) throw new Error(filtro ? `a pesquisa por “${filtro}” não devolveu modelos` : "a lista de modelos veio vazia");
    }
    await dorme(300);
  }
  function lerLinhas() {
    return linhasQuadro().map((tr) => {
      const d = (tr.getAttribute("data_descs") || "").split(";"), pega = (k) => norm(d[d.indexOf(k) + 1] || "");
      return { id: tr.getAttribute("data_id1"), nome: norm(tr.getAttribute("data_desc1")), serventia: pega("desc2"), tipo: pega("desc3"), tr };
    }).filter((l) => l.id);
  }
  const totalInformado = () => +((norm(D().getElementById("Paginacao")?.textContent).match(/Total de:?\s*(\d+)/i) || [])[1] || 0);
  async function irParaPagina(n) {
    const d = D(), caixa = d.getElementById("CaixaTextoPosicionar"), ir = d.querySelector("#Paginacao .BotaoIr, .BotaoIr");
    if (!caixa || !ir) return false;
    const antes = primeiroId();
    caixa.value = String(n); ir.click();
    await esperar(() => primeiroId() !== antes, 15000);
    await dorme(250);
    return primeiroId() !== antes;
  }

  // ---------- leitura do texto do modelo no editor do quadro ----------
  function pedirAoEditor(acao) {
    const doc = quadro().contentDocument;
    doc.documentElement.removeAttribute("data-projudi-ponte");
    doc.dispatchEvent(new CustomEvent("projudi-ext-ponte", { detail: { acao } }));
    try { return JSON.parse(doc.documentElement.getAttribute("data-projudi-ponte") || "null"); } catch (e) { return null; }
  }
  function htmlParaTexto(html) {
    const d = new DOMParser().parseFromString(html || "", "text/html");
    d.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote").forEach((e) => e.append("\n"));
    return d.body.textContent.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };

  async function carregarTexto(m, anterior) {
    if (!(await navegar("Modelo"))) throw new Error("a tela Modelo não carregou");
    await consultar(m.nome);
    const linha = lerLinhas().find((l) => l.id === m.id);
    if (!linha) throw new Error(`modelo ${m.id} não apareceu na pesquisa`);
    const editar = linha.tr.querySelector("button[name=formLocalizarimgEditar]") || linha.tr.querySelector("td button, td a, td img");
    editar.click();
    await esperar(() => !D().getElementById("formLocalizarBotao"), 15000);           // o quadro saiu da lista e abriu o cadastro do modelo
    let html = "";
    const lido = () => { const r = pedirAoEditor("ler"); html = r && r.ok ? r.html : ""; return html && html !== anterior; };
    if (!(await esperar(lido, 12000, 400))) { if (!(html || (pedirAoEditor("ler") || {}).html)) throw new Error(`o texto do modelo ${m.id} não carregou no editor`); html = html || pedirAoEditor("ler").html; }      // texto igual ao do anterior: aceita
    return html;
  }

  function relatar(msg) { try { chrome.runtime.sendMessage({ acao: "modelos-progresso", ...msg }); } catch (e) { /* página fechada */ } }

  const chaveServ = (x) => sem(x).replace(/\s*-\s*go\s*$/, "").replace(/\s+/g, " ").trim();
  async function capturar() {
    cancelar = false;
    relatar({ txt: "Abrindo Cadastros → Modelo…" });
    if (!(await navegar("Modelo"))) throw new Error("a tela Modelo não carregou");
    await consultar("");
    const lista = []; const vistos = new Set();
    const total = totalInformado(), porPagina = linhasQuadro().length || 15, paginas = total ? Math.ceil(total / porPagina) : 200;
    for (let pagina = 1; pagina <= paginas; pagina++) {
      if (cancelar) throw new Error("cancelado");
      if (pagina > 1 && !(await irParaPagina(pagina))) break;
      const novas = lerLinhas().map(({ tr, ...x }) => x).filter((x) => !vistos.has(x.id));
      novas.forEach((x) => vistos.add(x.id)); lista.push(...novas);
      relatar({ txt: `Lendo a lista de modelos (página ${pagina} de ${total ? paginas : "?"}; ${lista.length} até agora)…` });
      if (!novas.length) break;
    }
    // só as serventias em que o usuário trabalha (se nenhuma estiver marcada no painel, todas as que têm serventia)
    const { automacao = {} } = await chrome.storage.sync.get("automacao");
    const minhas = Object.entries(automacao).filter(([, a]) => a.ativa).map(([n]) => chaveServ(n));
    const unica = lista.filter((x) => x.serventia && (!minhas.length || minhas.some((k) => chaveServ(x.serventia) === k || chaveServ(x.serventia).includes(k) || k.includes(chaveServ(x.serventia)))));
    const aviso = (total && lista.length !== total ? `A lista informa ${total} modelos, mas li ${lista.length}. ` : "") + `${unica.length} modelo(s) são das suas serventias${minhas.length ? "" : " (nenhuma marcada no painel: li todas)"}.`;
    const modelos = []; let anterior = "";
    for (let i = 0; i < unica.length; i++) {
      if (cancelar) throw new Error("cancelado");
      const m = unica[i];
      relatar({ txt: `Lendo o texto do modelo ${i + 1} de ${unica.length}: ${m.nome}`, feitos: i, total: unica.length });
      let html;
      try { html = await carregarTexto(m, anterior); anterior = html; } catch (e) { relatar({ txt: "⚠ " + e.message }); modelos.push({ ...m, texto: "", erro: e.message }); continue; }
      const texto = htmlParaTexto(html);
      modelos.push({ ...m, texto, hash: hash(texto) });
    }
    // agrupa por serventia e compara com a captura anterior
    const { modelos: antes } = await chrome.storage.local.get("modelos");
    const servs = {}; const diff = { novos: [], alterados: [], excluidos: [] };
    for (const m of modelos) (servs[m.serventia || "(sem serventia)"] ||= { modelos: [] }).modelos.push(m);
    const velhos = new Map(Object.values(antes?.serventias || {}).flatMap((s) => s.modelos).map((m) => [m.id, m]));
    for (const m of modelos) { const v = velhos.get(m.id); if (!v) diff.novos.push(m); else if (v.hash !== m.hash && !m.erro) diff.alterados.push(m); velhos.delete(m.id); }
    diff.excluidos = [...velhos.values()];
    const novo = { atualizadoEm: Date.now(), serventias: servs, diff: { novos: diff.novos.map((m) => m.id), alterados: diff.alterados.map((m) => m.id), excluidos: diff.excluidos.map((m) => ({ id: m.id, nome: m.nome, serventia: m.serventia })) } };
    await chrome.storage.local.set({ modelos: novo });
    return { ok: true, total: modelos.length, falhas: modelos.filter((m) => m.erro).length, aviso, diff: novo.diff };
  }

  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m?.acao === "modelos-ping") { responder({ ok: true }); return false; }
    if (m?.acao === "modelos-cancelar") { cancelar = true; responder({ ok: true }); return false; }
    if (m?.acao !== "modelos-capturar") return false;
    capturar().then(responder, (e) => responder({ ok: false, erro: String(e.message || e) }));
    return true;
  });
})();
