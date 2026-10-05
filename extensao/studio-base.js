// No app "Assessor Judicial" (AI Studio): coloca um PDF na "Base de Conhecimento do Gabinete", SUBSTITUINDO o documento de mesmo nome
// se já existir (apaga o antigo e envia o novo), para nunca duplicar.
(() => {
  if (window.__projudiStudioBase) return;
  window.__projudiStudioBase = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const visivel = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const texto = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();

  async function esperar(fn, ms, passo = 250) {
    const t0 = Date.now();
    for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(passo); }
  }
  const abaBase = () => document.getElementById("tour-teses-base-conhecimento-tab") || [...document.querySelectorAll("button")].find((b) => /^Base de Conhecimento$/i.test(texto(b)));
  const cartoes = () => [...document.querySelectorAll("p[title]")].filter((p) => p.closest("div.border") && p.parentElement.querySelector("div,span") && /\.pdf$/i.test(p.getAttribute("title") || ""));
  const cartaoDe = (nome) => cartoes().find((p) => p.getAttribute("title") === nome);
  const raizBase = () => { const s = [...document.querySelectorAll("span")].find((x) => /Base de Conhecimento do Gabinete/i.test(texto(x))); return s && (s.closest(".bg-slate-50") || s.closest("div.relative") || s.parentElement.parentElement); };

  async function abrirBase() {
    if (!abaBase() || !visivel(abaBase())) {      // abre o "Caderno de Teses & Modelos" pelo menu lateral ou pelo rodapé
      const abre = [...document.querySelectorAll("button")].find((b) => /^Teses\s*&\s*Modelos/i.test(b.getAttribute("title") || "") || /^Teses do Gabinete$/i.test(texto(b)));
      if (!abre) throw new Error("não achei o botão “Teses & Modelos” do app");
      abre.click();
    }
    const aba = await esperar(() => abaBase(), 15000);
    if (!aba) throw new Error("a janela do Caderno de Teses não abriu");
    if (!raizBase()) { aba.click(); }
    if (!(await esperar(() => raizBase(), 15000))) throw new Error("a aba “Base de Conhecimento” não abriu");
  }

  async function apagar(nome) {
    const p = cartaoDe(nome);
    if (!p) return false;
    const card = p.closest("div.border");
    const lixo = [...card.querySelectorAll("button")].find((b) => /excluir/i.test(b.getAttribute("title") || ""));
    if (!lixo) throw new Error("não achei o botão de excluir do documento antigo");
    document.documentElement.dataset.projudiAutoConfirm = "1";
    try {
      lixo.click();
      await dorme(500);
      // se o app abrir uma caixa própria de confirmação, confirma
      const conf = [...document.querySelectorAll("button")].find((b) => visivel(b) && !card.contains(b) && /^(excluir|confirmar|sim|remover|apagar)(\b|$)/i.test(texto(b)) && !/Excluir documento/i.test(b.title || ""));
      if (conf) conf.click();
      if (!(await esperar(() => !cartaoDe(nome), 30000))) throw new Error("o documento antigo não foi excluído");
    } finally { delete document.documentElement.dataset.projudiAutoConfirm; }
    return true;
  }

  const arquivos = new Map();      // arquivos recebidos da extensão (em partes), por id
  const partes = new Map();

  async function enviar(nome, arquivoId, b64) {
    await abrirBase();
    let bytes = arquivoId ? arquivos.get(arquivoId) : null;
    if (!bytes && b64) { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    if (!bytes) throw new Error("arquivo não recebido");
    const existia = await apagar(nome);
    const raiz = raizBase();
    const entradas = [...document.querySelectorAll("input[type=file]")];
    const input = entradas.find((i) => raiz && raiz.contains(i)) || entradas[entradas.length - 1];
    if (!input) throw new Error("não achei o campo de envio de PDF");
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], nome, { type: "application/pdf" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const p = await esperar(() => cartaoDe(nome), 5 * 60000, 500);       // o app lê todas as páginas: pode demorar
    if (!p) throw new Error("o app não mostrou o documento depois do envio");
    return { ok: true, substituiu: existia, quantos: cartoes().filter((x) => x.getAttribute("title") === nome).length, info: texto(p.parentElement) };
  }

  // ---------- análise de um processo ----------
  const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const botao = (rx, raiz = document) => [...raiz.querySelectorAll("button")].find((b) => rx.test(texto(b)) && visivel(b));
  function definirValor(el, valor) {   // campos controlados pelo React: usa o "setter" nativo e avisa a página
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    if (el.tagName !== "SELECT") el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function escolherPrompt(sel, prompt) {
    if (!prompt) return true;
    const op = [...sel.options].find((o) => normal(o.text) === normal(prompt)) || [...sel.options].find((o) => normal(o.text).includes(normal(prompt)));
    if (!op) return false;
    definirValor(sel, op.value);
    return true;
  }
  const seletorDePrompt = (raiz, prompt) => [...raiz.querySelectorAll("select")].find((s) => [...s.options].some((o) => /Área Judicial|Area Judicial/i.test(o.text)) && (!prompt || [...s.options].some((o) => normal(o.text).includes(normal(prompt)))));
  const erroNaTela = () => { const t = document.querySelector("[data-rht-toaster]"); const x = t ? texto(t) : ""; return /erro|falha|inv[aá]lid|limite|quota|n[aã]o foi poss/i.test(x) ? x : ""; };
  function fecharJanelas() {
    for (let i = 0; i < 3; i++) {
      const f = botao(/^Fechar$/i) || [...document.querySelectorAll("button[title=Fechar]")].find(visivel);
      if (!f) break; f.click();
    }
  }
  const painelResultado = () => [...document.querySelectorAll("h3")].find((h) => /Resultado\s*&\s*An[aá]lise/i.test(texto(h)));
  const resultadoPronto = () => {
    const h = painelResultado(); if (!h) return false;
    const barra = h.parentElement.parentElement.lastElementChild;     // botões Editar / Copiar / Gerar PDF: ficam bloqueados enquanto não há resultado
    return !(barra && /pointer-events-none/.test(barra.className)) && !/Aguardando Execu/i.test(texto(h.closest("div.border") || document.body));
  };
  const executando = () => { const b = document.getElementById("tour-execute-btn"); return !b || b.disabled || !/Gerar Minuta Judicial/i.test(texto(b)); };

  async function analisar({ arquivoId, nome, prompt, tipo }) {
    const bytes = arquivos.get(arquivoId);
    if (!bytes) throw new Error("arquivo não recebido");
    fecharJanelas();
    botao(/^Nova An[aá]lise$/i)?.click(); await dorme(600);
    const painel = await esperar(() => document.getElementById("tour-input-panel"), 20000);
    if (!painel) throw new Error("não achei a área de entrada dos autos do app");
    const sel = seletorDePrompt(document, prompt);
    if (prompt && (!sel || !escolherPrompt(sel, prompt))) throw new Error(`não achei o prompt “${prompt}” na lista do app`);
    await dorme(400);
    if (tipo && !/auto/i.test(tipo)) { const bt = botao(new RegExp("^" + tipo + "$", "i"), painel); if (bt) bt.click(); }
    const bpdf = [...painel.querySelectorAll("button")].find((b) => /^PDF$/.test(texto(b))); if (bpdf) bpdf.click();
    await dorme(300);
    const input = painel.querySelector("input[type=file]");
    if (!input) throw new Error("não achei o campo de envio do PDF do processo");
    const dt = new DataTransfer(); dt.items.add(new File([bytes], nome, { type: "application/pdf" }));
    input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    await esperar(() => texto(painel).includes(nome.slice(0, 18)), 20000);
    const exec = await esperar(() => { const b = document.getElementById("tour-execute-btn"); return b && !b.disabled ? b : null; }, 60000);
    if (!exec) throw new Error("o botão “Gerar Minuta Judicial” não ficou disponível");
    exec.click();
    if (!(await esperar(() => executando() || resultadoPronto() || erroNaTela(), 60000))) throw new Error("a análise não começou");
    const t0 = Date.now();
    for (;;) {
      const e = erroNaTela(); if (e) throw new Error("o app avisou: " + e);
      if (!executando() && resultadoPronto()) break;
      if (Date.now() - t0 > 20 * 60000) throw new Error("a análise demorou mais de 20 minutos");
      await dorme(1000);
    }
    return { ok: true, mensagem: "análise concluída" };
  }

  async function lupa({ arquivoId, nome, prompt, processo, minuta }) {
    if (!minuta || !minuta.trim()) return { ok: true, parcial: true, mensagem: "a Lupa precisa da minuta elaborada pelo assessor: PDF baixado, auditoria não iniciada" };
    const bytes = arquivos.get(arquivoId);
    fecharJanelas();
    (document.getElementById("btn-sidebar-minute-auditor") || botao(/Auditoria Ouro/i))?.click();
    const modal = await esperar(() => [...document.querySelectorAll("h2")].find((h) => /Lupa do Magistrado/i.test(texto(h)))?.closest("div.fixed"), 20000);
    if (!modal) throw new Error("a janela da Lupa do Magistrado não abriu");
    const sel = seletorDePrompt(modal, prompt);
    if (prompt && (!sel || !escolherPrompt(sel, prompt))) throw new Error(`não achei o prompt “${prompt}” na Lupa`);
    const num = [...modal.querySelectorAll("input[type=text]")].find((i) => /5012345/.test(i.placeholder || ""));
    if (num && processo) definirValor(num, processo);
    const ta = modal.querySelector("textarea"); definirValor(ta, minuta);
    const input = [...modal.querySelectorAll("input[type=file]")][0];
    const dt = new DataTransfer(); dt.items.add(new File([bytes], nome, { type: "application/pdf" }));
    input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    await dorme(1000);
    const b = await esperar(() => botao(/Auditar Minuta/i, modal), 10000);
    if (!b) throw new Error("não achei o botão de auditar");
    b.click();
    return { ok: true, mensagem: "auditoria iniciada na Lupa do Magistrado" };
  }

  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m?.acao === "studio-ping") { responder({ ok: true }); return false; }
    if (m?.acao === "studio-parte") {     // recebe um arquivo em pedaços
      const p = partes.get(m.id) || []; const bin = atob(m.b64), b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      p[m.i] = b; partes.set(m.id, p);
      if (p.filter(Boolean).length === m.n) {
        const total = p.reduce((s, x) => s + x.length, 0), tudo = new Uint8Array(total); let o = 0;
        p.forEach((x) => { tudo.set(x, o); o += x.length; });
        arquivos.set(m.id, tudo); partes.delete(m.id);
        if (arquivos.size > 3) arquivos.delete(arquivos.keys().next().value);
      }
      responder({ ok: true }); return false;
    }
    if (m?.acao === "studio-enviar-base") { enviar(m.nome, m.arquivoId, m.b64).then(responder, (e) => responder({ ok: false, erro: String(e.message || e) })); return true; }
    if (m?.acao === "studio-analisar") { (m.modo === "lupa" ? lupa(m) : analisar(m)).then(responder, (e) => responder({ ok: false, erro: String(e.message || e) })); return true; }
    return false;
  });
})();
