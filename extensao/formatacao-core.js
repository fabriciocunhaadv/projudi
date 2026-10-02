// Formatação automática da minuta: limpa o que vem do Word/Google Docs/chat e aplica o padrão do assessor.
// Funciona em qualquer documento editável (inclusive o iframe do editor de texto do Projudi).
(function (g) {
  const FONTE = "'Times New Roman', Times, serif";
  const PADRAO = {
    auto: true,             // formatar sozinho ao colar
    detectarCitacao: true,  // reconhecer citações (recuo, blockquote, texto entre aspas)
    removerVazios: false,   // ao "Formatar minuta": apagar parágrafos vazios
    texto:   { fontFamily: FONTE, fontSize: "16px", textAlign: "justify", textIndent: "2.5cm", marginLeft: "0", marginTop: "", marginBottom: "", lineHeight: "" },
    citacao: { fontFamily: FONTE, fontSize: "14px", textAlign: "justify", textIndent: "0", marginLeft: "4cm", marginTop: "", marginBottom: "", lineHeight: "" },
    titulo:  { fontFamily: FONTE, fontSize: "16px", textIndent: "0", marginLeft: "0" }, // o alinhamento vem do original
  };
  const PROPS = { fontFamily: "font-family", fontSize: "font-size", textAlign: "text-align", textIndent: "text-indent",
    marginLeft: "margin-left", marginTop: "margin-top", marginBottom: "margin-bottom", lineHeight: "line-height" };
  const LIMPAR = ["font-family", "font-size", "text-align", "text-indent", "margin-left", "margin-right", "margin-top", "margin-bottom",
    "padding-left", "padding-right", "line-height", "color", "background", "background-color"];
  const LIMPAR_FILHOS = ["font-family", "font-size", "color", "background", "background-color", "line-height"];
  const SEL_BLOCO = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre";
  const BLOCO = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|TBODY|THEAD|TFOOT|TR|SECTION|ARTICLE|HEADER|FOOTER|CENTER|FIGURE)$/;
  const IGNORAR = /^(SCRIPT|STYLE|HEAD|META|LINK|TITLE|NOSCRIPT|IMG|SVG|CANVAS|IFRAME)$/;
  const LIMITE_RECUO_CM = 1.5;

  const mesclar = (u = {}) => ({
    ...PADRAO, ...u,
    texto: { ...PADRAO.texto, ...(u.texto || {}) },
    citacao: { ...PADRAO.citacao, ...(u.citacao || {}) },
    titulo: { ...PADRAO.titulo, ...(u.titulo || {}) },
  });

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textoDe = (html) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

  function paraCm(v) {
    const m = String(v || "").trim().match(/^(-?[\d.]+)\s*(px|pt|cm|mm|in|em|rem)?$/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    switch ((m[2] || "px").toLowerCase()) {
      case "cm": return n;
      case "mm": return n / 10;
      case "in": return n * 2.54;
      case "pt": return (n * 2.54) / 72;
      case "em": case "rem": return n * 0.42;
      default: return (n * 2.54) / 96;
    }
  }
  const recuoCm = (el) => el && el.style ? Math.max(paraCm(el.style.marginLeft), paraCm(el.style.paddingLeft)) : 0;

  function alinhamentoDe(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const a = (n.style && n.style.textAlign) || n.getAttribute("align") || (n.tagName === "CENTER" ? "center" : "");
      if (a) return a.toLowerCase();
    }
    return "";
  }

  const ASPAS_INI = /^\s*[“"«‘]/;
  const ASPAS_FIM = /[”"»’][\s.;,)\]]*(\([^)]*\))?[\s.]*$/;
  const pareceCitacao = (t) => t.length >= 180 && ASPAS_INI.test(t) && ASPAS_FIM.test(t);

  // ---------- HTML inline limpo (só negrito, itálico, sublinhado, tachado, sub/sobrescrito) ----------
  function inline(no) {
    if (no.nodeType === 3) return esc(no.nodeValue.replace(/ /g, " ").replace(/\s+/g, " "));
    if (no.nodeType !== 1 || IGNORAR.test(no.tagName)) return "";
    const tag = no.tagName.toLowerCase();
    if (tag === "br") return "<br>";
    let filhos = [...no.childNodes].map(inline).join("");
    if (/^t[dh]$/.test(tag)) return filhos + " ";
    let dentro = filhos;
    const st = no.style || {};
    const env = (t) => { if (dentro.trim()) dentro = `<${t}>${dentro}</${t}>`; };
    // font-weight explícito vale mais que a tag (o Google Docs embrulha tudo num <b style="font-weight:normal">)
    const negrito = st.fontWeight ? /^(bold|bolder|[6-9]00)$/.test(st.fontWeight) : tag === "b" || tag === "strong";
    const italico = tag === "i" || tag === "em" || /italic|oblique/.test(st.fontStyle || "");
    const sublinhado = tag === "u" || /underline/.test(st.textDecoration || st.textDecorationLine || "");
    const tachado = tag === "s" || tag === "strike" || tag === "del" || /line-through/.test(st.textDecoration || st.textDecorationLine || "");
    const sup = tag === "sup" || /super/.test(st.verticalAlign || "");
    const sub = tag === "sub" || /^sub/.test(st.verticalAlign || "");
    if (negrito) env("strong"); if (italico) env("em"); if (sublinhado) env("u"); if (tachado) env("s");
    if (sup) env("sup"); if (sub) env("sub");
    return dentro;
  }

  const limparBr = (h) => h.replace(/^(\s|<br>)+/i, "").replace(/(\s|<br>)+$/i, "").replace(/\s{2,}/g, " ").trim();

  function emitir(nos, ctx, el, out, opts) {
    const html = nos.map(inline).join("");
    for (let parte of html.split(/(?:<br>\s*){2,}/i)) {
      parte = limparBr(parte);
      let texto = textoDe(parte);
      if (!texto) continue;
      let tipo = ctx.citacao ? "citacao" : "texto";
      const align = alinhamentoDe(el);
      if (/^H[1-6]$/.test(el.tagName)) { tipo = "titulo"; if (!/<strong>/.test(parte)) parte = `<strong>${parte}</strong>`; }
      if (align === "center" || align === "right") tipo = "titulo";
      if (/^\s*(&gt;|>)\s+/.test(parte)) { tipo = "citacao"; parte = parte.replace(/^\s*(&gt;|>)\s+/, ""); texto = textoDe(parte); }
      else if (opts.detectarCitacao && tipo === "texto" && pareceCitacao(texto)) tipo = "citacao";
      if (ctx.marcador) parte = ctx.marcador + parte;
      out.push({ tipo, align: align === "center" || align === "right" ? align : "", html: parte });
    }
  }

  const temBlocoFilho = (el) => [...el.children].some((c) => BLOCO.test(c.tagName));
  const contemBloco = (el) => !!el.querySelector("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol,table");

  function percorrer(pai, ctx, out, opts) {
    let acc = [];
    const flush = () => { if (acc.length) { emitir(acc, ctx, pai, out, opts); acc = []; } };
    for (const n of pai.childNodes) {
      if (n.nodeType === 1 && BLOCO.test(n.tagName)) {
        flush();
        const c2 = { ...ctx };
        if (n.tagName === "BLOCKQUOTE" || (opts.detectarCitacao && recuoCm(n) >= LIMITE_RECUO_CM)) c2.citacao = true;
        if (n.tagName === "UL" || n.tagName === "OL") c2.lista = { ordenada: n.tagName === "OL", n: 0 };
        if (n.tagName === "LI" && ctx.lista) { ctx.lista.n++; c2.marcador = ctx.lista.ordenada ? `${ctx.lista.n}. ` : "– "; }
        if (temBlocoFilho(n)) percorrer(n, c2, out, opts);
        else emitir([...n.childNodes], c2, n, out, opts);
      } else if (n.nodeType === 1 && !IGNORAR.test(n.tagName) && contemBloco(n)) {
        flush();                    // <b>/<span>/<a> que embrulham parágrafos: desce para dentro
        percorrer(n, ctx, out, opts);
      } else if (n.nodeType === 3 || (n.nodeType === 1 && !IGNORAR.test(n.tagName))) acc.push(n);
    }
    flush();
  }

  function blocosDoHtml(html, opts) {
    const d = new DOMParser().parseFromString(html, "text/html");
    const out = [];
    percorrer(d.body, {}, out, opts);
    return out;
  }

  function blocosDoTexto(txt, opts) {
    return txt.replace(/\r/g, "").split(/\n+/).map((l) => l.replace(/ /g, " ").trim()).filter(Boolean).map((l) => {
      let tipo = "texto", h = esc(l);
      if (/^>\s+/.test(l)) { tipo = "citacao"; h = esc(l.replace(/^>\s+/, "")); }
      else if (opts.detectarCitacao && pareceCitacao(l)) tipo = "citacao";
      return { tipo, align: "", html: h };
    });
  }

  const blocosDoClipboard = (html, txt, cfg) =>
    html && /<(p|div|br|li|h\d|span|b|i|table|blockquote)[\s>]/i.test(html) ? blocosDoHtml(html, cfg) : blocosDoTexto(txt || textoDe(html || ""), cfg);

  function cssDe(per, extra = "") {
    return Object.entries(PROPS).filter(([k]) => per[k]).map(([k, css]) => `${css}:${per[k]}`).join(";") + (extra ? ";" + extra : "");
  }

  function montarHtml(blocos, cfg) {
    return blocos.map((b) => `<p style="${cssDe(cfg[b.tipo], b.tipo === "titulo" ? `text-align:${b.align || "left"}` : "")}">${b.html}</p>`).join("");
  }

  // ---------- reformatar o que já está no editor ----------
  function limparEstilo(el) {
    LIMPAR.forEach((p) => el.style.removeProperty(p));
    ["class", "align"].forEach((a) => el.removeAttribute(a));
  }

  function limparFilhos(el) {
    [...el.querySelectorAll("*")].forEach((f) => {
      if (f.tagName === "FONT") { f.replaceWith(...f.childNodes); return; }
      if (f.style) LIMPAR_FILHOS.forEach((p) => f.style.removeProperty(p));
      f.removeAttribute("class");
      if (f.tagName === "SPAN" && !f.getAttribute("style")) f.replaceWith(...f.childNodes);
    });
  }

  function agruparSoltos(box) {
    let run = [];
    const fecha = () => {
      if (!run.length) return;
      if (run.some((n) => n.textContent.trim() || n.nodeName === "IMG")) {
        const p = box.ownerDocument.createElement("p");
        run[0].before(p); run.forEach((n) => p.appendChild(n));
      }
      run = [];
    };
    [...box.childNodes].forEach((n) => {
      if (n.nodeType === 1 && BLOCO.test(n.tagName)) fecha();
      else if (n.nodeType === 3 || n.nodeType === 1) run.push(n);
    });
    fecha();
  }

  function formatarContainer(box, cfg) {
    agruparSoltos(box);
    const folhas = [...box.querySelectorAll(SEL_BLOCO)].filter((el) => !el.querySelector(SEL_BLOCO + ",table,ul,ol"));
    const decisao = new Map();
    for (const el of folhas) {
      const texto = el.textContent.replace(/ /g, " ").trim();
      let tipo = "texto";
      const align = alinhamentoDe(el);
      let anc = el, recuo = 0;
      for (; anc && anc !== box; anc = anc.parentElement) recuo = Math.max(recuo, recuoCm(anc));
      if (cfg.detectarCitacao && (el.closest("blockquote") || recuo >= LIMITE_RECUO_CM || pareceCitacao(texto))) tipo = "citacao";
      if (/^H[1-6]$/.test(el.tagName) || align === "center" || align === "right") tipo = "titulo";
      decisao.set(el, { tipo, align: align === "center" || align === "right" ? align : "" });
    }
    for (const el of folhas) {
      const { tipo, align } = decisao.get(el);
      if (!el.textContent.replace(/ /g, " ").trim() && !el.querySelector("img")) { if (cfg.removerVazios) el.remove(); continue; }
      limparEstilo(el);
      const per = cfg[tipo];
      const emLista = el.tagName === "LI";
      for (const [k, css] of Object.entries(PROPS)) {
        if (!per[k]) continue;
        if (emLista && /indent|margin/i.test(k)) continue;
        el.style.setProperty(css, per[k]);
      }
      if (tipo === "titulo") el.style.setProperty("text-align", align || "left");
      limparFilhos(el);
      if (/^H[1-6]$/.test(el.tagName) && !el.querySelector("strong,b")) el.innerHTML = `<strong>${el.innerHTML}</strong>`;
    }
    // contêineres: tirar recuos e blockquotes (o recuo passa a vir do padrão da citação)
    [...box.querySelectorAll("blockquote")].forEach((q) => {
      if (temBlocoFilho(q)) q.replaceWith(...q.childNodes);
      else { const p = box.ownerDocument.createElement("p"); p.setAttribute("style", q.getAttribute("style") || ""); p.append(...q.childNodes); q.replaceWith(p); }
    });
    [...box.querySelectorAll("div,ul,ol")].filter((el) => !folhas.includes(el)).forEach((el) => {
      ["margin-left", "padding-left", "border-left"].forEach((p) => el.style && el.style.removeProperty(p));
    });
    return box.innerHTML;
  }

  const formatarHtmlCorpo = (html, cfg, doc = document) => {
    const box = doc.createElement("div");
    box.innerHTML = html;
    return formatarContainer(box, cfg);
  };

  // ---------- aprender o padrão a partir do que o assessor formatou ----------
  function aprender(doc) {
    const sel = doc.getSelection && doc.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let el = sel.anchorNode;
    if (el && el.nodeType === 3) el = el.parentElement;
    if (!el || el.nodeType !== 1) return null;
    const bloco = el.closest(SEL_BLOCO) || el;
    const cs = doc.defaultView.getComputedStyle(bloco);
    const csInline = doc.defaultView.getComputedStyle(el);
    const inlineDe = (prop, inicio) => { for (let n = inicio; n && n !== doc.documentElement; n = n.parentElement) if (n.style && n.style[prop]) return n.style[prop]; return ""; };
    const fonte = (prop) => inlineDe(prop, el) || csInline[prop];
    const bl = (prop) => (bloco.style && bloco.style[prop]) || cs[prop];
    const normal = (v) => (v === "normal" ? "" : v);
    const recuo = recuoCm(bloco) ? (bloco.style.marginLeft || bloco.style.paddingLeft) : cs.marginLeft;
    return {
      fontFamily: fonte("fontFamily"),
      fontSize: fonte("fontSize"),
      textAlign: ({ start: "left", end: "right" }[bl("textAlign")]) || bl("textAlign"),
      textIndent: bl("textIndent"),
      marginLeft: recuo || "0",
      marginTop: bl("marginTop"),
      marginBottom: bl("marginBottom"),
      lineHeight: normal(bl("lineHeight")),
    };
  }

  const resumo = (p) => p ? `${(p.fontFamily || "").split(",")[0].replace(/['"]/g, "")} ${p.fontSize}, ${p.textAlign}, recuo 1ª linha ${p.textIndent}, margem esq. ${p.marginLeft}` : "";

  g.ProjudiFormatacao = { PADRAO, PROPS, mesclar, blocosDoClipboard, blocosDoHtml, blocosDoTexto, montarHtml, formatarHtmlCorpo, formatarContainer, aprender, resumo, paraCm, textoDe, cssDe };
})(globalThis);
