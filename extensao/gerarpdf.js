// Janela "Gerar PDF" do Projudi (projudi-pdf.tjgo.jus.br): marca os arquivos pedidos (ou todos) e aperta "Gerar".
// O PDF gerado é o do próprio Projudi (cabeçalho por movimentação/arquivo, já pesquisável); o download é capturado pela extensão.
(() => {
  if (window.__projudiGerarPdf) return;
  const sem = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const caixas = () => [...document.querySelectorAll("input[type=checkbox]")].filter((c) => !c.disabled);
  const textoDe = (c) => {
    const l = (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) || c.closest("label");
    if (l) return l.textContent;
    let t = "", n = c.nextSibling;                      // texto solto logo depois da caixa
    while (n && !(n.nodeType === 1 && /^(INPUT|BR|DIV|LI|TR|UL)$/.test(n.tagName)) && t.length < 400) { t += n.textContent; n = n.nextSibling; }
    return t.trim() || (c.closest("td,li,div") ? c.closest("td,li,div").textContent.slice(0, 300) : "");
  };
  const ehGerar = (el) => /gerar/i.test(el.value || el.textContent || "") && !/todos/i.test(el.value || el.textContent || "");
  const botaoGerar = () => [...document.querySelectorAll("input[type=submit],input[type=button],button,a.botao,a[onclick]")].find(ehGerar);
  const pronta = () => caixas().length >= 2 && !!botaoGerar();
  const marcar = (c, v) => { if (c.checked !== v) c.click(); };

  function aplicar(pedido) {
    const todas = caixas();
    const cxTodos = todas.find((c) => /todos\s+os\s+arquivos/.test(sem(textoDe(c))));
    if (pedido.todos) { if (cxTodos) marcar(cxTodos, true); else todas.forEach((c) => marcar(c, true)); return { marcadas: todas.filter((c) => c.checked).length }; }
    todas.forEach((c) => marcar(c, false));
    if (cxTodos) marcar(cxTodos, false);
    const chaves = new Set(pedido.arquivos.map((a) => a.mov + ":" + a.idx)), nomes = new Set(pedido.arquivos.map((a) => a.mov + ":" + sem(a.nome)));
    let mov = null, idx = 0, n = 0;
    for (const c of todas) {
      if (c === cxTodos) continue;
      const t = textoDe(c).replace(/\s+/g, " ").trim(), m = t.match(/^(\d{1,5})\s*[-–]\s*\S/);
      if (m) { mov = +m[1]; idx = 0; continue; }           // caixa da movimentação: os arquivos abaixo é que contam
      if (mov === null) continue;
      const nome = sem(t).replace(/\s*\(?[\d.,]+\s*(kb|mb|bytes?)\)?\s*$/, "").replace(/\s+/g, "");
      const certo = chaves.has(mov + ":" + idx) || [...nomes].some((k) => k.startsWith(mov + ":") && nome.includes(k.slice(String(mov).length + 1).replace(/\s+/g, "")));
      idx++;
      if (certo) { marcar(c, true); n++; }
    }
    return { marcadas: n };
  }

  async function executar(pedido) {
    const r = aplicar(pedido);
    if (!r.marcadas) return { erro: "não achei os arquivos pedidos na lista" };
    await new Promise((ok) => setTimeout(ok, 400));
    const b = botaoGerar();
    if (!b) return { erro: "botão Gerar não encontrado" };
    b.click();
    return { ok: true, marcadas: r.marcadas };
  }

  // ---------- botão na janela ----------
  let host = null;
  function widget() {
    if (host && host.isConnected) return;
    host = document.createElement("div"); host.setAttribute("data-projudi-ext", "gerarpdf");
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `<style>.w{position:fixed;left:6px;bottom:8px;z-index:2147483647;font:12px system-ui,sans-serif;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
      button{font:12px system-ui;padding:5px 9px;border:1px solid #1a56a0;background:#1a56a0;color:#fff;border-radius:5px;cursor:pointer}button.s{background:#fff;color:#1a56a0}
      .m{background:#fffbe6;border:1px solid #e0c36a;border-radius:4px;padding:3px 6px;color:#333;display:none}</style>
      <div class="w"><div class="m"></div><button data-a="todos">⬇ Gerar e baixar tudo (extensão)</button><button class="s" data-a="diag">Copiar diagnóstico</button></div>`;
    const msg = (t) => { const m = sh.querySelector(".m"); m.textContent = t; m.style.display = "block"; };
    window.__projudiMsg = msg;
    sh.querySelector('[data-a="todos"]').onclick = async () => { const r = await executar({ todos: true }); msg(r.erro ? "✖ " + r.erro : "Gerando o PDF do Projudi… ele será baixado sozinho."); };
    sh.querySelector('[data-a="diag"]').onclick = async () => {
      const c = document.documentElement.cloneNode(true);
      c.querySelectorAll("script,style,link,svg,[data-projudi-ext]").forEach((e) => e.remove());
      await navigator.clipboard.writeText(JSON.stringify({ url: location.href.replace(/([?&](chave|token|usu)=)[^&]*/g, "$1…"), html: c.outerHTML.replace(/\s+/g, " ").slice(0, 120000) }));
      msg("Diagnóstico copiado. Cole no chat.");
    };
    document.documentElement.appendChild(host);
  }

  async function ciclo() {
    if (!document.body || !pronta()) return;
    widget();
    const { gerarpdf_pedido: p } = await chrome.storage.local.get("gerarpdf_pedido");
    if (!p || Date.now() - p.ts > 10 * 60000 || window.__projudiAplicado) return;
    window.__projudiAplicado = true;
    await chrome.storage.local.remove("gerarpdf_pedido");
    const r = await executar(p);
    if (window.__projudiMsg) window.__projudiMsg(r.erro ? "✖ " + r.erro : `Gerando o PDF do Projudi com ${p.todos ? "todos os arquivos" : r.marcadas + " arquivo(s)"}… ele será baixado sozinho.`);
    document.documentElement.dataset.projudiGerar = r.erro ? "erro:" + r.erro : "ok:" + r.marcadas;
  }

  if (!/projudi-pdf|GerarPDF/i.test(location.href) && !/Todos os Arquivos/i.test(document.documentElement.textContent || "")) {
    // fora da janela de PDF: só continua se ela aparecer aqui (carregamento tardio)
    if (!/Todos os Arquivos/i.test(document.documentElement.textContent || "")) return;
  }
  window.__projudiGerarPdf = true;
  ciclo();
  setInterval(() => ciclo().catch(() => {}), 1000);
})();
