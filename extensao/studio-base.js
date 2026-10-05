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

  async function enviar(nome, b64) {
    await abrirBase();
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
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

  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m?.acao === "studio-ping") { responder({ ok: true }); return false; }
    if (m?.acao !== "studio-enviar-base") return false;
    enviar(m.nome, m.b64).then(responder, (e) => responder({ ok: false, erro: String(e.message || e) }));
    return true;
  });
})();
