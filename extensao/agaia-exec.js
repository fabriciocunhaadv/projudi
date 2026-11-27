// ExecAgaia automático (esteira, modo "Agaia"): na tela de execução do prompt, faz o que o assessor faz à mão e devolve a minuta:
//   marca as opções extras → escolhe o prompt da serventia → entrada "Através da integração ao PROJUDI" → marca os movimentos UM A UM
//   (o botão "Todos" abre uma verificação com uma conta que muda a cada vez, feita para uma pessoa: a extensão não a resolve) → Executar → "Sim, continuar"
//   → espera terminar → lê o resultado. Qualquer mensagem/erro do Agaia é devolvida como está, para a esteira registrar e seguir para o próximo.
// O pedido chega por mensagem (acao "agaia-executar") e o resultado volta pelo storage (agaia_res_<reqId>), para uma queda do canal não perder a análise.
(() => {
  if (window.__projudiAgaiaExec) return;
  window.__projudiAgaiaExec = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/civel/g, "civil").replace(/\boutr[oa]s?\b/g, "outros");
  const visivel = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
  const texto = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  async function esperar(fn, ms, passo = 250) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(passo); } }

  // ---------- leitura da tela ----------
  const campoProcesso = () => [...document.querySelectorAll("input[type=text]")].find((i) => /Informe o n[uú]mero do processo/i.test(i.placeholder || ""));
  const selectPrompt = () => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /selecione um prompt/i.test(o.text))) || document.getElementById("prompt_id");      // tela “legada” (área SEEU): lista sem a opção “Selecione um prompt”
  const formularioAgaia = () => document.getElementById("form_execucao_moderno") || document.getElementById("form_execucao_legacy");
  const movimentos = () => [...document.querySelectorAll("input.check_movimento")];
  const resultado = () => document.getElementById("resultado_conteudo");
  const SEM_RESULTADO = /Aguardando Execu[cç][aã]o|Preencha os dados e execute/i;
  const textoResultado = () => texto(resultado());
  const temResultado = () => { const t = textoResultado(); return t.length > 150 && !SEM_RESULTADO.test(t.slice(0, 200)); };
  const executando = () => [...document.querySelectorAll("div,p,h4,h5,span")].some((e) => /Em execu[cç][aã]o pela AGAIA/i.test(e.textContent || "") && e.children.length === 0 && visivel(e));
  const naTelaDeLogin = () => /\/login\b/i.test(location.pathname) || !!document.querySelector("input[type=password]");

  // mensagens do Agaia (avisos, erros, janelas); as instruções fixas da tela não contam
  const IGNORAR = /^Instru[cç][oõ]es|As linhas marcadas em azul|Formul[aá]rio bloqueado ap[oó]s execu/i;
  function mensagens() {
    const achados = [];
    const add = (t) => { t = String(t || "").replace(/\s+/g, " ").trim(); if (t && t.length > 3 && !IGNORAR.test(t) && !achados.includes(t)) achados.push(t.slice(0, 600)); };
    document.querySelectorAll("#sistem_message .alert, .alert-danger, .alert-warning, .alert-info, .toast, .swal2-popup, .invalid-feedback, [role=alert]").forEach((e) => { if (visivel(e) && !e.closest("#historicoContent")) add(texto(e)); });
    document.querySelectorAll(".modal.show .modal-body").forEach((e) => add(texto(e)));
    return sigiloTolerado ? achados.filter((t) => !/Informamos que o processo [eé] sigiloso|Em processo sigiloso, informe|Responsabilidade em processo sigiloso/i.test(t)) : achados;
  }
  const modalAberto = () => [...document.querySelectorAll(".modal.show")].find(visivel) || null;
  /** Fecha o modal pelo “X” do canto (nunca por “Não, quero ajustar”). */
  const fecharModal = (modal) => {
    const x = [...modal.querySelectorAll("button, a, [role=button]")].find((b) => visivel(b) && !/ajustar|n[aã]o\b|cancelar/i.test(texto(b)) && (/\bclose\b|btn-close/i.test(b.className || "") || /^[×✕✖xX]$/.test(texto(b)) || /fechar|close/i.test(b.getAttribute("aria-label") || b.title || "") || b.hasAttribute("data-dismiss") || b.hasAttribute("data-bs-dismiss")));
    if (x) x.click();
  };
  // processo em segredo de justiça: o Agaia pede uma declaração de responsabilidade (“Entendi e desejo continuar”) e depois exige o PDF anonimizado.
  // A declaração é do usuário e o PDF não faz parte deste modo: a esteira NÃO confirma por ele; registra o motivo e segue.
  let sigiloTolerado = false;      // processo sigiloso COM PDF e aceite do usuário: o aviso fixo do Agaia não é erro
  const sigilo = () => { if (sigiloTolerado) return ""; const t = [texto(modalAberto()), ...mensagens()].join(" "); return /sigilos|segredo de justi/i.test(t) ? t.replace(/\s+/g, " ").trim().slice(0, 400) : ""; };
  const falhaSigilo = (t) => ({ ok: false, sigiloso: true, erro: "Processo em segredo de justiça: o Agaia exige a sua declaração de responsabilidade e o PDF do processo (anexo manual), o que a esteira não faz por você. Faça este processo à mão no Agaia. Texto do Agaia: " + t });

  // Processo sigiloso COM PDF: só roda se o usuário aceitou as declarações na esteira (p.aceiteSigilo). A extensão então faz, por ele, os dois cliques que o Agaia exige.
  /** Clica em TODAS as janelinhas que o Agaia abrir no caminho (declaração “Entendi e desejo continuar”, confirmação “Sim, continuar”, avisos com “OK”), até não sobrar nenhuma. Devolve "captcha" se pedir a conta da imagem (só uma pessoa resolve). */
  async function fecharAvisos(maxVoltas = 8) {
    const botao = (m, re) => [...m.querySelectorAll("button")].find((x) => re.test(texto(x)) && visivel(x) && !x.disabled);
    for (let v = 0; v < maxVoltas; v++) {
      const m = await esperar(() => modalAberto(), v === 0 ? 2500 : 1200);
      if (!m) return "";
      const t = texto(m);
      if (/Digite o resultado exibido|exibido na imagem|captcha|n[aã]o sou um rob/i.test(t)) return "captcha";
      const b = botao(m, /Entendi e desejo continuar/i) || (/Confirma[cç][aã]o de execu[cç][aã]o|deseja continuar/i.test(t) ? botao(m, /^\s*(Sim,? continuar|Confirmar|Continuar|Sim)\s*$/i) : null) || botao(m, /^\s*(OK|Fechar|Ciente|Entendi)\s*$/i);
      if (!b) { fecharModal(m); await dorme(600); continue; }
      b.click(); await dorme(1000);
    }
    return "";
  }
  /** Caixa “avaliei a extração realizada pela AGAIA. Concordo com o texto extraído… autorizo seu envio para a IA” (aparece depois do PDF extraído). */
  const caixaConcordo = () => [...document.querySelectorAll("input[type=checkbox]")].find((c) => {      // só o texto do próprio rótulo (um contêiner grande, como o formulário inteiro, também contém a frase)
    const cand = [c.id ? document.querySelector(`label[for="${c.id}"]`) : null, c.closest("label"), c.parentElement, c.nextElementSibling].filter((e) => e && e.querySelectorAll("input[type=checkbox]").length <= 1).map((e) => texto(e)).filter((t) => t.length > 20 && t.length < 800);      // o rótulo só pode conter ESTA caixa (um contêiner com várias caixas também contém a frase)
    return cand.some((t) => /avaliei a extra[cç][aã]o|Concordo com o texto extra[ií]do/i.test(t));
  }) || null;
  const campoArquivo = () => [...document.querySelectorAll("input[type=file]")].find((i) => !i.disabled && (!i.accept || /pdf/i.test(i.accept))) || null;

  // ---------- preenchimento ----------
  const marcar = (id, valor) => { const c = document.getElementById(id); if (!c || c.disabled) return false; if (c.checked !== valor) c.click(); return c.checked === valor; };
  function melhorOpcao(sel, alvo) {
    const ops = [...sel.options].filter((o) => o.value && !/selecione/i.test(o.text));
    const t = sem(alvo), fim = sem(alvo.split(" - ").pop());
    const por = (f) => ops.filter((o) => f(sem(o.text))).sort((a, b) => a.text.length - b.text.length)[0];
    const exata = por((x) => x === t) || por((x) => x.includes(t)) || (fim && (por((x) => x.endsWith(fim)) || por((x) => x.includes(fim)))) || null;
    if (exata) return { op: exata, aproximado: "" };
    const p = globalThis.PromptSimilar?.melhor(ops.map((o) => ({ texto: o.text, ref: o })), alvo, "");      // o juiz não tem o prompt exato: o parecido da mesma matéria
    if (p) return { op: p.ref, aproximado: `prompt “${alvo}” não cadastrado no Agaia: usado o parecido “${p.texto.trim()}”` };
    return null;
  }
  function escolherPrompt(alvo) {
    const sel = selectPrompt(); if (!sel) return { erro: "não achei a lista de prompts do Agaia" };
    if (!alvo) return { erro: "serventia sem prompt definido na extensão" };
    const r = melhorOpcao(sel, alvo); if (!r) return { erro: `não achei no Agaia um prompt parecido com “${alvo}”` };
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, r.op.value);
    sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, aproximado: r.aproximado, escolhido: r.op.text.trim() };
  }

  async function executar(p) {
    const prog = (txt) => chrome.storage.local.set({ ["agaia_prog_" + p.reqId]: { txt, t: Date.now() } }).catch(() => {});
    const falha = (erro, extra = {}) => ({ ok: false, erro, ...extra });
    try {
      prog("abrindo o formulário do Agaia");
      const form = await esperar(() => formularioAgaia() || naTelaDeLogin(), 45000);
      if (naTelaDeLogin()) return falha("O Agaia pediu login (sessão expirada). Entre no Agaia e continue a fila.", { sessao: true });
      if (!form) return falha("O Agaia não abriu o formulário de execução" + (mensagens()[0] ? ": " + mensagens()[0] : "."));
      await dorme(1500);      // o aviso de segredo de justiça aparece logo depois de abrir
      if (p.seeu) {      // área SEEU: marca a opção e espera o formulário ser trocado (a página troca as telas sozinha)
        const area = document.getElementById("area_SEEU");
        if (!area) return falha("não achei a opção SEEU na tela do Agaia");
        prog("escolhendo a área SEEU");
        if (!area.checked) area.click();
        const trocou = await esperar(() => document.querySelector("#form_execucao_legacy input[name=area_id]")?.value === "3", 20000);
        if (!trocou) return falha("o Agaia não trocou para a área SEEU");
        await dorme(1200);
      }
      sigiloTolerado = !!(p.modoPdf && p.aceiteSigilo);
      if (sigiloTolerado) { if ((await fecharAvisos()) === "captcha") return falha("O Agaia pediu uma verificação (conta na imagem), que precisa de uma pessoa.", { verificacao: true }); }
      else if (sigilo()) return falhaSigilo(sigilo());
      const m0 = mensagens().find((t) => /n[aã]o (foi )?encontrad|inexistente|arquivad|sem permiss|n[aã]o autorizad/i.test(t));
      if (m0) return falha(m0);
      await esperar(() => selectPrompt(), 20000);
      await dorme(600);
      // opções extras, como o assessor usa
      marcar("consultar_juris_auto", true); marcar("incluir_contexto_ampliado_acuracia", true); marcar("reanalisar_juris_auto", false);
      const campo = campoProcesso();
      if (campo && (!campo.value || p.seeu) && p.numero) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, p.numero); campo.dispatchEvent(new Event("input", { bubbles: true })); campo.dispatchEvent(new Event("change", { bubbles: true })); }
      prog("escolhendo o prompt");
      const pr = escolherPrompt(p.prompt);
      if (pr.erro) return falha(pr.erro);
      await dorme(400);
      if (p.modoPdf) {
        // entrada: PDF do processo (baixado do Projudi pela extensão); a declaração e a caixa de concordância são do usuário, aceitas antes na esteira
        const arq = window.__agaiaArq?.[p.arquivoId];
        if (!arq || arq.partes.filter(Boolean).length !== arq.n) return falha("o PDF não chegou inteiro à aba do Agaia");
        prog("escolhendo a entrada por PDF");
        const rPdf = document.getElementById("tipo_pdf") || [...document.querySelectorAll("input[type=radio]")].find((r) => r.value === "pdf" || /atrav[eé]s de pdf/i.test(texto(r.closest("label") || r.parentElement)));
        if (!rPdf) return falha("não achei a opção “Através de PDF” no Agaia");
        if (!rPdf.checked) rPdf.click();
        await dorme(800);
        if ((await fecharAvisos()) === "captcha") return falha("O Agaia pediu uma verificação (conta na imagem), que precisa de uma pessoa.", { verificacao: true });
        const inp = await esperar(() => campoArquivo(), 30000);
        if (!inp) return falha("não achei o campo para anexar o PDF no Agaia");
        const dt = new DataTransfer(); dt.items.add(new File(arq.partes, p.pdfNome || "processo.pdf", { type: "application/pdf" })); delete window.__agaiaArq[p.arquivoId];
        inp.files = dt.files; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
        prog("PDF anexado; o Agaia está extraindo o texto");
        let caixa = null; const tCx = Date.now();
        while (Date.now() - tCx < 15 * 60000) {
          caixa = caixaConcordo(); if (caixa) break;
          if (p.seeu && Date.now() - tCx > 8000 && document.querySelector("#lista_documentos")?.children.length) { const eb = document.getElementById("executarIA"); if (eb && visivel(eb) && !eb.disabled) break; }      // SEEU: PDF já aparece na lista e o Executar está liberado
          if ((await fecharAvisos(3)) === "captcha") return falha("O Agaia pediu uma verificação (conta na imagem), que precisa de uma pessoa.", { verificacao: true });
          const msg = mensagens().find((t) => /erro|inv[aá]lid|n[aã]o foi poss[ií]vel|tamanho m[aá]ximo|n[aã]o suportad/i.test(t)); if (msg) return falha(msg);
          await dorme(1000);
        }
        if (!caixa && !p.seeu) return falha("o Agaia não terminou de extrair o texto do PDF");
        if (caixa) {      // no SEEU a caixa pode nem existir (basta adicionar o PDF e executar)
          if (!p.aceiteSigilo) return falha("o Agaia pede a sua concordância com o texto extraído (LGPD) e ela não foi autorizada na esteira");
          if (!caixa.checked) caixa.click();
          await dorme(600);
          prog("caixa de concordância " + (caixa.checked ? "marcada" : "NÃO marcada") + (caixa.isConnected ? "" : " (elemento saiu da tela)"));
        }
      } else {
      // entrada: integração ao PROJUDI (lista os movimentos do processo)
      prog("lendo os movimentos do processo no Projudi");
      const radio = document.getElementById("tipo_movimentos") || [...document.querySelectorAll("input[type=radio][name=tipo]")].find((r) => r.value === "movimentos");
      if (!radio) return falha("não achei a opção “Através da integração ao PROJUDI” no Agaia");
      radio.click();
      const achouLista = await esperar(() => movimentos().length || sigilo() || mensagens().find((t) => !/Confirma/i.test(t)), 90000);
      if (!movimentos().length) return sigilo() ? falhaSigilo(sigilo()) : falha(mensagens()[0] || (achouLista ? String(achouLista) : "o Agaia não listou os movimentos do processo"));
      // todos os movimentos com arquivo, um a um (nunca pelo botão “Todos”)
      const lista = movimentos().filter((c) => !c.disabled);
      prog(`marcando ${lista.length} movimentos`);
      for (const c of lista) { if (!c.checked) c.click(); }
      await dorme(500);
      var marcados = movimentos().filter((c) => c.checked).length;
      if (!marcados) return falha("nenhum movimento do processo pôde ser marcado no Agaia");
      }
      // executar
      const botao = await esperar(() => { const b = document.getElementById("executarIA"); return b && visivel(b) && !b.disabled ? b : [...document.querySelectorAll("button")].find((x) => /^\s*Executar\s*$/i.test(texto(x)) && visivel(x) && !x.disabled); }, 30000);
      if (!botao) return falha("o botão Executar do Agaia não ficou disponível" + (mensagens()[0] ? ": " + mensagens()[0] : ""));
      prog("executando no Agaia");
      botao.click();
      const t0 = Date.now(); let rodou = false, ultimoAviso = "", estavel = 0, ultimoTam = -1, semSinal = 0; let confirmou = 0, recliques = 0, avisoFechado = false;
      while (Date.now() - t0 < p.limiteMs) {
        await dorme(1000);
        const modal = modalAberto();
        if (modal) {
          const t = texto(modal);
          if (/Digite o resultado exibido|exibido na imagem|captcha|n[aã]o sou um rob/i.test(t)) return falha("O Agaia pediu uma verificação (conta na imagem), que precisa de uma pessoa: " + t.slice(0, 300), { verificacao: true });
          const ok = [...modal.querySelectorAll("button")].find((b) => /^\s*(Sim,? continuar|Confirmar|Continuar|Sim|OK)\s*$/i.test(texto(b)) && visivel(b) && !b.disabled);
          if (ok && /Confirma[cç][aã]o de execu[cç][aã]o|deseja continuar/i.test(t)) {
            // às vezes o Agaia mostra esta confirmação de novo no FIM da execução e ela não some depois do “Sim, continuar”: aí é preciso fechá-la no “X”, senão o resultado nunca é entregue
            prog("confirmando a execução"); ok.click(); confirmou++; await dorme(800);
            const ainda = modalAberto();
            if (ainda && confirmou >= 2) fecharModal(ainda);
            if (!temResultado()) continue;      // sem resultado ainda: segue esperando; com resultado: cai na entrega abaixo, mesmo com o aviso aberto
          } else if (ok && sigiloTolerado) { prog("fechando aviso do Agaia"); ok.click(); avisoFechado = true; await dorme(800); }      // aviso informativo (“OK”): clica e segue até o fim da execução
          else if (!ok) { ultimoAviso = t.slice(0, 500); }
        }
        if (executando()) { rodou = true; semSinal = 0; prog("o Agaia está processando"); continue; }
        if (temResultado()) {
          // a jurisprudência pode continuar sendo anexada: espera o texto parar de crescer
          const tam = textoResultado().length;
          const status = document.getElementById("jurisprudencia_execucao_status");
          const buscando = status && visivel(status) && /Buscando jurisprud/i.test(texto(status));
          if (tam === ultimoTam) estavel++; else { estavel = 0; ultimoTam = tam; }
          if (estavel >= (buscando ? 30 : 6)) {
            return { ok: true, minutaHtml: resultado().innerHTML, minutaTexto: resultado().innerText.trim(), aproximado: pr.aproximado, prompt: pr.escolhido, movimentos: marcados || 0 };
          }
          continue;
        }
        // fechou um aviso e a execução não começou: clica em Executar de novo (no máximo 2 vezes)
        if (avisoFechado && recliques < 2) { const b2 = document.getElementById("executarIA") || botao; if (b2 && visivel(b2) && !b2.disabled && !modalAberto()) { prog("clicando em Executar de novo"); b2.click(); recliques++; avisoFechado = false; semSinal = 0; continue; } }
        // nada rodando e sem resultado: aviso do Agaia (erro) ou demora para começar
        if (sigilo()) return falhaSigilo(sigilo());
        const ms = mensagens(); if (ms.length) ultimoAviso = ms[0];
        semSinal++;
        if (naTelaDeLogin()) return falha("O Agaia pediu login (sessão expirada). Entre no Agaia e continue a fila.", { sessao: true });
        if (ultimoAviso && semSinal >= 4) return falha(ultimoAviso);
        if (rodou && semSinal >= 8) return falha(ultimoAviso || "o Agaia terminou sem devolver o resultado");
        if (!rodou && semSinal >= 60) return falha(ultimoAviso || "o Agaia não iniciou a execução");
      }
      return falha("o Agaia não terminou no tempo previsto" + (ultimoAviso ? " (" + ultimoAviso + ")" : ""));
    } catch (e) { return falha("falha da extensão no Agaia: " + String(e?.message || e)); }
  }

  chrome.runtime.onMessage.addListener((m, s, responder) => {
    if (m?.acao === "agaia-parte") {      // partes do PDF do processo (modo sigiloso com PDF)
      try {
        const bin = atob(m.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const a = ((window.__agaiaArq ||= {})[m.id] ||= { partes: [], n: m.n }); a.partes[m.i] = u8; responder({ ok: true });
      } catch (e) { responder({ ok: false, erro: String(e?.message || e) }); }
      return false;
    }
    if (m?.acao === "agaia-opcoes") {      // nomes dos prompts do formulário (para o Studio mostrar a escolha); não executa nada
      esperar(() => selectPrompt() || naTelaDeLogin(), 30000).then(() => {
        if (naTelaDeLogin()) return responder({ ok: false, sessao: true, erro: "O Agaia pediu login (sessão expirada). Entre no Agaia e tente de novo." });
        const sel = selectPrompt(); if (!sel) return responder({ ok: false, erro: "O Agaia não abriu o formulário de execução" + (mensagens()[0] ? ": " + mensagens()[0] : ".") });
        responder({ ok: true, opcoes: [...sel.options].filter((o) => o.value && !/selecione/i.test(o.text)).map((o) => o.text.replace(/\s+/g, " ").trim()) });
      });
      return true;
    }
    if (m?.acao === "agaia-ping") { responder({ ok: true, pronto: !!formularioAgaia() }); return false; }
    if (m?.acao === "agaia-executar") {
      if (window.__agaiaOcupado) { responder({ ok: false, erro: "a aba do Agaia já está executando outro processo" }); return false; }
      window.__agaiaOcupado = true;
      executar({ limiteMs: 25 * 60000, ...m }).then((r) => chrome.storage.local.set({ ["agaia_res_" + m.reqId]: r })).finally(() => { window.__agaiaOcupado = false; });
      responder({ ok: true, assincrono: true }); return false;
    }
    return false;
  });
})();
