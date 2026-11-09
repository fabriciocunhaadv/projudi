// Agente da IA externa (ChatGPT, Gemini, Claude…). Roda DENTRO da aba da IA (injetado pela esteira, só com a permissão que o usuário deu para o site).
// Faz o que uma pessoa faria: anexa o PDF, cola o prompt, envia, espera a resposta terminar e devolve o texto.
// Cada site tem um "perfil" com os seletores conhecidos; se o site mudar, as heurísticas genéricas (por texto/aria-label) assumem
// e o botão "Diagnosticar tela da IA" do painel mostra o que foi (ou não) encontrado, para ajustar o perfil.
(() => {
  if (window.__projudiIA) return;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const PERFIS = [
    { id: "chatgpt", nome: "ChatGPT", hosts: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, novaConversa: "https://chatgpt.com/",
      compositor: ["#prompt-textarea", "div[contenteditable='true'][id*='prompt']", "textarea"], resposta: ["[data-message-author-role='assistant']"],
      enviar: ["button[data-testid='send-button']", "button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]"], parar: ["button[data-testid='stop-button']", "button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='Attach' i]", "button[aria-label*='Adicionar arquivos' i]", "button[data-testid='composer-plus-btn']"] },
    { id: "gemini", nome: "Gemini", hosts: /(^|\.)gemini\.google\.com$/, novaConversa: "https://gemini.google.com/app",
      compositor: ["rich-textarea .ql-editor", "div.ql-editor[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "textarea"], resposta: ["message-content", ".model-response-text", "[data-test-id='model-response']"],
      enviar: ["button.send-button", "button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]", "button.stop"],
      anexar: ["button[aria-label*='Abrir menu de upload' i]", "button[aria-label*='Open upload' i]", "button[aria-label*='Adicionar arquivo' i]", "button[aria-label*='Upload' i]"] },
    { id: "claude", nome: "Claude", hosts: /(^|\.)claude\.ai$/, novaConversa: "https://claude.ai/new",
      compositor: ["div[contenteditable='true'].ProseMirror", "div[contenteditable='true'][role='textbox']", "fieldset div[contenteditable='true']", "textarea"], resposta: ["[data-testid='assistant-message']", ".font-claude-message", ".font-claude-response"],
      enviar: ["button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='Attach' i]", "button[aria-label*='Add files' i]", "button[aria-label*='Adicionar' i]"] },
    { id: "jusbrasil", nome: "IA do Jusbrasil", hosts: /(^|\.)ia\.jusbrasil\.com\.br$/, novaConversa: "https://ia.jusbrasil.com.br/conversa",
      compositor: ["textarea", "div[contenteditable='true'][role='textbox']", "div[contenteditable='true']"], resposta: ["[data-message-author-role='assistant']", "[class*='assistant' i]", "[class*='answer' i]", "[class*='response' i]"],
      enviar: ["button[type='submit']", "button[aria-label*='Enviar' i]", "button[aria-label*='send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='arquivo' i]", "button[aria-label*='Upload' i]", "button[aria-label*='Adicionar' i]"] },
  ];
  const GENERICO = { id: "generico", nome: "IA", compositor: ["textarea", "div[contenteditable='true'][role='textbox']", "div[contenteditable='true']"], resposta: ["[data-message-author-role='assistant']", "[class*='assistant' i]", "[class*='response' i]", "[class*='answer' i]"],
    enviar: ["button[type='submit']", "button[aria-label*='send' i]", "button[aria-label*='enviar' i]"], parar: ["button[aria-label*='stop' i]", "button[aria-label*='parar' i]"], anexar: ["button[aria-label*='attach' i]", "button[aria-label*='anexar' i]", "button[aria-label*='upload' i]"] };
  const perfil = () => PERFIS.find((p) => p.hosts.test(location.hostname)) || GENERICO;
  const visivel = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return (r.width > 0 || r.height > 0) && cs.visibility !== "hidden" && cs.display !== "none"; };
  const primeiro = (seletores, so = visivel) => { for (const s of seletores) { let achados = []; try { achados = [...document.querySelectorAll(s)]; } catch { /* seletor inválido */ } const ok = achados.filter(so); if (ok.length) return ok[ok.length - 1]; } return null; };
  const todosVisiveis = (seletores) => { const out = []; for (const s of seletores) { try { for (const e of document.querySelectorAll(s)) if (visivel(e) && !out.includes(e)) out.push(e); } catch { /* */ } if (out.length) break; } return out; };
  const textoDe = (el) => (el.innerText || el.textContent || "").trim();
  const desabilitado = (b) => !b || b.disabled || b.getAttribute("aria-disabled") === "true";

  const compositor = () => primeiro(perfil().compositor);
  const botaoEnviar = () => primeiro(perfil().enviar) || [...document.querySelectorAll("button")].filter(visivel).find((b) => /^(enviar|send)( mensagem| message)?$/i.test((b.getAttribute("aria-label") || b.title || textoDe(b)).trim()));
  const botaoParar = () => primeiro(perfil().parar) || [...document.querySelectorAll("button")].filter(visivel).find((b) => /^(parar|stop)( gera[cç][aã]o| generating| streaming| resposta)?\b/i.test((b.getAttribute("aria-label") || b.title || "").trim()));
  const campoArquivo = () => [...document.querySelectorAll("input[type='file']")].find((i) => !i.accept || /pdf|\*|application|\.pdf/i.test(i.accept)) || document.querySelector("input[type='file']");
  const botaoAnexar = () => primeiro(perfil().anexar) || [...document.querySelectorAll("button, [role='button']")].filter(visivel).find((b) => /anex|attach|upload|adicionar (arquivo|foto)|add (file|photo)/i.test((b.getAttribute("aria-label") || b.title || "")));
  const respostas = () => todosVisiveis(perfil().resposta);
  const pedeLogin = () => !compositor() && ([...document.querySelectorAll("a,button")].some((e) => /^(log ?in|entrar|sign ?in|fazer login|login)$/i.test(textoDe(e))) || /\/(login|auth|signin|accounts)/i.test(location.pathname + location.hostname));
  const bloqueio = () => /verifique que (você|voce) é humano|verify you are human|just a moment|captcha/i.test(document.title + " " + (document.body?.innerText || "").slice(0, 400));

  function diagnosticar() {
    const p = perfil(), c = compositor(), ba = botaoAnexar(), be = botaoEnviar(), bp = botaoParar(), cf = campoArquivo();
    const d = (e) => (e ? `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.getAttribute("aria-label") ? `[aria-label="${e.getAttribute("aria-label")}"]` : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}` : null);
    return { site: location.hostname, perfil: p.id, nome: p.nome, logado: !pedeLogin(), bloqueio: bloqueio(), compositor: d(c), campoArquivo: d(cf), botaoAnexar: d(ba), botaoEnviar: d(be), botaoParar: d(bp), respostas: respostas().length, pronto: !!c && !pedeLogin() && !bloqueio() };
  }

  async function escrever(texto) {
    const c = await esperarPor(compositor, 15000);
    if (!c) throw new Error("não achei a caixa de mensagem da IA (rode “Diagnosticar tela da IA”)");
    c.focus();
    if (c.tagName === "TEXTAREA" || c.tagName === "INPUT") {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c), "value").set; set.call(c, texto);
      c.dispatchEvent(new Event("input", { bubbles: true })); c.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(c); sel.removeAllRanges(); sel.addRange(r);
      let ok = false; try { ok = document.execCommand("insertText", false, texto); } catch { ok = false; }
      if (!ok || textoDe(c).length < Math.min(texto.length, 20)) {      // fallback: simula a colagem
        const dt = new DataTransfer(); dt.setData("text/plain", texto);
        c.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        if (textoDe(c).length < Math.min(texto.length, 20)) { c.textContent = texto; c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: texto })); }
      }
    }
    await dorme(400);
    const lido = (c.value !== undefined ? c.value : textoDe(c)) || "";
    if (lido.replace(/\s/g, "").length < Math.min(texto.replace(/\s/g, "").length, 40)) throw new Error("o prompt não entrou na caixa de mensagem");
    return { ok: true, tamanho: lido.length };
  }
  async function esperarPor(fn, ms, passo = 250) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(passo); } }

  const partes = new Map();
  function b64ParaArquivo(nome, b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], nome, { type: "application/pdf" }); }
  async function anexar(nome, b64) {
    const arq = b64ParaArquivo(nome, b64);
    let campo = campoArquivo();
    if (!campo) { const b = botaoAnexar(); if (b) { b.click(); campo = await esperarPor(campoArquivo, 6000); if (!campo) { /* menu: procura a opção "enviar arquivo" */ const op = await esperarPor(() => [...document.querySelectorAll("[role='menuitem'], button, li")].filter(visivel).find((e) => /(enviar|carregar|upload|adicionar|add).*(arquivo|file|computador|computer)|arquivo|from computer/i.test(textoDe(e) || e.getAttribute("aria-label") || "")), 3000); if (op) { op.click(); campo = await esperarPor(campoArquivo, 5000); } } } }
    if (campo) {
      const dt = new DataTransfer(); dt.items.add(arq); campo.files = dt.files;
      campo.dispatchEvent(new Event("input", { bubbles: true })); campo.dispatchEvent(new Event("change", { bubbles: true }));
    } else {      // sem campo de arquivo: simula o arrastar-e-soltar sobre a caixa de mensagem
      const alvo = compositor() || document.body; const dt = new DataTransfer(); dt.items.add(arq);
      for (const tipo of ["dragenter", "dragover", "drop"]) alvo.dispatchEvent(new DragEvent(tipo, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
    const base = nome.replace(/\.pdf$/i, "");
    const ok = await esperarPor(() => { const t = document.body.innerText || ""; return t.includes(nome) || t.includes(base) || t.includes(base.slice(0, 20)); }, 90000, 500);
    if (!ok) throw new Error("não consegui confirmar o upload do PDF na tela da IA");
    await esperarPor(() => !document.querySelector("[role='progressbar'], progress, [class*='uploading' i]"), 120000, 500);      // espera o fim do envio (e do processamento)
    await dorme(1500);
    return { ok: true };
  }

  async function enviar() {
    const b = await esperarPor(() => { const x = botaoEnviar(); return x && !desabilitado(x) ? x : null; }, 120000, 500);
    const antes = respostas().length, textoAntes = respostas().length ? textoDe(respostas()[respostas().length - 1]) : "";
    if (b) b.click(); else { const c = compositor(); if (!c) throw new Error("não achei o botão de enviar"); for (const t of ["keydown", "keypress", "keyup"]) c.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })); }
    window.__projudiIAMarca = { antes, textoAntes };
    return { ok: true, antes };
  }

  // Remove rótulos de botões da tela que vêm misturados ao texto (ex.: barra “Reescrever / Buscar julgados / Perguntar”).
  const limpar = (t) => String(t || "").replace(/Reescrever\s*Buscar julgados\s*Perguntar/gi, "").split("\n").filter((l) => !/^\s*(Reescrever|Buscar julgados|Perguntar|Baixar|Copiar|Ver fontes|Editar|Compartilhar)\s*$/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Painel lateral com um documento longo (metade direita da tela, sem caixa de mensagem dentro).
  function painelDocumento() {
    const W = innerWidth;
    const c = [...document.querySelectorAll("div,section,article,aside,main")].filter(visivel).filter((e) => { const r = e.getBoundingClientRect(); return r.left > W * 0.35 && r.width < W * 0.75 && textoDe(e).length > 800 && !e.querySelector("textarea,[contenteditable='true']"); });
    if (!c.length) return null;
    return c.sort((a, b) => textoDe(b).length - textoDe(a).length || a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
  }
  async function estabilizar(el, ms) { let u = textoDe(el).length, desde = Date.now(); while (Date.now() - desde < ms) { await dorme(500); const n = textoDe(el).length; if (n !== u) { u = n; desde = Date.now(); } } }

  // Espera a resposta: começou (botão "parar" ou texto novo) e terminou (sem "parar" e texto estável por `estavelMs`).
  async function esperarResposta(ms = 600000, estavelMs = 6000) {
    const marca = window.__projudiIAMarca || { antes: 0, textoAntes: "" };
    const t0 = Date.now(); let ultimo = "", desde = Date.now(), comecou = false;
    for (;;) {
      if (Date.now() - t0 > ms) throw new Error("a IA não terminou de responder no tempo limite");
      if (bloqueio()) throw new Error("a IA pediu verificação humana (captcha): resolva na aba dela");
      const rs = respostas(), ult = rs.length ? textoDe(rs[rs.length - 1]) : "";
      const novo = rs.length > marca.antes || (ult && ult !== marca.textoAntes);
      const gerando = !!botaoParar();
      if (gerando || novo) comecou = true;
      if (ult !== ultimo) { ultimo = ult; desde = Date.now(); }
      if (comecou && novo && !gerando && ult && Date.now() - desde >= estavelMs) {
        const el = rs[rs.length - 1];
        let texto = limpar(ult), html = el.innerHTML, origem = "chat";
        // IAs que entregam a peça num painel lateral (ex.: Jusbrasil “Criou Peça”): o chat só traz um aviso curto; a minuta está no painel
        if (texto.length < 2000) {
          const d = await esperarPor(painelDocumento, 25000, 1000);
          if (d) { await estabilizar(d, 3000); const t = limpar(textoDe(d)); if (t.length > texto.length) { texto = t; html = d.innerHTML; origem = "painel"; } }
        }
        return { ok: true, texto, html, origem };
      }
      if (!comecou && Date.now() - t0 > 90000) throw new Error("a IA não começou a responder (a mensagem pode não ter sido enviada)");
      await dorme(1000);
    }
  }

  window.__projudiIA = { diagnosticar, escrever, anexar, enviar, esperarResposta, perfil, PERFIS };

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((m, _s, responder) => {
      if (!m || !String(m.acao || "").startsWith("ia-")) return false;
      const ok = (p) => p.then((r) => responder(r), (e) => responder({ ok: false, erro: String(e.message || e) }));
      if (m.acao === "ia-ping") { responder({ ok: true }); return false; }
      if (m.acao === "ia-diagnosticar") { responder({ ok: true, ...diagnosticar() }); return false; }
      if (m.acao === "ia-escrever") { ok(escrever(m.texto)); return true; }
      if (m.acao === "ia-parte") { const a = partes.get(m.id) || []; a[m.n] = m.dados; partes.set(m.id, a); responder({ ok: true }); return false; }
      if (m.acao === "ia-anexar") { const a = partes.get(m.id); partes.delete(m.id); ok(anexar(m.nome, (a || []).join(""))); return true; }
      if (m.acao === "ia-enviar") { ok(enviar()); return true; }
      if (m.acao === "ia-esperar") { ok(esperarResposta(m.ms, m.estavelMs)); return true; }
      return false;
    });
  }
})();
