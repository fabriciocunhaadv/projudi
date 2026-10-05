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
  const modal = () => document.getElementById("busca_padrao");
  const modalAberto = () => { const m = modal(); return m && getComputedStyle(m).display !== "none"; };
  const linhasDaTabela = () => [...document.querySelectorAll("#CorpoTabela tr")].filter((tr) => tr.querySelector("td") && norm(tr.textContent));

  async function abrirPesquisa() {
    if (modalAberto()) return;
    const doc = quadro().contentDocument;
    const lupa = [...doc.querySelectorAll("[title]")].find((e) => /^Localizar\b/i.test(e.getAttribute("title") || ""));
    if (!lupa) throw new Error("não achei o botão Localizar na tela Cadastro de Modelo");
    lupa.click();
    if (!(await esperar(modalAberto, 10000))) throw new Error("a janela de pesquisa de modelos não abriu");
  }
  async function consultar(filtro) {
    const campo = document.getElementById("nomeBusca1");
    if (campo) { campo.value = filtro || ""; campo.dispatchEvent(new Event("input", { bubbles: true })); }
    const antes = linhasDaTabela().map((r) => r.textContent).join("|");
    document.getElementById("busca_padraoLocalizar").click();
    await esperar(() => { const a = linhasDaTabela().map((r) => r.textContent).join("|"); return a && (a !== antes || !antes); }, 20000);
    await dorme(300);
  }
  function lerLinhas() {
    const cab = [...document.querySelectorAll("#tabelaLocalizar thead th")].map((t) => sem(t.textContent));
    const col = (rx) => cab.findIndex((c) => rx.test(c));
    const iId = col(/^id$/), iServ = col(/serventia/), iTipo = col(/tipo/), iNome = col(/modelo|descri/);
    return linhasDaTabela().map((tr) => {
      const td = [...tr.querySelectorAll("td")].map((c) => norm(c.textContent));
      const g = (i, alt) => (i >= 0 ? td[i] : alt) || "";
      return { id: g(iId, td.find((x) => /^\d{3,}$/.test(x))), nome: g(iNome, td[2]), serventia: g(iServ, td[3]), tipo: g(iTipo, td[4]), tr };
    }).filter((l) => l.id);
  }
  const totalInformado = () => +((norm(document.getElementById("PaginacaoBuscaPadrao")?.textContent).match(/Total de:?\s*(\d+)/i) || [])[1] || 0);
  async function proximaPagina(atual) {
    const links = [...document.querySelectorAll("#PaginacaoBuscaPadrao a")];
    const alvo = links.find((a) => norm(a.textContent) === String(atual + 1)) || links.find((a) => /^(pr[oó]xima|>|»)$/i.test(norm(a.textContent)));
    if (!alvo) return false;
    const antes = linhasDaTabela()[0]?.textContent;
    alvo.click();
    await esperar(() => linhasDaTabela()[0]?.textContent !== antes, 15000);
    await dorme(300);
    return true;
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
    await abrirPesquisa();
    await consultar(m.nome);
    const linha = lerLinhas().find((l) => l.id === m.id);
    if (!linha) throw new Error(`modelo ${m.id} não apareceu na pesquisa`);
    const alvo = linha.tr.querySelector("td a, td img, td button, td input") || linha.tr.querySelector("td");
    alvo.click();
    await esperar(() => !modalAberto(), 10000);
    // o texto chega ao editor depois que o quadro recarrega o modelo
    let html = "";
    const ok = await esperar(() => { const r = pedirAoEditor("ler"); html = r && r.ok ? r.html : ""; return html && html !== anterior; }, 20000, 400);
    if (!ok) throw new Error(`o texto do modelo ${m.id} não carregou no editor`);
    return html;
  }

  function relatar(msg) { try { chrome.runtime.sendMessage({ acao: "modelos-progresso", ...msg }); } catch (e) { /* página fechada */ } }

  async function capturar() {
    cancelar = false;
    relatar({ txt: "Abrindo Cadastros → Modelo…" });
    if (!(await navegar("Modelo"))) throw new Error("a tela Modelo não carregou");
    await abrirPesquisa(); await consultar("");
    const lista = []; let pagina = 1;
    for (;;) {
      lista.push(...lerLinhas().map(({ tr, ...x }) => x));
      relatar({ txt: `Lendo a lista de modelos (página ${pagina}; ${lista.length} até agora)…` });
      if (!(await proximaPagina(pagina))) break;
      pagina++;
    }
    const unica = [...new Map(lista.map((x) => [x.id, x])).values()];
    const total = totalInformado();
    const aviso = total && unica.length !== total ? `A lista informa ${total} modelos, mas li ${unica.length}.` : "";
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
    if (modalAberto()) document.querySelector("#modalBusca-content-titulo .modal_close")?.click();
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
