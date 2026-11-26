// Agente da IA externa (ChatGPT, Gemini, Claude…). Roda DENTRO da aba da IA (injetado pela esteira, só com a permissão que o usuário deu para o site).
// Faz o que uma pessoa faria: anexa o PDF, cola o prompt, envia, espera a resposta terminar e devolve o texto.
// Cada site tem um "perfil" com os seletores conhecidos; se o site mudar, as heurísticas genéricas (por texto/aria-label) assumem
// e o botão "Diagnosticar tela da IA" do painel mostra o que foi (ou não) encontrado, para ajustar o perfil.
(() => {
  if (window.__projudiIA) return;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const PERFIS = [
    { id: "chatgpt", nome: "ChatGPT", hosts: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, novaConversa: "https://chatgpt.com/",
      compositor: ["#prompt-textarea", "div[contenteditable='true'][id*='prompt']", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "textarea"], resposta: ["[data-message-author-role='assistant']", "article[data-testid*='conversation-turn'] .markdown", "[data-testid^='conversation-turn-'] .markdown", "div.markdown.prose", "div.markdown"],
      concluido: ["button[data-testid='copy-turn-action-button']", "button[data-testid='good-response-turn-action-button']", "button[data-testid='bad-response-turn-action-button']"],      // a barra de ações (copiar, 👍, 👎) só aparece quando a resposta terminou

      enviar: ["button[data-testid='send-button']", "#composer-submit-button", "button[data-testid='composer-submit-button']", "button[aria-label*='Enviar prompt' i]", "button[aria-label*='Send prompt' i]", "button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]", "form button[type='submit']"], parar: ["button[data-testid='stop-button']", "button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[data-testid='composer-plus-btn']", "button[aria-label*='Adicionar arquivos' i]", "button[aria-label*='Adicionar fotos' i]", "button[aria-label*='Add files' i]", "button[aria-label*='Anexar' i]", "button[aria-label*='Attach' i]", "[data-testid='composer-leading-actions'] button", "form button[aria-haspopup='menu']"] },
    { id: "gemini", nome: "Gemini", hosts: /(^|\.)gemini\.google\.com$/, novaConversa: "https://gemini.google.com/app",
      compositor: ["rich-textarea .ql-editor", "div.ql-editor[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "textarea"], resposta: ["message-content", ".model-response-text", "[data-test-id='model-response']"],
      enviar: ["button.send-button", "button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]", "button.stop"],
      anexar: ["button[aria-label*='Abrir menu de upload' i]", "button[aria-label*='Open upload' i]", "button[aria-label*='Adicionar arquivo' i]", "button[aria-label*='Upload' i]"] },
    { id: "claude", nome: "Claude", hosts: /(^|\.)claude\.ai$/, novaConversa: "https://claude.ai/new",
      compositor: ["div[contenteditable='true'].ProseMirror", "div[contenteditable='true'][role='textbox']", "fieldset div[contenteditable='true']", "textarea"], resposta: ["[data-testid='assistant-message']", ".font-claude-message", ".font-claude-response"],
      enviar: ["button[aria-label*='Enviar' i]", "button[aria-label*='Send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='Attach' i]", "button[aria-label*='Add files' i]", "button[aria-label*='Adicionar' i]"] },
    { id: "jusbrasil", nome: "IA do Jusbrasil", painel: true, hosts: /(^|\.)ia\.jusbrasil\.com\.br$/, novaConversa: "https://ia.jusbrasil.com.br/conversa",
      compositor: ["textarea", "div[contenteditable='true'][role='textbox']", "div[contenteditable='true']"], resposta: ["[data-message-author-role='assistant']", "[class*='assistant' i]", "[class*='answer' i]", "[class*='response' i]"],
      enviar: ["button[type='submit']", "button[aria-label*='Enviar' i]", "button[aria-label*='send' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='arquivo' i]", "button[aria-label*='Upload' i]", "button[aria-label*='Adicionar' i]"] },
    { id: "minutaia", nome: "Minuta IA", minuta: true, hosts: /(^|\.)minutaia\.com\.br$/, novaConversa: "https://minutaia.com.br/",
      comando: "Elabore a minuta do ato conforme o estado dos autos, seguindo as instruções acima.",      // a Minuta IA só trabalha se a instrução trouxer um comando; só as instruções, sem pedido, ela responde perguntando o que fazer
      compositor: ["textarea[aria-label='Instruções para a minuta']", "textarea[id^='chat-input']", "textarea"], resposta: ["div[role='textbox'][aria-label='Conteúdo da minuta']"],
      enviar: ["button[aria-label='Enviar']", "button[aria-label='Enviar mensagem']", "button[aria-label*='Enviar' i]"], parar: ["button[aria-label*='Parar' i]", "button[aria-label*='Stop' i]"],
      anexar: ["button[aria-label*='Anexar' i]", "button[aria-label*='arquivo' i]"] },
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
  const campoArquivo = () => document.querySelector("input[type='file'][aria-label='Selecionar arquivos do processo']") || [...document.querySelectorAll("input[type='file']")].find((i) => !i.accept || /pdf|\*|application|\.pdf/i.test(i.accept)) || document.querySelector("input[type='file']");
  const ROTULO_ANEXAR = /anex|attach|upload|adicion|add (file|photo|content)|arquivo|\bfile|\bmais\b|\bmore\b|ferramenta|^\+$/i, NAO_ANEXAR = /enviar|send|microfone|mic\b|voz|voice|ditar|dictat|gravar|record|modelo|model|flash|pro\b|pensar|think|parar|stop/i;
  const rotuloDe = (b) => (b.getAttribute("aria-label") || b.title || "").trim() || textoDe(b).slice(0, 30);
  // área da caixa de mensagem: sobe a partir dela até um contêiner que tenha botões (para achar o "+" mesmo sem rótulo conhecido)
  const areaDaCaixa = () => { let e = compositor(); for (let i = 0; e && i < 7; i++, e = e.parentElement) if (e.querySelectorAll("button,[role='button']").length >= 2 && e.getBoundingClientRect().width > 250) return e; return document; };
  const botaoAnexar = () => primeiro(perfil().anexar) || [...areaDaCaixa().querySelectorAll("button, [role='button']")].filter(visivel).find((b) => { const r = rotuloDe(b); return ROTULO_ANEXAR.test(r) && !NAO_ANEXAR.test(r); });
  const normaliza = (t) => String(t || "").replace(/\s+/g, " ").trim();
  // eco = texto que contém (ou é parte de) a mensagem que NÓS enviamos: nunca vale como resposta da IA
  const eco = (t) => { const e = normaliza(window.__projudiIAEnviado || ""), x = normaliza(t); if (e.length < 20 || !x) return false; return x.includes(e.slice(0, 150)) || (x.length > 40 && e.includes(x.slice(0, 150))); };
  const respostas = () => todosVisiveis(perfil().resposta).filter((e) => !eco(textoDe(e)));
  const respostasBrutas = () => { let n = 0; for (const sel of perfil().resposta) { try { n += document.querySelectorAll(sel).length; } catch { /* seletor inválido */ } } return n; };
  // Plano B quando o site mudou e os seletores não acham a resposta: lê o que apareceu na tela DEPOIS da nossa mensagem (no balão do usuário) até o rodapé do site.
  const FIM_DA_TELA = /O ChatGPT pode cometer erros|ChatGPT can make mistakes|Pergunte ao ChatGPT|Ask anything|Message ChatGPT|O Gemini pode cometer erros|Claude can make mistakes|Reply to Claude/i;
  const respostaPorTexto = () => {
    const e = String(window.__projudiIAEnviado || "").trim(); if (e.length < 40) return "";
    const raiz = document.querySelector("main") || document.body, t = raiz.innerText || "";
    const cauda = e.slice(-70).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    let ultimo = -1, fimCauda = -1; try { const re = new RegExp(cauda, "g"); let m; while ((m = re.exec(t))) { ultimo = m.index; fimCauda = m.index + m[0].length; } } catch { return ""; }
    if (ultimo < 0) return "";
    let r = t.slice(fimCauda).replace(/^\s+/, ""); const f = r.search(FIM_DA_TELA); if (f >= 0) r = r.slice(0, f);
    return r.replace(/\n(Copiar|Copy|Editar|Edit|Ler em voz alta|Read aloud|Boa resposta|Má resposta|Good response|Bad response|Compartilhar|Share|Mais ações|More actions)\s*(?=\n|$)/g, "").trim();
  };
  const pedeLogin = () => !compositor() && ([...document.querySelectorAll("a,button")].some((e) => /^(log ?in|entrar|sign ?in|fazer login|login)$/i.test(textoDe(e))) || /\/(login|auth|signin|accounts)/i.test(location.pathname + location.hostname));
  const bloqueio = () => /verifique que (você|voce) é humano|verify you are human|just a moment|captcha/i.test(document.title + " " + (document.body?.innerText || "").slice(0, 400));

  function diagnosticar() {
    const p = perfil(), c = compositor(), ba = botaoAnexar(), be = botaoEnviar(), bp = botaoParar(), cf = campoArquivo();
    const d = (e) => (e ? `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.getAttribute("aria-label") ? `[aria-label="${e.getAttribute("aria-label")}"]` : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}` : null);
    return { site: location.hostname, perfil: p.id, nome: p.nome, logado: !pedeLogin(), bloqueio: bloqueio(), compositor: d(c), campoArquivo: d(cf), botaoAnexar: d(ba), botaoEnviar: d(be), botaoParar: d(bp), respostas: respostas().length, pronto: !!c && !pedeLogin() && !bloqueio(),
      campos: [...document.querySelectorAll("textarea, input[type=text], [contenteditable], [role=textbox]")].slice(0, 8).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.getAttribute("role") ? "[role=" + e.getAttribute("role") + "]" : ""}${e.getAttribute("contenteditable") ? "[ce=" + e.getAttribute("contenteditable") + "]" : ""}${visivel(e) ? "" : "(oculto)"}`) };
  }

  async function escrever(texto) {
    const cmd = perfil().comando; if (cmd && !texto.includes(cmd)) texto = texto.replace(/\s+$/, "") + "\n\n" + cmd;
    window.__projudiIAEnviado = texto;
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
  // Minuta IA: ao anexar, abre "Importar arquivo(s) — Selecione como deseja tratar 1 arquivo" (Documento / Modelo). Mantém "Documento" (vai para o contexto) e clica em Continuar.
  const dialogoImportar = () => {
    const t = [...document.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((e) => !e.children.length && /^\s*Importar arquivo\(s\)\s*$/i.test(e.textContent || "") && visivel(e)).pop(); if (!t) return null;
    for (let e = t, i = 0; e && i < 8; e = e.parentElement, i++) { const b = [...e.querySelectorAll("button")].find((x) => /^\s*continuar\s*$/i.test(x.textContent || "") && visivel(x)); if (b) return { botao: b, raiz: e }; }
    return null;
  };
  // Minuta IA, documento grande: abre "Seleção assistida" (faixas recomendadas já marcadas, "Importar tudo mesmo assim" / "Importar selecionados"). Deixa a seleção como está e clica em "Importar selecionados".
  const selecaoAssistida = () => {
    const t = [...document.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((e) => !e.children.length && /^\s*Sele[cç][aã]o assistida\b/i.test(e.textContent || "") && visivel(e)).pop(); if (!t) return null;
    for (let e = t, i = 0; e && i < 14; e = e.parentElement, i++) { const bt = [...e.querySelectorAll("button")].find((x) => /^\s*importar selecionados\s*$/i.test(x.textContent || "") && visivel(x)); if (bt) return { botao: bt, raiz: e }; }
    return null;
  };
  /** Trata, em qualquer ordem, as telas que a Minuta IA abre ao receber o arquivo: "Importar arquivo(s)" (Documento → Continuar), "Seleção assistida" (→ Importar selecionados) e "nenhum contexto adicionado" (→ Voltar).
   *  Termina quando fica `silencio` ms sem nenhuma tela (a Seleção assistida demora a abrir em documento grande). Devolve o que tratou. */
  async function resolverTelasMinuta({ silencio = 2000, ate = 60000 } = {}) {
    const t0 = Date.now(), feitas = []; let ultimaTela = Date.now();
    while (Date.now() - t0 < ate && Date.now() - ultimaTela < silencio) {
      const sel = selecaoAssistida();
      if (sel) {
        await esperarPor(() => !desabilitado(sel.botao), 20000, 300);
        sel.botao.click(); feitas.push("selecao");
        await esperarPor(() => !selecaoAssistida(), 240000, 500); await dorme(800); ultimaTela = Date.now(); continue;
      }
      const imp = dialogoImportar();
      if (imp) {
        const radios = [...imp.raiz.querySelectorAll("input[type='radio'], [role='radio']")];
        const marcado = (r) => r.checked === true || r.getAttribute("aria-checked") === "true" || r.getAttribute("data-state") === "checked";
        if (radios.length && !radios.some(marcado)) radios[0].click();      // o primeiro é "Documento" (contexto)
        await dorme(400); imp.botao.click(); feitas.push("importar");
        await esperarPor(() => !dialogoImportar(), 10000, 300); await dorme(800); ultimaTela = Date.now(); continue;
      }
      const av = avisoSemContexto();
      if (av) { av.click(); feitas.push("contexto"); await dorme(1200); ultimaTela = Date.now(); continue; }
      await dorme(300);
    }
    return feitas;
  }
  async function tratarImportacao() {      // (compatível) só o diálogo "Importar arquivo(s)"
    const d = await esperarPor(dialogoImportar, 8000, 250); if (!d) return false;
    return (await resolverTelasMinuta({ silencio: 12000, ate: 300000 })).length > 0;
  }
  async function anexar(nome, b64) {
    const arq = b64ParaArquivo(nome, b64), base = nome.replace(/\.pdf$/i, "");
    const apareceu = (ms) => esperarPor(() => { const t = document.body.innerText || ""; return t.includes(nome) || t.includes(base) || t.includes(base.slice(0, 20)); }, ms, 500);
    const novoDt = () => { const dt = new DataTransfer(); dt.items.add(arq); return dt; };
    const tentativas = [];
    const porCampo = async (campo) => { campo.files = novoDt().files; campo.dispatchEvent(new Event("input", { bubbles: true })); campo.dispatchEvent(new Event("change", { bubbles: true })); if (perfil().minuta) await tratarImportacao(); };
    // 1) campo de arquivo que já existe na página
    tentativas.push(["campo de arquivo", async () => { const c = campoArquivo(); if (!c) return false; await porCampo(c); return apareceu(10000); }]);
    // 2) colar o arquivo na caixa de mensagem (Gemini, ChatGPT e Claude aceitam)
    tentativas.push(["colar na caixa", async () => { const c = compositor(); if (!c) return false; c.focus(); c.dispatchEvent(new ClipboardEvent("paste", { clipboardData: novoDt(), bubbles: true, cancelable: true })); return apareceu(8000); }]);
    // 3) arrastar e soltar sobre a caixa
    tentativas.push(["arrastar e soltar", async () => { const alvo = compositor() || document.body; const dt = novoDt(); for (const t of ["dragenter", "dragover", "drop"]) alvo.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); return apareceu(8000); }]);
    // 4) último recurso: abrir o botão de anexar (+) e o item "enviar arquivo" do menu para fazer o campo de arquivo aparecer
    tentativas.push(["botão de anexar", async () => {
      const b = botaoAnexar(); if (!b) return false; b.click();
      let c = await esperarPor(campoArquivo, 4000);
      if (!c) { const op = await esperarPor(() => [...document.querySelectorAll("[role='menuitem'], [role='option'], button, li")].filter(visivel).find((e) => /(enviar|carregar|fazer upload|upload|adicionar|add).*(arquivo|file|computador|computer)|arquivos? do computador|from computer/i.test(textoDe(e) || e.getAttribute("aria-label") || "")), 3000); if (op) { op.click(); c = await esperarPor(campoArquivo, 4000); } }
      if (!c) return false; await porCampo(c); return apareceu(60000);
    }]);
    const falhas = [];
    for (const [nomeEst, f] of tentativas) { let ok = false; try { ok = await f(); } catch (e) { falhas.push(`${nomeEst}: ${e.message}`); } if (ok) { await esperarPor(() => !document.querySelector("[role='progressbar'], progress, [class*='uploading' i]"), 120000, 500); await dorme(1500); return { ok: true, como: nomeEst }; } falhas.push(nomeEst); }
    throw new Error("não consegui anexar o PDF na tela da IA (tentei: " + falhas.join("; ") + "). Rode “Diagnosticar tela da IA”.");
  }

  // Botão "Voltar" do aviso "Atenção: nenhum contexto adicionado!" da Minuta IA (sobe do título do aviso até o bloco que tem o botão)
  const avisoSemContexto = () => {
    const alvo = [...document.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((e) => !e.children.length && /nenhum contexto adicionado/i.test(e.textContent || "") && visivel(e)).pop(); if (!alvo) return null;
    for (let e = alvo, i = 0; e && i < 8; e = e.parentElement, i++) { const v = [...e.querySelectorAll("button")].find((x) => /^\s*voltar\s*$/i.test(x.textContent || "") && visivel(x)); if (v) return v; }
    return null;
  };
  async function enviar() {
    if (perfil().minuta) await resolverTelasMinuta({ silencio: 1500, ate: 300000 });      // tela da importação ainda aberta (ex.: Seleção assistida): resolve antes de enviar
    const b = await esperarPor(() => { const x = botaoEnviar(); return x && !desabilitado(x) ? x : null; }, 120000, 500);
    const antes = respostas().length, textoAntes = respostas().length ? textoDe(respostas()[respostas().length - 1]) : "";
    if (b) b.click(); else { const c = compositor(); if (!c) throw new Error("não achei o botão de enviar"); for (const t of ["keydown", "keypress", "keyup"]) c.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })); }
    // Minuta IA: depois de enviar podem aparecer "Atenção: nenhum contexto adicionado!" (→ Voltar), "Importar arquivo(s)" (→ Documento + Continuar) e "Seleção assistida" (→ Importar selecionados);
    // trata o que aparecer (o PDF já está anexado e o prompt já está no chat) e clica em Enviar de novo
    if (perfil().minuta) {
      for (let tent = 0; tent < 3; tent++) {
        const feitas = await resolverTelasMinuta({ silencio: 3500, ate: 300000 }); if (!feitas.length) break;
        const de = await esperarPor(() => { const x = botaoEnviar(); return x && !desabilitado(x) ? x : null; }, 15000, 300); if (!de) break;
        de.click();
      }
    }
    window.__projudiIAMarca = { antes, textoAntes }; window.__projudiIAEnviadoEm = Date.now();
    return { ok: true, antes };
  }

  // Remove rótulos de botões da tela que vêm misturados ao texto (ex.: barra “Reescrever / Buscar julgados / Perguntar”).
  const limpar = (t) => String(t || "").replace(/Reescrever\s*Buscar julgados\s*Perguntar/gi, "").split("\n").filter((l) => !/^\s*(Reescrever|Buscar julgados|Perguntar|Baixar|Copiar|Ver fontes|Editar|Compartilhar)\s*$/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Conteúdo do elemento SEM os botões, ícones e dicas da tela (copiar, baixar, “Marca Jusbrasil”…): trabalha numa cópia fora da tela, com o mesmo layout, para o texto manter os parágrafos.
  function conteudoLimpo(el) {
    const bruto = limpar(textoDe(el));
    try {
      const c = el.cloneNode(true);
      c.querySelectorAll("button, svg, script, style, input, textarea, select, nav, [role='button'], [role='toolbar'], [role='tooltip'], [aria-hidden='true'], [class*='tooltip' i], [class*='toolbar' i], [data-testid*='copy' i], [data-testid*='feedback' i], [data-testid*='action' i]").forEach((e) => e.remove());
      const ponte = document.createElement("div"); ponte.style.cssText = `position:fixed;left:-99999px;top:0;width:${Math.max(400, Math.round(el.getBoundingClientRect().width))}px;opacity:0;pointer-events:none`;
      ponte.appendChild(c); document.body.appendChild(ponte);
      const texto = limpar(c.innerText || c.textContent || ""), html = c.innerHTML; ponte.remove();
      if (texto.length >= bruto.length * 0.6) return { texto, html };      // limpou demais (o recipiente tinha nome de botão)? então fica com o original
    } catch (e) { /* usa o original */ }
    return { texto: bruto, html: el.innerHTML };
  }
  // Painel lateral com um documento longo (metade direita da tela, sem caixa de mensagem dentro).
  function painelDocumento() {
    const W = innerWidth;
    const c = [...document.querySelectorAll("div,section,article,aside,main")].filter(visivel).filter((e) => { const r = e.getBoundingClientRect(); return r.left > W * 0.35 && r.width < W * 0.75 && textoDe(e).length > 800 && !e.querySelector("textarea,[contenteditable='true']") && !eco(textoDe(e)); });
    if (!c.length) return null;
    return c.sort((a, b) => textoDe(b).length - textoDe(a).length || a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
  }
  async function estabilizar(el, ms) { let u = textoDe(el).length, desde = Date.now(); while (Date.now() - desde < ms) { await dorme(500); const n = textoDe(el).length; if (n !== u) { u = n; desde = Date.now(); } } }

  // Espera a resposta: começou (botão "parar" ou texto novo) e terminou (sem "parar" e texto estável por `estavelMs`).
  // IAs que entregam a peça num painel lateral (Jusbrasil): a minuta é o texto do painel, estável e sem o botão de parar; o chat só tem avisos.
  async function esperarPainel(ms, estavelMs) {
    const t0 = Date.now(); let ultimo = "", desde = Date.now();
    for (;;) {
      if (Date.now() - t0 > ms) throw new Error("a IA não terminou de responder no tempo limite");
      if (bloqueio()) throw new Error("a IA pediu verificação humana (captcha): resolva na aba dela");
      const d = painelDocumento(), t = d ? limpar(textoDe(d)) : "";
      if (d && t.length > 400 && !eco(t)) {
        if (t !== ultimo) { ultimo = t; desde = Date.now(); }
        if (!botaoParar() && Date.now() - desde >= estavelMs) { const c = conteudoLimpo(d); return { ok: true, texto: c.texto, html: c.html, origem: "painel" }; }
      }
      if (!ultimo && Date.now() - t0 > 180000) throw new Error("o painel com a minuta não apareceu (a IA pode ter respondido só no chat)");
      await dorme(1000);
    }
  }
  // Minuta IA: depois de enviar, ela pesquisa, pensa e abre um editor em tela cheia; a minuta é o texto do editor, pronta quando aparece "Minuta gerada".
  async function esperarMinuta(ms, estavelMs) {
    const t0 = Date.now(); let ultimo = "", desde = Date.now();
    const editor = () => document.querySelector("div[role='textbox'][aria-label='Conteúdo da minuta']");
    const pronta = () => !!document.querySelector("[data-tiptap-ai-chat-message-variant='generation-complete']");
    for (;;) {
      if (Date.now() - t0 > ms) throw new Error("a Minuta IA não terminou de gerar no tempo limite");
      if (bloqueio()) throw new Error("a Minuta IA pediu verificação humana (captcha): resolva na aba dela");
      const e = editor(), t = e ? textoDe(e) : "";
      if (t !== ultimo) { ultimo = t; desde = Date.now(); }
      if (e && t.length > 400 && (pronta() || Date.now() - desde >= estavelMs * 3) && Date.now() - desde >= Math.min(estavelMs, 3000)) return { ok: true, texto: t, html: e.innerHTML, origem: "editor" };
      if (!e && Date.now() - t0 > 240000) throw new Error("o editor com a minuta não abriu (a Minuta IA pode ter respondido só no chat, pedindo um comando)");
      await dorme(1000);
    }
  }
  async function esperarResposta(ms = 600000, estavelMs = 6000) {
    if (perfil().minuta) return esperarMinuta(ms, estavelMs);
    if (perfil().painel) return esperarPainel(ms, estavelMs);
    const marca = window.__projudiIAMarca || { antes: 0, textoAntes: "" };
    const t0 = Date.now(); let ultimo = "", desde = Date.now(), comecou = false, ultimoAlt = "", desdeAlt = Date.now();
    for (;;) {
      if (Date.now() - t0 > ms) throw new Error("a IA não terminou de responder no tempo limite");
      if (bloqueio()) throw new Error("a IA pediu verificação humana (captcha): resolva na aba dela");
      const rs = respostas(), ult = rs.length ? textoDe(rs[rs.length - 1]) : "";
      const novo = rs.length > marca.antes || (ult && ult !== marca.textoAntes);
      // Claude/ChatGPT com ferramentas ("Leu um arquivo, executou 6 comandos", "Executando um…"): o texto fica parado enquanto a IA lê os autos e o botão de parar pode sumir.
      // Texto que ainda indica trabalho em andamento, ou texto curto logo depois do envio, NÃO é a minuta: continua esperando (o chamador reabre a espera em fatias).
      const emTrabalho = /(?:^|\n|\s)(?:Executando|Lendo|Analisando o|Processando)\b[^.\n]{0,60}$/i.test(ult.slice(-140)) || /\b(?:executou|executando) \d* ?comandos?\b/i.test(ult.slice(-200));
      const gerando = !!botaoParar() || emTrabalho;
      if (gerando || novo) comecou = true;
      if (ult !== ultimo) { ultimo = ult; desde = Date.now(); }
      const barraDeAcoes = !gerando && !!perfil().concluido && todosVisiveis(perfil().concluido).length > 0;      // a própria tela avisa que terminou: não precisa esperar tanto
      const anuncio = /^\s*(?:vou|irei|vamos|primeiro,? |antes de|estou (?:lendo|analisando|abrindo)|let me|i(?:'ll| will))/i.test(ult);      // “Vou ler integralmente o PDF…”: a IA anunciando o que vai fazer
      const curtoCedo = ult.length < 400 && anuncio && !barraDeAcoes && Date.now() - (window.__projudiIAEnviadoEm || t0) < 20 * 60000;      // texto curto de anúncio nos primeiros 20 min não é a minuta: continua esperando
      if (comecou && novo && !gerando && ult && !curtoCedo && Date.now() - desde >= (barraDeAcoes ? Math.min(estavelMs, 1500) : estavelMs)) {
        const el = rs[rs.length - 1];
        const cl = conteudoLimpo(el); let texto = cl.texto, html = cl.html, origem = "chat";
        // IAs que entregam a peça num painel lateral (ex.: Jusbrasil “Criou Peça”): o chat só traz um aviso curto; a minuta está no painel
        if (texto.length < 2000) {
          const d = await esperarPor(painelDocumento, 15000, 1000);
          if (d) { await estabilizar(d, 3000); const c = conteudoLimpo(d); if (c.texto.length > texto.length) { texto = c.texto; html = c.html; origem = "painel"; } }
        }
        return { ok: true, texto, html, origem };
      }
      // Plano B: depois de 20 s sem enxergar a resposta pelos seletores, lê pelo texto da tela; vale se estabilizou e a IA não está gerando
      if (!comecou && Date.now() - t0 > 20000) {
        const alt = respostaPorTexto();
        if (alt.length > 150) {
          if (alt !== ultimoAlt) { ultimoAlt = alt; desdeAlt = Date.now(); }
          if (!botaoParar() && Date.now() - desdeAlt >= estavelMs) return { ok: true, texto: alt, html: "", origem: "tela" };
        }
      }
      if (!comecou && Date.now() - t0 > 90000) throw new Error(`a IA não começou a responder (a mensagem pode não ter sido enviada). Visto na tela: ${respostasBrutas()} elemento(s) de resposta pelos seletores, ${respostas().length} depois do filtro de eco; texto novo na tela: ${respostaPorTexto().length} caracteres`);
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
