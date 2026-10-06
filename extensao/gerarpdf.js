// Janela "Gerar PDF" do Projudi (projudi-pdf.tjgo.jus.br): marca os arquivos pedidos (ou todos) e aperta "Gerar".
// O PDF gerado é o do próprio Projudi (cabeçalho por movimentação/arquivo, já pesquisável); o download é capturado pela extensão.
(() => {
  if (window.__projudiGerarPdf) return;
  const sem = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const caixas = () => [...document.querySelectorAll("input[type=checkbox]")].filter((c) => !c.disabled);
  // Estrutura real da janela (vista no diagnóstico): #todos; chk1 = movimentação (selecao="nivelN", texto "N<input><strong>título"),
  // chk2 = arquivo (pai = id da movimentação, <strong>nome</strong>); radio "Volume N" revela o botão "Gerar Processo em PDF".
  const nomeDe = (c) => (c.parentElement.querySelector("strong") || c.nextElementSibling || {}).textContent || "";
  const botaoGerar = () => document.querySelector('button[name=operacao][value=GerarPDF]') ||
    [...document.querySelectorAll("button,input[type=submit],input[type=button]")].find((e) => /gerar/i.test(e.value || e.textContent || "") && !/minuta|relat/i.test(e.value || e.textContent || ""));
  const pronta = () => caixas().length >= 2 && !!botaoGerar();
  const marcar = (c, v) => { if (c.checked !== v) c.click(); };
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  // Arquivos que o usuário já marcou à mão na janela (sem contar a caixa "Todos").
  const marcadasPeloUsuario = () => [...document.querySelectorAll("input[name=chk1]:checked,input[name=chk2]:checked")].filter((c) => !c.disabled).length;
  async function aplicar(pedido) {
    if (pedido.marcados) return { marcadas: marcadasPeloUsuario() };      // respeita a seleção feita pelo usuário
    const todas = caixas(), cxTodos = document.getElementById("todos");
    if (cxTodos) { marcar(cxTodos, false); if (cxTodos.checked) cxTodos.checked = false; }
    todas.filter((c) => c !== cxTodos).forEach((c) => marcar(c, false));
    if (pedido.todos) { if (cxTodos) marcar(cxTodos, true); else todas.forEach((c) => marcar(c, true)); return { marcadas: caixas().filter((c) => c.checked && c !== cxTodos).length }; }
    const nomes = new Set(pedido.arquivos.map((a) => a.mov + ":" + sem(a.nome)));
    let n = 0;
    for (const c of document.querySelectorAll("input[name=chk2]")) {
      const pai = c.getAttribute("pai"), li = document.querySelector(`input[name=chk1][value="${pai}"]`);
      const mov = li ? +((li.getAttribute("selecao") || "").replace(/\D/g, "")) : null;
      if (mov !== null && nomes.has(mov + ":" + sem(nomeDe(c)))) {
        marcar(c, true); n++;
        if (li && !li.checked) marcar(li, true);       // a movimentação junto, para o cabeçalho dela entrar no PDF
      }
    }
    return { marcadas: n };
  }

  const valoresMarcados = (nome) => new Set([...document.querySelectorAll(`input[name=${nome}]:checked`)].map((c) => c.value));
  async function executar(pedido) {
    // Seleção do usuário: guardada ANTES de qualquer coisa, para nenhum script da página (nem a escolha do volume) trocá-la por "tudo".
    const guardada = pedido.marcados ? { c1: valoresMarcados("chk1"), c2: valoresMarcados("chk2") } : null;
    const r = await aplicar(pedido);
    if (!r.marcadas) return { erro: "não achei os arquivos pedidos na lista" };
    const visivel = (e) => e && e.getBoundingClientRect().width > 0;
    const vol = document.querySelector("input[name=myradio]");      // escolher o volume revela o botão de gerar
    if (vol && !vol.checked && !(guardada && visivel(botaoGerar()))) vol.click();
    await esperar(400);
    if (guardada) {      // reaplica exatamente o que o usuário marcou, se algo mudou
      for (const c of document.querySelectorAll("input[name=chk1],input[name=chk2]")) { const quer = (c.name === "chk1" ? guardada.c1 : guardada.c2).has(c.value); if (c.checked !== quer) c.click(); }
      const todosCx = document.getElementById("todos"); if (todosCx && todosCx.checked) { todosCx.checked = false; }
    }
    const b = botaoGerar();
    if (!b) return { erro: "botão Gerar não encontrado" };
    // Intercepta: em vez de deixar o Projudi entregar o PDF (páginas em imagem), a extensão faz o mesmo pedido, recebe o PDF,
    // aplica o OCR e só então salva. Se a extensão não conseguir, o envio normal do Projudi continua valendo (b.click()).
    const form = b.form || document.getElementById("formListaArquivos");
    if (form && pedido.interceptar !== false) {
      const campos = new URLSearchParams();
      new FormData(form).forEach((v, k) => { if (typeof v === "string") campos.append(k, v); });
      const ids = (nome) => (guardada ? [...guardada[nome === "chk1" ? "c1" : "c2"]] : [...valoresMarcados(nome)]).join(";") + ";";
      for (const k of ["chk0", "chk1", "chk2"]) campos.delete(k);      // só valem os códigos abaixo
      campos.set("codigosArquivos", ids("chk2")); campos.set("codigosMovimentacoes", ids("chk1"));
      campos.set("PaginaAtual", "1"); campos.set("operacao", "GerarPDF");
      try {
        const resp = await chrome.runtime.sendMessage({ acao: "gerar-pdf-interceptar", url: form.action, corpo: campos.toString(), nome: pedido.processo || "", pasta: pedido.pasta || "", lote: pedido.lote || "", studio: pedido.studio || null });
        if (resp && resp.ok) { if (pedido.lote) setTimeout(() => window.close(), 800); return { ok: true, marcadas: r.marcadas, interceptado: true, arquivos: ids("chk2").split(";").filter(Boolean).length, movimentacoes: ids("chk1").split(";").filter(Boolean).length }; }
      } catch (e) { /* cai no envio normal */ }
    }
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
      <div class="w"><div class="m"></div><button data-a="todos">⬇ Gerar e baixar tudo (extensão)</button><button data-a="turbo" style="background:#d9780a;border-color:#d9780a">⚡ Gerar e enviar à Análise Turbo</button><button class="s" data-a="diag">Copiar diagnóstico</button></div>`;
    const msg = (t) => { const m = sh.querySelector(".m"); m.textContent = t; m.style.display = "block"; };
    window.__projudiMsg = msg;
    const botaoTodos = sh.querySelector('[data-a="todos"]');
    const rotulo = () => { const todos = document.getElementById("todos"), n = marcadasPeloUsuario(); botaoTodos.dataset.modo = n && !(todos && todos.checked) ? "marcados" : "todos"; botaoTodos.textContent = botaoTodos.dataset.modo === "marcados" ? `⬇ Gerar e baixar só os ${n} marcados (extensão)` : "⬇ Gerar e baixar tudo (extensão)"; };
    rotulo(); setInterval(rotulo, 600);
    botaoTodos.onclick = async () => { const r = await executar(botaoTodos.dataset.modo === "marcados" ? { marcados: true } : { todos: true }); msg(r.erro ? "✖ " + r.erro : r.interceptado ? `PDF pedido (${r.arquivos} arquivo(s) em ${r.movimentacoes} movimentação(ões)); a extensão faz o OCR e salva em Downloads.` : "Gerando o PDF do Projudi…"); };
    const botaoTurbo = sh.querySelector('[data-a="turbo"]');
    const rotuloT = () => { const n = marcadasPeloUsuario(), todos = document.getElementById("todos"); botaoTurbo.textContent = n && !(todos && todos.checked) ? `⚡ Gerar só os ${n} marcados e enviar à Análise Turbo` : "⚡ Gerar tudo e enviar à Análise Turbo"; };
    rotuloT(); setInterval(rotuloT, 600);
    botaoTurbo.onclick = async () => {      // mesmo download com OCR; o PDF segue para o Módulo Turbo do app de IA (via esteira)
      const rx = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/, num = (document.title.match(rx) || document.body.textContent.match(rx) || [""])[0];
      const ped = botaoTodos.dataset.modo === "marcados" ? { marcados: true } : { todos: true };
      const r = await executar({ ...ped, processo: num, studio: { ativo: true, modo: "turbo", prompt: "", tipo: "", minuta: "", url: "", urlPre: "", docs: false } });
      msg(r.erro ? "✖ " + r.erro : `PDF pedido (${r.arquivos ?? r.marcadas} arquivo(s)); depois do OCR ele vai para a Análise Turbo na aba da extensão.`);
    };
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
    if (!p || Date.now() - p.ts > 3 * 60000 || window.__projudiAplicado) { if (p && Date.now() - p.ts > 3 * 60000) await chrome.storage.local.remove("gerarpdf_pedido"); return; }      // pedido antigo (de uma fila que não terminou) nunca se aplica sozinho
    window.__projudiAplicado = true;
    const r = await executar(p);
    if (r.erro && p.lote) await chrome.storage.local.set({ ["lote_fim_" + p.lote]: { ok: false, erro: "janela Gerar PDF: " + r.erro } });
    await chrome.storage.local.remove("gerarpdf_pedido");     // só agora: é o sinal, para a fila, de que o pedido já foi entregue
    if (window.__projudiMsg) window.__projudiMsg(r.erro ? "✖ " + r.erro : `${r.interceptado ? "PDF pedido ao Projudi; a extensão faz o OCR e salva em Downloads (acompanhe na aba da extensão)." : "Gerando o PDF do Projudi…"} (${p.todos ? "todos os arquivos" : r.marcadas + " arquivo(s)"})`);
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
