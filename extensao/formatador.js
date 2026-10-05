// Roda em todos os quadros das páginas do TJGO. Só age dentro de documentos EDITÁVEIS (o editor de texto da minuta).
(() => {
  const F = globalThis.ProjudiFormatacao;
  if (!F || window.__projudiFmtCarregado) return;
  window.__projudiFmtCarregado = true;

  let cfg = F.mesclar();
  const carregar = async () => {
    try { cfg = F.mesclar((await chrome.storage.sync.get("formatacao")).formatacao); } catch (e) { /* sem acesso */ }
  };
  carregar();
  chrome.storage.onChanged.addListener((c, area) => { if (area === "sync" && c.formatacao) carregar(); });

  const ehCampo = (el) => el && el.nodeType === 1 && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  const editavel = (alvo) =>
    document.designMode === "on" || !!(alvo && alvo.nodeType === 1 && !ehCampo(alvo) && alvo.isContentEditable);
  const corpoEditavel = () => document.body && (document.designMode === "on" || document.body.isContentEditable);

  // ---------- colar ----------
  function aoColar(ev) {
    if (!cfg.auto || !editavel(ev.target)) return;
    const dt = ev.clipboardData;
    if (!dt) return;
    const html = dt.getData("text/html"), txt = dt.getData("text/plain");
    if (!html && !txt) return; // imagem/arquivo: deixa o editor tratar
    const blocos = F.blocosDoClipboard(html, txt, cfg);
    if (!blocos.length) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const sel = document.getSelection();
    let no = sel && sel.anchorNode;
    if (no && no.nodeType === 3) no = no.parentElement;
    const atual = no && no.closest && no.closest("p,div,li,h1,h2,h3,h4,h5,h6,blockquote");
    const paragrafoVazio = !atual || !atual.textContent.replace(/ /g, " ").trim();
    if (blocos.length === 1 && !paragrafoVazio) document.execCommand("insertHTML", false, blocos[0].html); // trecho no meio de um parágrafo
    else document.execCommand("insertHTML", false, F.montarHtml(blocos, cfg));
    setTimeout(() => ponte({ acao: "sincronizar" }), 50);
  }

  // ---------- ponte com a API do editor (TinyMCE/CKEditor), que roda no mundo da página ----------
  function ponte(detalhe) {
    document.documentElement.removeAttribute("data-projudi-ponte");
    document.dispatchEvent(new CustomEvent("projudi-ext-ponte", { detail: detalhe }));   // síncrono: o editor-ponte.js responde no atributo
    try { return JSON.parse(document.documentElement.getAttribute("data-projudi-ponte") || "null"); } catch (e) { return null; }
  }
  // Fonte e tamanho também em <span> dentro do parágrafo: é o formato que os botões do próprio editor geram e que os filtros dele costumam aceitar.
  function comSpans(html) {
    const d = document.createElement("div"); d.innerHTML = html;
    d.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote").forEach((b) => {
      const fam = b.style.fontFamily, tam = b.style.fontSize;
      if (!fam && !tam || b.querySelector(":scope > span[data-pe]")) return;
      const sp = document.createElement("span"); sp.setAttribute("data-pe", "1");
      if (fam) sp.style.fontFamily = fam; if (tam) sp.style.fontSize = tam;
      while (b.firstChild) sp.appendChild(b.firstChild);
      b.appendChild(sp);
    });
    d.querySelectorAll("span[data-pe]").forEach((x) => x.removeAttribute("data-pe"));
    return d.innerHTML;
  }

  // ---------- formatar o trecho selecionado ----------
  // Só mexe no que está selecionado (estendido até o começo/fim dos parágrafos tocados). Sem seleção, formata o parágrafo do cursor.
  const BLOCO = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td";
  function formatarSelecao() {
    if (!corpoEditavel()) return null;
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!document.body.contains(r.commonAncestorContainer)) return null;
    const bloco = (no) => {
      let el = no.nodeType === 1 ? no : no.parentElement;
      const b = el && el.closest(BLOCO);
      return b && b !== document.body && document.body.contains(b) ? b : null;
    };
    const ini = bloco(r.startContainer), fim = bloco(r.endContainer);
    const alvo = document.createRange();
    if (ini && fim) { alvo.setStart(ini, 0); alvo.setEnd(fim, fim.childNodes.length); }
    else { alvo.setStart(r.startContainer, r.startOffset); alvo.setEnd(r.endContainer, r.endOffset); }
    if (alvo.collapsed || !alvo.toString().trim() && !alvo.cloneContents().querySelector("img,table")) return 0;
    const caixa = document.createElement("div");
    caixa.appendChild(alvo.cloneContents());
    const novo = F.formatarHtmlCorpo(caixa.innerHTML, cfg, document);
    sel.removeAllRanges(); sel.addRange(alvo);      // mantém o desfazer (Ctrl+Z) do editor
    const html = comSpans(novo);
    const p = ponte({ acao: "inserir", html });      // pela API do editor: passa pelos filtros e pela gravação dele
    if (!p || !p.ok) document.execCommand("insertHTML", false, html);
    ponte({ acao: "sincronizar" });                   // atualiza o campo que o Projudi lê ao visualizar/salvar
    return 1;
  }

  // ---------- lançar uma minuta pronta (esteira): o texto vira parágrafos e recebe a formatação cadastrada ----------
  function inserirTexto(texto) {
    if (!corpoEditavel()) return false;
    const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bruto = String(texto).split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => "<p>" + esc(l) + "</p>").join("");
    const html = comSpans(F.formatarHtmlCorpo(bruto, cfg, document));
    const sel = document.getSelection();
    if (!sel.rangeCount || !document.body.contains(sel.getRangeAt(0).commonAncestorContainer)) {     // sem cursor no editor: lança no fim do texto
      const fim = document.createRange(); fim.selectNodeContents(document.body); fim.collapse(false); sel.removeAllRanges(); sel.addRange(fim);
    }
    const p = ponte({ acao: "inserir", html });
    let ok = !!(p && p.ok);
    if (!ok) { window.focus(); ok = document.execCommand("insertHTML", false, html); }
    ponte({ acao: "sincronizar" });
    return ok;
  }
  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m?.acao !== "esteira-inserir-texto") return false;
    if (!corpoEditavel()) return false;       // só o quadro do editor responde
    responder({ ok: inserirTexto(m.texto) }); return false;
  });

  // ---------- aprender o padrão ----------
  function aprender(tipo) {
    const p = F.aprender(document);
    if (!p) return null;
    const nova = JSON.parse(JSON.stringify(cfg));
    nova[tipo] = { ...nova[tipo], ...p };
    chrome.storage.sync.set({ formatacao: nova });
    cfg = nova;
    return p;
  }

  // ---------- painelzinho no canto do editor ----------
  let widget = null;
  function mostrarMsg(txt) {
    if (!widget) return;
    const m = widget.shadowRoot.querySelector(".msg");
    m.textContent = txt; m.style.display = "block";
    clearTimeout(mostrarMsg.t);
    mostrarMsg.t = setTimeout(() => (m.style.display = "none"), 6000);
  }
  function acao(a) {
    if (a === "formatar") {
      const r = formatarSelecao();
      mostrarMsg(r === 1 ? "Trecho selecionado formatado. (Ctrl+Z desfaz)" : r === 0 ? "Selecione o trecho que quer formatar (ou clique no parágrafo)." : "Clique dentro do editor de texto.");
      return r === 1;
    }
    if (a === "diag") {
      const r = ponte({ acao: "diag" });
      const info = JSON.stringify({ ponte: r, frame: location.href.replace(/[?#].*/, ""), body: document.body.innerHTML.slice(0, 1500) }, null, 1);
      navigator.clipboard.writeText(info).then(() => mostrarMsg("Diagnóstico copiado. Cole no chat."), () => mostrarMsg("Não consegui copiar."));
      return true;
    }
    if (a === "aprender-texto" || a === "aprender-citacao") {
      const tipo = a === "aprender-texto" ? "texto" : "citacao";
      const p = aprender(tipo);
      mostrarMsg(p ? `Padrão do ${tipo === "texto" ? "texto" : "citação"} gravado: ${F.resumo(p)}` : "Selecione (ou clique em) um parágrafo já formatado por você, e clique de novo.");
      return !!p;
    }
    return false;
  }
  window.__projudiFmtAcao = acao; // chamado também pelo popup da extensão

  function criarWidget() {
    if (widget || !corpoEditavel() || window.innerWidth < 320 || window.innerHeight < 120) return;
    const host = document.createElement("div");
    host.setAttribute("data-projudi-ext", "1");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `<style>
      .w{position:fixed;bottom:6px;right:22px;z-index:2147483647;font:12px system-ui,sans-serif;display:flex;gap:4px;align-items:flex-end;flex-wrap:wrap;justify-content:flex-end;max-width:70%;pointer-events:none}
      button{pointer-events:auto;font:12px system-ui,sans-serif;padding:3px 8px;border:1px solid #1a56a0;background:#fff;color:#1a56a0;border-radius:4px;cursor:pointer;opacity:.78}
      button:hover{opacity:1;background:#1a56a0;color:#fff} .msg{pointer-events:auto;display:none;order:-1;flex-basis:100%;text-align:right;background:#fffbe6;border:1px solid #e0c36a;border-radius:4px;padding:3px 6px;color:#333}
    </style><div class="w"><button data-a="formatar" title="Aplica o seu padrão de formatação ao trecho selecionado (Alt+Shift+F)">Formatar seleção</button>
      <button data-a="aprender-texto" title="Clique num parágrafo que você já formatou do seu jeito e use este botão: a extensão grava esse padrão para o texto">Aprender texto</button>
      <button data-a="aprender-citacao" title="Idem, para uma citação">Aprender citação</button>
      <button data-a="diag" title="Copia informações do editor para diagnóstico">Diagnóstico</button><div class="msg"></div></div>`;
    const evitarFoco = (e) => e.preventDefault(); // não tira a seleção do editor
    sh.addEventListener("mousedown", evitarFoco, true);
    sh.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => acao(b.dataset.a)));
    document.documentElement.appendChild(host);
    widget = host;
  }

  function aoTeclar(ev) {
    if (ev.altKey && ev.shiftKey && (ev.key === "F" || ev.key === "f") && corpoEditavel()) { ev.preventDefault(); acao("formatar"); }
  }

  // O editor (TinyMCE) reescreve o documento do quadro (document.open/write), o que apaga listeners:
  // por isso conferimos de tempos em tempos e reanexamos.
  function garantir() {
    const raiz = document.documentElement;
    if (!raiz) return;
    window.addEventListener("paste", aoColar, true);
    document.addEventListener("paste", aoColar, true);
    document.addEventListener("keydown", aoTeclar, true);
    if (widget && !widget.isConnected) widget = null;
    if (!widget) criarWidget();
  }
  garantir();
  let n = 0;
  const t = setInterval(() => { garantir(); if (++n > 40) { clearInterval(t); setInterval(garantir, 3000); } }, 750);
})();
