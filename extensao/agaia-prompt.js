// Agaia (simplesefacil.tjgo.jus.br/agaia): troca o texto de um prompt do usuário pelo prompt do Studio.
// Três passos, comandados pela extensão (a página recarrega entre eles): achar na lista pelo TÍTULO → ler o texto atual (cópia de segurança) → gravar o novo texto e clicar em Salvar.
(() => {
  if (window.__projudiAgaiaPrompt) return;
  window.__projudiAgaiaPrompt = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const visivel = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 20 && r.height > 10 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const norm = (s) => String(s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

  // ---------- Lista: acha a linha cujo Título é igual ao procurado ----------
  function linhasDaTabela() {
    const tabs = [...document.querySelectorAll("table")];
    const out = [];
    for (const t of tabs) {
      const cab = [...t.querySelectorAll("thead th, tr:first-child th")].map((h) => sem(h.textContent));
      const iTit = cab.findIndex((x) => x.startsWith("titulo")), iUni = cab.findIndex((x) => x.startsWith("unidade")), iPriv = cab.findIndex((x) => x.startsWith("privacidade"));
      if (iTit < 0) continue;
      for (const tr of t.querySelectorAll("tbody tr")) {
        const tds = [...tr.children]; if (tds.length <= iTit) continue;
        const editar = [...tr.querySelectorAll("a,button")].find((a) => /editar/i.test((a.textContent || "") + " " + (a.title || "") + " " + (a.getAttribute("aria-label") || "")) || /\/prompts\/edit\//.test(a.getAttribute("href") || ""));
        out.push({ tr, titulo: (tds[iTit].textContent || "").replace(/\s+/g, " ").trim(), unidade: iUni >= 0 ? (tds[iUni]?.textContent || "").trim() : "", privacidade: iPriv >= 0 ? (tds[iPriv]?.textContent || "").trim() : "", editar });
      }
    }
    return out;
  }
  const proximaPagina = () => [...document.querySelectorAll("a,button")].find((a) => /^(pr[oó]xim[oa]|next|›|»|>)$/i.test((a.textContent || "").trim()) && !/disabled/.test(a.className + " " + (a.parentElement?.className || "")) && !a.disabled && visivel(a));

  async function achar(titulo) {
    const alvo = sem(titulo);
    let vistos = [];
    for (let pag = 0; pag < 30; pag++) {
      for (let i = 0; i < 20 && !linhasDaTabela().length; i++) await dorme(300);      // a lista pode carregar depois (DataTables)
      const linhas = linhasDaTabela();
      vistos = vistos.concat(linhas.map((l) => l.titulo));
      const achadas = linhas.filter((l) => sem(l.titulo) === alvo && l.editar);
      if (achadas.length === 1) {
        if (!achadas[0].editar.getAttribute("href")) return { ok: false, erro: "o botão Editar do Agaia não tem endereço (mudou o layout?)" };
        const e = achadas[0].editar, href = e.getAttribute("href") || "";
        const id = (href.match(/\/prompts\/edit\/([^/?#]+)/) || [])[1] || "";
        return { ok: true, href: href ? new URL(href, location.href).href : "", id, unidade: achadas[0].unidade, privacidade: achadas[0].privacidade };
      }
      if (achadas.length > 1) return { ok: false, erro: `há ${achadas.length} prompts com o título “${titulo}” no Agaia (${achadas.map((a) => a.unidade || "sem unidade").join("; ")}). Deixe só um com esse nome para eu saber qual trocar.` };
      const prox = proximaPagina(); if (!prox) break;
      const antes = linhas.map((l) => l.titulo).join("|");
      prox.click(); await dorme(900);
      if (linhasDaTabela().map((l) => l.titulo).join("|") === antes) break;      // o clique não mudou a lista: acabou
    }
    return { ok: false, naoEncontrado: true, erro: `não achei no Agaia um prompt com o título “${titulo}” (vi ${vistos.length} prompts na lista). O título no Agaia precisa ser igual ao do Studio.` };
  }

  // ---------- Editor da página de edição ----------
  function editores() {
    const lista = [];
    for (const el of document.querySelectorAll(".ql-editor, .ck-editor__editable, .note-editable, .fr-element, .trix-content, trix-editor, [contenteditable='true'], [contenteditable='']")) if (visivel(el)) lista.push({ tipo: "rico", el });
    for (const f of document.querySelectorAll("iframe")) { try { const b = f.contentDocument?.body; if (b && (b.isContentEditable || b.getAttribute("contenteditable") === "true") && visivel(f)) lista.push({ tipo: "rico", el: b, iframe: f }); } catch (e) { /* outro domínio */ } }
    for (const el of document.querySelectorAll("textarea")) if (visivel(el)) lista.push({ tipo: "textarea", el });
    const area = (x) => { const r = (x.iframe || x.el).getBoundingClientRect(); return r.width * r.height; };
    return lista.sort((a, b) => area(b) - area(a));
  }
  const textoDe = (ed) => ed.tipo === "textarea" ? ed.el.value : blocosParaTexto(ed.el);
  /** Texto do editor rico preservando as quebras de linha (cada parágrafo/linha vira uma linha). */
  function blocosParaTexto(raiz) {
    const linhas = [], atual = [];
    const fecha = () => { linhas.push(atual.join("")); atual.length = 0; };
    const BLOCO = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TR)$/;
    (function anda(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) atual.push(c.nodeValue);
        else if (c.nodeType === 1) {
          if (c.tagName === "BR") { fecha(); continue; }
          const b = BLOCO.test(c.tagName); if (b && atual.length) fecha();
          anda(c); if (b) fecha();
        }
      }
    })(raiz);
    if (atual.length) fecha();
    return linhas.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "");
  }
  const escapa = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textoParaHtml = (t) => String(t).split("\n").map((l) => "<p>" + (l.trim() ? escapa(l) : "<br>") + "</p>").join("");

  function campoTitulo() {
    return [...document.querySelectorAll("input[type=text],input:not([type])")].filter(visivel).find((i) => /t[ií]tulo|title/i.test((i.name || "") + " " + (i.id || "") + " " + (i.placeholder || "") + " " + (i.labels?.[0]?.textContent || "")));
  }
  function botaoSalvar() {
    return [...document.querySelectorAll("button,input[type=submit],input[type=button],a.btn")].filter(visivel).find((b) => /^\s*salvar\s*$/i.test(b.textContent || b.value || ""));
  }

  async function ler() {
    let eds = [];
    for (let i = 0; i < 40 && !(eds = editores()).length; i++) await dorme(300);
    if (!eds.length) return { ok: false, erro: "não achei o campo de texto do prompt na página de edição do Agaia" };
    const ed = eds[0];
    return { ok: true, texto: textoDe(ed), html: ed.tipo === "textarea" ? "" : ed.el.innerHTML, tipo: ed.tipo, titulo: campoTitulo()?.value || "", salvarOk: !!botaoSalvar() };
  }

  function disparar(el) { for (const t of ["input", "change", "keyup"]) el.dispatchEvent(new Event(t, { bubbles: true })); }
  /** Troca todo o conteúdo do editor. Retorna true se o texto lido depois bate com o pedido. */
  async function escrever(ed, { texto, html }) {
    if (ed.tipo === "textarea") {
      ed.el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(ed.el, texto); disparar(ed.el);
    } else {
      const doc = ed.el.ownerDocument, win = doc.defaultView;
      ed.el.focus();
      let ok = false;
      if (html == null) {
        try { doc.execCommand("selectAll", false, null); ok = doc.execCommand("insertText", false, ""); doc.execCommand("delete", false, null); } catch (e) { ok = false; }
        const linhas = String(texto).split("\n");
        for (let i = 0; i < linhas.length; i++) {
          try { if (linhas[i]) doc.execCommand("insertText", false, linhas[i]); if (i < linhas.length - 1) doc.execCommand("insertParagraph", false, null); } catch (e) { /* cai no plano B */ }
        }
        if (norm(blocosParaTexto(ed.el)) !== norm(texto)) { ed.el.innerHTML = textoParaHtml(texto); disparar(ed.el); }      // plano B: coloca o HTML direto
      } else { ed.el.innerHTML = html; disparar(ed.el); }
      try { win.getSelection().removeAllRanges(); } catch (e) { /* nada */ }
    }
    await dorme(300);
    return norm(textoDe(ed)) === norm(texto != null ? texto : blocosParaTexto(Object.assign(document.createElement("div"), { innerHTML: html })));
  }

  async function gravar({ texto, html }) {
    const eds = editores(); if (!eds.length) return { ok: false, erro: "não achei o campo de texto do prompt" };
    const ed = eds[0], salvar = botaoSalvar();
    if (!salvar) return { ok: false, erro: "não achei o botão Salvar" };
    const esperado = texto != null ? texto : blocosParaTexto(Object.assign(document.createElement("div"), { innerHTML: html }));
    const bateu = await escrever(ed, { texto, html });
    if (!bateu) return { ok: false, erro: "não consegui escrever o texto no editor do Agaia (o conteúdo lido depois não bateu)", visto: textoDe(ed).slice(0, 200) };
    setTimeout(() => salvar.click(), 250);      // a página recarrega ao salvar: responde antes
    return { ok: true, esperado };
  }

  chrome.runtime.onMessage.addListener((m, s, responder) => {
    if (m?.acao === "agaia-prompt-ping") { responder({ ok: true, lista: linhasDaTabela().length, editor: editores().length }); return false; }
    if (m?.acao === "agaia-prompt-achar") { achar(String(m.titulo || "")).then(responder, (e) => responder({ ok: false, erro: String(e?.message || e) })); return true; }
    if (m?.acao === "agaia-prompt-ler") { ler().then(responder, (e) => responder({ ok: false, erro: String(e?.message || e) })); return true; }
    if (m?.acao === "agaia-prompt-gravar") { gravar(m).then(responder, (e) => responder({ ok: false, erro: String(e?.message || e) })); return true; }
    return false;
  });
  window.__projudiAgaiaPromptTeste = { achar, ler, gravar, blocosParaTexto };      // usado só nos testes
})();
