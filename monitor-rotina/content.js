// Roda só nos sites escolhidos. (1) conta cliques em botões/links com rótulo curto; (2) grava passos quando você manda gravar; (3) executa passos gravados.
(() => {
  if (window.__monRotina) return; window.__monRotina = true;
  const { normalizar, rotulo } = MonUtil;
  let cfg = {}, gravando = false;
  const ler = async () => { const d = await chrome.storage.local.get(["cfg", "gravacao"]); cfg = d.cfg || {}; gravando = !!(d.gravacao && d.gravacao.ativa); };
  ler(); chrome.storage.onChanged.addListener(ler);
  const vis = (e) => e.getClientRects().length > 0;
  const textoDe = (e) => rotulo(e.getAttribute("aria-label") || e.getAttribute("title") || (e.value && /^(button|submit)$/i.test(e.type) ? e.value : "") || e.textContent);
  const INTERATIVO = "button,a,input[type=button],input[type=submit],input[type=checkbox],input[type=radio],[role=button],[role=menuitem],[onclick]";

  function css(e) {
    const p = []; let n = e;
    for (let i = 0; n && n.nodeType === 1 && n !== document.body && i < 6; i++, n = n.parentElement) {
      const irm = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [n];
      p.unshift(n.tagName.toLowerCase() + (irm.length > 1 ? `:nth-of-type(${irm.indexOf(n) + 1})` : ""));
    }
    return p.join(">");
  }
  function alvoDe(e) {
    const tx = textoDe(e), mesmos = [...document.querySelectorAll(e.tagName)].filter((x) => vis(x) && textoDe(x) === tx);
    return { tag: e.tagName.toLowerCase(), id: e.id && !/\d{3,}/.test(e.id) ? e.id : "", name: e.name || "", tipo: e.type || "", texto: tx, indice: Math.max(0, mesmos.indexOf(e)), css: css(e) };
  }
  function achar(a) {
    if (a.id) { const e = document.getElementById(a.id); if (e && vis(e)) return e; }
    if (a.name) { const l = [...document.getElementsByName(a.name)].filter(vis); if (l.length === 1) return l[0]; }
    if (a.texto) { const c = [...document.querySelectorAll(a.tag)].filter((x) => vis(x) && textoDe(x) === a.texto); if (c.length) return c[a.indice] || c[0]; }
    if (a.css) { try { const e = document.querySelector(a.css); if (e && vis(e)) return e; } catch (x) { /* seletor inválido */ } }
    return null;
  }
  const pg = () => normalizar(location.href).pg;
  const setNativo = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value"); d.set.call(el, v); };

  document.addEventListener("click", (ev) => {
    const e = ev.target && ev.target.closest ? ev.target.closest(INTERATIVO) : null;
    if (!e || e.closest("[data-mon-ignorar]")) return;
    if (cfg.ativo) chrome.runtime.sendMessage({ acao: "clique", pg: pg(), rot: textoDe(e) || "(sem rótulo)" }).catch(() => {});
    if (gravando) chrome.runtime.sendMessage({ acao: "passo", passo: { tipo: "clicar", pg: pg(), alvo: alvoDe(e) } }).catch(() => {});
  }, true);
  document.addEventListener("change", (ev) => {
    const e = ev.target; if (!gravando || !e || !e.tagName) return;
    if (e.tagName === "SELECT") chrome.runtime.sendMessage({ acao: "passo", passo: { tipo: "selecionar", pg: pg(), alvo: alvoDe(e), valor: e.options[e.selectedIndex]?.text || "", fixo: true } }).catch(() => {});
    else if ((e.tagName === "INPUT" && !/^(checkbox|radio|button|submit|file|password)$/i.test(e.type)) || e.tagName === "TEXTAREA")
      chrome.runtime.sendMessage({ acao: "passo", passo: { tipo: "preencher", pg: pg(), alvo: alvoDe(e), variavel: true } }).catch(() => {});      // o valor digitado NÃO é gravado
  }, true);

  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m.acao !== "executar-passo") return false;
    const p = m.passo, e = achar(p.alvo);
    if (!e) return false;          // outro quadro pode ter o elemento
    e.scrollIntoView({ block: "center" });
    if (p.tipo === "clicar") e.click();
    else if (p.tipo === "preencher") { e.focus(); setNativo(e, p.valor ?? ""); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }
    else if (p.tipo === "selecionar") { const o = [...e.options].find((x) => x.text.trim() === String(p.valor).trim()); if (!o) return false; setNativo(e, o.value); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }
    responder({ ok: true }); return false;
  });
})();
