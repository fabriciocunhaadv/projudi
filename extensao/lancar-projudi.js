// "Lançar no Projudi": do botão flutuante da minuta do Studio até o editor da pré-análise, com o PDF dos autos ao lado.
// Roda no service worker (importScripts em background.js). Fluxo:
//   1. janelas lado a lado: Projudi (a aba que o usuário já deixou aberta, NUNCA uma aba nova) à esquerda, PDF dos autos à direita;
//   2. leva a aba à tela “Pré-Analisar Autos Conclusos” do processo (se ela já estiver nessa tela, não navega);
//   3. escolhe Tipo de Arquivo (Despacho / Decisão / Sentença) e Modelo “<Tipo> Padrão”;
//   4. coloca a minuta no editor, no lugar do texto-padrão do modelo (cabeçalho e assinatura do modelo ficam).
// NÃO grava nada no Projudi: o usuário confere e clica em “Salvar Texto Parcial”.
const LP_BASE = "https://projudi.tjgo.jus.br/";
const SEM_MOLDURA = "a aba do Projudi está sem o cabeçalho e os menus (tela solta) e não consegui voltar ao início: clique em “Página Inicial” no Projudi e tente de novo";
const lpDorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
const lpSem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const lpChave = (p) => { const m = String(p || "").match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/); return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : String(p || "").replace(/\D/g, "").slice(0, 9); };

/** Tipo do ato (nome do arquivo no Projudi) pelo TÍTULO do ato: o rótulo do card do Studio ou a primeira linha curta que seja só o título (DESPACHO / DECISÃO… / SENTENÇA…).
 *  NUNCA pela palavra solta no corpo: uma decisão em cumprimento de sentença fala em “sentença” e não é sentença. Decisão interlocutória ou saneadora = “Decisão”. Sem título claro: null (não adivinha). */
function lpTipoDeTitulo(linha) {
  const t = lpSem(linha).toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 60) return null;
  if (/^SENTENCA( |$)/.test(t)) return "Sentença";
  if (/^DESPACHO( |$)/.test(t)) return "Despacho";
  if (/^DECISAO( |$)/.test(t)) return "Decisão";
  return null;
}
function lpTipoDoAto(texto, tituloAto) {
  const doCard = lpTipoDeTitulo(tituloAto || "");
  if (doCard) return doCard;
  const linhas = String(texto || "").split(/\n+/).slice(0, 40);
  for (const l of linhas) { const t = lpTipoDeTitulo(l.replace(/^#+\s*/, "").replace(/\*+/g, "")); if (t) return t; }
  return null;
}

// ---------- funções que rodam DENTRO da página do Projudi (autossuficientes: são serializadas por executeScript) ----------

/** Está nesta página a tela “Pré-Analisar Autos Conclusos” deste processo? */
function lpNaPaginaPreAnalise(chave) {
  const t = (document.body && document.body.innerText) || "";
  if (!/Pr[ée]-Analisar Autos Conclusos/i.test(t)) return false;
  const dig = t.replace(/\D/g, "");
  return !!chave && dig.includes(chave);
}

/** Na lista de conclusos, aperta “Pré-Analisar” da linha do processo. A abertura do editor passa a ser na própria aba (um pop-up sem clique do usuário seria bloqueado). */
function lpClicarPreAnalisar(chave) {
  if (!window.__projudiMesmaAba) {
    window.__projudiMesmaAba = true;
    const sub = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { this.target = "_self"; return sub.call(this); };
    const rs = HTMLFormElement.prototype.requestSubmit; if (rs) HTMLFormElement.prototype.requestSubmit = function (...a) { this.target = "_self"; return rs.apply(this, a); };
    document.addEventListener("submit", (e) => { if (e.target && e.target.tagName === "FORM") e.target.target = "_self"; }, true);
    const abrir = window.open; window.open = function (u) { if (u) { location.href = u; return window; } return abrir.apply(this, arguments); };
  }
  const ch = (s) => { const t = String(s || ""), m = t.match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/); return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : t.replace(/\D/g, "").slice(0, 9); };
  const linhas = [...document.querySelectorAll("tr")].filter((tr) => tr.querySelector("a[href*='Id_Processo']"));
  const tr = linhas.find((r) => [...r.querySelectorAll("a[href*='Id_Processo']")].some((a) => ch(a.textContent) === chave));
  if (!tr) return linhas.length ? "linhas:" + linhas.length : "";
  const b = tr.querySelector("button[title='Pré-Analisar'],button[title='Pre-Analisar'],a[title='Pré-Analisar'],[title='Pré-Analisar'],[title='Visualizar']");
  if (!b) return "sem-botao"; b.click(); return "clicou";
}

/** Campo do rótulo (Tipo de Arquivo / Modelo) e o que fazer com ele: "estado" (existe? valor atual), "sugestao" (digita e clica na sugestão), "lupa" (clica na lupa do campo; a tela pode NAVEGAR),
 *  "modal" (a lupa abriu uma janela de busca sobre a tela: filtra e escolhe a linha). Roda só no quadro principal. */
async function lpCampoAcao(rotulo, valor, acao) {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const esp = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const visivel = (e) => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
  const quer = sem(valor);
  const bate = (t) => { const x = sem(t); return x === quer || x.startsWith(quer + " ") ? 2 : x.includes(quer) ? 1 : 0; };
  const clicar = (e) => { for (const tipo of ["mousedown", "mouseup", "click"]) e.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window })); };
  const rotulos = [...document.querySelectorAll("label,td,th,span,div,b,strong,p")].filter((e) => visivel(e) && e.children.length < 6 && sem(e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.nodeValue : e.textContent).startsWith(sem(rotulo)));
  const entradas = [...document.querySelectorAll("input")].filter((i) => !/^(hidden|checkbox|radio|button|submit)$/i.test(i.type) && visivel(i));
  let campo = null, rot = null, melhorD = Infinity;
  for (const r of rotulos) {      // o campo do rótulo é o <input> mais próximo logo depois dele (descarta itens de menu com o mesmo nome)
    const f = r.getAttribute && r.getAttribute("for"); if (f && document.getElementById(f)) { campo = document.getElementById(f); rot = r; break; }
    const rb = r.getBoundingClientRect(), exato = sem(r.textContent) === sem(rotulo) ? 0 : 40;
    for (const i of entradas) {
      if (!(r.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING) && !r.contains(i)) continue;
      const ib = i.getBoundingClientRect(), dy = ib.top - rb.top; if (dy < -12) continue;
      const d = Math.abs(dy) * 3 + Math.abs(ib.left - rb.right) + exato; if (d < melhorD) { melhorD = d; campo = i; rot = r; }
    }
  }
  if (!campo) return { ok: false, achou: false, motivo: `não achei o campo “${rotulo}” na tela` };
  if (acao === "estado") return { ok: true, achou: true, valor: campo.value, travado: !!(campo.disabled || campo.readOnly), confere: bate(campo.value) > 0 };
  const setar = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  if (acao === "sugestao") {
    try {
      campo.focus(); setar(campo, valor);
      for (const t of ["keydown", "keypress", "keyup"]) campo.dispatchEvent(new KeyboardEvent(t, { bubbles: true, key: "a" }));
      try { const $ = window.jQuery || window.$; if ($ && $(campo).autocomplete) $(campo).autocomplete("search", valor); } catch (e) { /* sem jQuery UI */ }
      for (let k = 0; k < 14; k++) {
        await esp(250);
        const itens = [...document.querySelectorAll(".ui-autocomplete li, .ui-menu-item, ul[role=listbox] li, .autocomplete-suggestion, .autocomplete-items div")].filter(visivel);
        const melhor = itens.map((e) => [bate(e.textContent), e]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0])[0];
        if (melhor) { clicar(melhor[1].querySelector("a,div") || melhor[1]); await esp(500); if (bate(campo.value) > 0) return { ok: true, via: "sugestão" }; break; }
      }
    } catch (e) { /* cai na lupa */ }
    try { setar(campo, ""); } catch (e) { /* nada */ }      // o texto digitado por nós não vale (o Projudi grava o código escolhido): limpa
    return { ok: false, semSugestao: true, motivo: `“${rotulo}” não mostrou sugestões` };
  }
  if (acao === "lupa") {
    const caixa = (rot && (rot.closest("tr,fieldset,div") || rot.parentElement)) || document.body;
    const lupa = [...caixa.querySelectorAll("i,img,a,button,span")].find((e) => /magnif|search|lupa|pesquis|buscar|localizar/i.test(String((e.className && e.className.baseVal) || e.className || "") + " " + (e.getAttribute("title") || "") + " " + (e.getAttribute("alt") || "") + " " + (e.getAttribute("src") || "")));
    if (!lupa) return { ok: false, motivo: `não achei a lupa do campo “${rotulo}”` };
    const alvo = lupa.closest("a,button") || lupa;
    setTimeout(() => clicar(alvo), 60);      // o clique pode trocar a tela: devolve antes
    return { ok: true, clicou: true };
  }
  if (acao === "modal") {
    const modal = [...document.querySelectorAll("#busca_padrao, .modalBusca")].find(visivel);
    if (!modal) return { ok: false, semModal: true };
    const filtro = modal.querySelector("#busca_padrao_campos input[type=text], input[type=text]"); if (filtro) { filtro.focus(); setar(filtro, valor); }
    const consultar = modal.querySelector("#busca_padraoLocalizar, input[value=Consultar], button"); if (consultar) clicar(consultar);
    for (let k = 0; k < 30; k++) {
      await esp(300);
      const linhas = [...modal.querySelectorAll("#divTabelaBuscaPadrao tr, table tr")].filter((tr) => tr.querySelector("td"));
      const melhor = linhas.map((tr) => [bate(tr.textContent), tr]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0])[0];
      if (melhor) { clicar(melhor[1].querySelector("a,button,input[type=radio],input[type=checkbox]") || melhor[1].querySelector("td")); await esp(800); return { ok: true, via: "janela de busca", confere: bate(campo.value) > 0 }; }
    }
    return { ok: false, motivo: `a busca de “${rotulo}” não trouxe “${valor}”` };
  }
  return { ok: false, motivo: "ação desconhecida" };
}

/** A tela atual é uma página de busca (“… Busca de Modelo”, com o botão Consultar) ou há janela de busca sobre a tela? */
function lpEstadoDaTela() {
  const visivel = (e) => !!e && e.getBoundingClientRect().width > 0;
  const topo = ((document.body && document.body.innerText) || "").slice(0, 700);
  const temConsultar = [...document.querySelectorAll("button,input[type=submit],input[type=button],a")].some((e) => /^consultar$/i.test((e.value || e.textContent || "").trim()) && visivel(e));
  return { busca: /Busca de\s+\S+/i.test(topo) && temConsultar, modal: !![...document.querySelectorAll("#busca_padrao, .modalBusca")].find(visivel), carregando: document.readyState !== "complete" };
}

/** Página de busca de modelo: fase "consultar" (digita o nome e aperta Consultar) e fase "selecionar" (na linha do modelo, aperta “Selecionar” — nunca “Excluir”). A tela pode recarregar entre as fases. */
async function lpBuscaDeModelo(fase, valor, tipoNome) {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const visivel = (e) => !!e && e.getBoundingClientRect().width > 0;
  const clicar = (e) => { for (const tipo of ["mousedown", "mouseup", "click"]) e.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window })); };
  const quer = sem(valor), bate = (t) => { const x = sem(t); return x === quer ? 3 : x.startsWith(quer + " ") ? 2 : x.includes(quer) ? 1 : 0; };
  if (fase === "consultar") {
    const entrada = [...document.querySelectorAll("input[type=text],input:not([type])")].filter(visivel)[0];
    if (!entrada) return { ok: false, motivo: "não achei o campo de busca do modelo" };
    entrada.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(entrada, valor); entrada.dispatchEvent(new Event("input", { bubbles: true }));
    const botao = [...document.querySelectorAll("button,input[type=submit],input[type=button],a")].find((e) => /^consultar$/i.test((e.value || e.textContent || "").trim()) && visivel(e));
    if (!botao) return { ok: false, motivo: "não achei o botão Consultar" };
    setTimeout(() => clicar(botao), 60);
    return { ok: true, clicou: true };
  }
  // selecionar: colunas pelo cabeçalho (Id | Modelo | Serventia | Tipo Modelo | Selecionar | Excluir)
  const linhas = [...document.querySelectorAll("tr")];
  const cab = linhas.find((tr) => /selecionar/i.test(tr.textContent) && /modelo/i.test(tr.textContent) && !tr.querySelector("input[type=text]"));
  const nomes = cab ? [...cab.children].map((c) => sem(c.textContent)) : [];
  const iNome = nomes.findIndex((n) => n === "modelo"), iTipo = nomes.findIndex((n) => /tipo/.test(n)), iSel = nomes.findIndex((n) => /selecionar/.test(n));
  const dados = linhas.filter((tr) => tr !== cab && tr.children.length >= 3 && tr.querySelector("td") && !tr.querySelector("input[type=text]"));
  const pontos = dados.map((tr) => { const c = [...tr.children]; const nome = iNome >= 0 ? c[iNome]?.textContent : tr.textContent, tp = iTipo >= 0 ? c[iTipo]?.textContent : ""; return [bate(nome) * 10 + (tipoNome && sem(tp).includes(sem(tipoNome)) ? 5 : 0), tr]; }).filter((x) => x[0] >= 10).sort((a, b) => b[0] - a[0]);
  if (!pontos.length) return { ok: false, semLinhas: true, linhas: dados.length };
  const tr = pontos[0][1], c = [...tr.children];
  const controles = (raiz) => [...raiz.querySelectorAll("button,a,img,i,input[type=button],input[type=image],[onclick]")];
  const cand = (iSel >= 0 && c[iSel] ? controles(c[iSel]) : []).concat(controles(tr).filter((e) => /selecionar/i.test((e.getAttribute("title") || "") + " " + (e.getAttribute("alt") || "") + " " + (e.value || e.textContent || ""))));
  const seguro = cand.filter((e) => !/excluir|apagar|remover|delete|trash/i.test((e.getAttribute("title") || "") + " " + (e.getAttribute("alt") || "") + " " + (e.getAttribute("class") || "") + " " + (e.getAttribute("onclick") || "") + " " + (e.textContent || "")));
  const alvo = seguro[0] || (iSel >= 0 && c[iSel] && !/excluir/i.test(c[iSel].textContent) ? c[iSel] : null);
  if (!alvo) return { ok: false, motivo: "não achei o botão Selecionar na linha do modelo", linha: tr.textContent.replace(/\s+/g, " ").slice(0, 120) };
  setTimeout(() => clicar(alvo.closest("a,button") || alvo), 60);
  return { ok: true, clicou: true, linha: tr.textContent.replace(/\s+/g, " ").trim().slice(0, 120), candidatas: pontos.filter((x) => x[0] === pontos[0][0]).length };
}

/** Lê o HTML do editor (CKEditor/TinyMCE) deste quadro, ou null. */
function lpLerEditor() {
  try {
    const ck = window.CKEDITOR; if (ck && ck.instances) { const n = Object.keys(ck.instances)[0]; if (n) return ck.instances[n].getData(); }
    if (window.tinymce && window.tinymce.activeEditor) return window.tinymce.activeEditor.getContent();
  } catch (e) { /* sem editor aqui */ }
  return null;
}

/** Coloca a minuta no editor: depois do título do ato (DESPACHO/DECISÃO/SENTENÇA) do modelo, no lugar do texto-padrão que vai até a linha de assinatura “..., data do sistema”. */
function lpInserirNoEditor(minutaHtml, minutaTexto) {
  let ed = null, tipo = "";
  try {
    const ck = window.CKEDITOR; if (ck && ck.instances) { const n = Object.keys(ck.instances)[0]; if (n) { ed = ck.instances[n]; tipo = "ckeditor"; } }
    if (!ed && window.tinymce && window.tinymce.activeEditor) { ed = window.tinymce.activeEditor; tipo = "tinymce"; }
  } catch (e) { /* nada */ }
  if (!ed) return { ok: false, naoEditor: true };
  const atual = tipo === "ckeditor" ? ed.getData() : ed.getContent();
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const TITULO = /^(despacho|decisao( interlocutoria)?|decisao saneadora|sentenca)$/;
  const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // a minuta como parágrafos formatados (sem o título do ato, que o modelo já traz)
  const box = new DOMParser().parseFromString("<body>" + (minutaHtml || minutaTexto.split(/\n+/).map((l) => (/^#{1,6}\s/.test(l) ? "<h3>" + esc(l.replace(/^#{1,6}\s+/, "")) + "</h3>" : "<p>" + esc(l.replace(/\*\*/g, "")) + "</p>")).join("")) + "</body>", "text/html").body;
  const filhos = [...box.children];
  const ehTitulo = (e) => { const t = sem(e.textContent); return t.length > 0 && t.length <= 60 && /^(despacho|decisao|sentenca)( |$)/.test(t); };
  const iTit = filhos.findIndex(ehTitulo);
  if (iTit >= 0 && iTit <= 8) { for (let k = 0; k <= iTit; k++) filhos[k].remove(); }      // cabeçalho do Studio (“PODER JUDICIÁRIO…”) e título do ato: o modelo do Projudi já traz os dele
  else while (box.firstElementChild && (!sem(box.firstElementChild.textContent) || TITULO.test(sem(box.firstElementChild.textContent)))) box.firstElementChild.remove();
  const fonte = "font-family:'Times New Roman',serif;font-size:12pt;";
  const novos = [...box.children].map((e) => {
    const t = e.tagName.toLowerCase(), txt = e.innerHTML;
    if (/^h[1-6]$/.test(t)) return `<p style="${fonte}text-align:left"><strong>${txt}</strong></p>`;
    if (t === "blockquote") return `<p style="${fonte}text-align:justify;margin-left:4cm"><em>${e.textContent.trim()}</em></p>`;
    if (/^(ul|ol)$/.test(t)) return e.outerHTML;
    return `<p style="${fonte}text-align:justify;text-indent:2.5cm">${txt}</p>`;
  }).join("");
  const doc = new DOMParser().parseFromString("<body>" + atual + "</body>", "text/html"), corpo = doc.body;
  const itens = [...corpo.children];
  const ti = itens.findIndex((e) => TITULO.test(sem(e.textContent)));
  const fim = itens.findIndex((e, i) => i > ti && /data (do|da) sistema/.test(sem(e.textContent)));
  let removidos = 0;
  if (ti >= 0) {
    if (fim > ti && fim - ti - 1 <= 12) { for (let i = ti + 1; i < fim; i++) { itens[i].remove(); removidos++; } }      // texto-padrão do modelo (ex.: “I.C.”, “Atenda-se.”)
    itens[ti].insertAdjacentHTML("afterend", novos);
  } else corpo.insertAdjacentHTML("beforeend", novos);
  const final = corpo.innerHTML;
  if (tipo === "ckeditor") { ed.fire && ed.fire("saveSnapshot"); ed.setData(final); ed.updateElement && ed.updateElement(); }
  else { ed.undoManager && ed.undoManager.transact(() => ed.setContent(final)); ed.save && ed.save(); ed.fire && ed.fire("change"); }
  return { ok: true, tipo, tituloAchado: ti >= 0, removidos, assinaturaAchada: fim > ti && ti >= 0 };
}

// ---------- orquestração (service worker) ----------
const lpScript = (tabId, func, args = [], allFrames = true) => chrome.scripting.executeScript({ target: { tabId, allFrames }, world: "MAIN", func, args }).then((r) => r.map((x) => x.result)).catch(() => []);
function lpCarregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ou); ok(false); }, ms);
    const ou = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ou); ok(true); } };
    chrome.tabs.onUpdated.addListener(ou);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") ou(tabId, { status: "complete" }); }).catch(() => {});
  });
}

async function lpAchaItem(processo) {
  const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
  const dados = await chrome.storage.local.get(esteira_ordem.map((i) => "esteira_" + i));
  const chave = lpChave(processo);
  const lista = esteira_ordem.map((i) => dados["esteira_" + i]).filter((x) => x && lpChave(x.processo) === chave);
  return lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))[0] || null;
}
function lpTemPdf(id) {
  return new Promise((ok) => { const r = indexedDB.open("projudi_esteira", 1); r.onerror = () => ok(false); r.onupgradeneeded = () => { r.transaction.abort(); ok(false); };
    r.onsuccess = () => { try { const g = r.result.transaction("pdf").objectStore("pdf").count(id); g.onsuccess = () => { r.result.close(); ok(g.result > 0); }; g.onerror = () => ok(false); } catch (e) { ok(false); } }; });
}

/** Acha a aba do Projudi que já está aberta: de preferência a que já está na pré-análise deste processo; senão a primeira não fixada. Nunca cria aba nova (derrubaria a sessão). */
async function lpAcharAba(chave) {
  const abertas = await chrome.tabs.query({ url: LP_BASE + "*" }).catch(() => []);
  for (const t of abertas) { if ((await lpScript(t.id, lpNaPaginaPreAnalise, [chave])).some(Boolean)) return { tab: t, jaNaTela: true }; }
  const tab = abertas.find((t) => !t.pinned) || abertas[0] || null;
  return { tab, jaNaTela: false };
}

/** Projudi à esquerda, PDF à direita (metade da área útil da tela cada). */
async function lpJanelas(tab, item) {
  const tela = (await lpScript(tab.id, () => ({ l: screen.availLeft || 0, t: screen.availTop || 0, w: screen.availWidth, h: screen.availHeight }), [], false)).find(Boolean);
  if (!tela) return { pdf: false, aviso: "não consegui medir a tela para dividir as janelas" };
  const metade = Math.floor(tela.w / 2);
  await chrome.windows.update(tab.windowId, { state: "normal", left: tela.l, top: tela.t, width: metade, height: tela.h, focused: false }).catch(() => {});
  if (!item || !(await lpTemPdf(item.id))) return { pdf: false, aviso: "o PDF deste processo não está guardado pela extensão (só processos enviados pela esteira); abri só o Projudi" };
  const url = chrome.runtime.getURL("pdf-lado.html?id=" + encodeURIComponent(item.id));
  const dim = { left: tela.l + metade, top: tela.t, width: tela.w - metade, height: tela.h };
  const { lancar_pdf_janela: antiga } = await chrome.storage.local.get("lancar_pdf_janela");
  let janela = null;
  if (antiga) { janela = await chrome.windows.get(antiga, { populate: true }).catch(() => null); }
  if (janela) { await chrome.windows.update(janela.id, { ...dim, state: "normal", focused: false }).catch(() => {}); if (janela.tabs && janela.tabs[0]) await chrome.tabs.update(janela.tabs[0].id, { url }).catch(() => {}); }
  else { janela = await chrome.windows.create({ url, type: "popup", focused: false, ...dim }).catch(() => null); if (janela) await chrome.storage.local.set({ lancar_pdf_janela: janela.id }); }
  return { pdf: !!janela, aviso: janela ? "" : "não consegui abrir a janela do PDF" };
}

/** Executa `func` só no quadro do CONTEÚDO (o "Principal" da moldura do Projudi; sem moldura, a própria página): outro quadro sem o campo devolveria um "não achei" que esconderia o resultado certo. Se a tela navegar no meio, devolve null. */
const lpPrincipal = async (tab, func, args = []) => (await ProjudiQuadro.executar(tab.id, func, args, await ProjudiQuadro.frameDoConteudo(tab.id))).map((x) => x.result).find((x) => x && typeof x === "object") || null;

/** Escolhe o valor de um campo de busca do Projudi: sugestão ao digitar → lupa. A lupa pode abrir uma janela de busca sobre a tela OU navegar a própria aba para uma página de busca
 *  (“Busca de Modelo”): nos dois casos a extensão acompanha, escolhe a linha e espera a tela do formulário voltar. */
async function lpEscolher(tab, rotulo, valor, chave, tipoNome) {
  let e = null; for (let k = 0; k < 12 && !(e && e.achou); k++) { e = await lpPrincipal(tab, lpCampoAcao, [rotulo, valor, "estado"]); if (!(e && e.achou)) await lpDorme(500); }
  if (!(e && e.achou)) return { ok: false, motivo: `não achei o campo “${rotulo}” na tela` };
  if (e.confere) return { ok: true, via: "já estava" };
  for (let k = 0; k < 40 && e.travado; k++) { await lpDorme(250); e = (await lpPrincipal(tab, lpCampoAcao, [rotulo, valor, "estado"])) || e; }      // o Modelo só libera depois do Tipo
  const s1 = await lpPrincipal(tab, lpCampoAcao, [rotulo, valor, "sugestao"]);
  if (s1?.ok) return s1;
  const l = await lpPrincipal(tab, lpCampoAcao, [rotulo, valor, "lupa"]);
  if (!l?.ok) return { ok: false, motivo: l?.motivo || `não consegui usar a lupa do campo “${rotulo}”` };
  for (let k = 0; k < 60; k++) {      // até ~30 s para a busca aparecer
    await lpDorme(500);
    const st = await lpPrincipal(tab, lpEstadoDaTela);
    if (!st || st.carregando) continue;
    if (st.busca) return await lpPaginaDeBusca(tab, valor, chave, tipoNome);
    if (st.modal) { const r = await lpPrincipal(tab, lpCampoAcao, [rotulo, valor, "modal"]); return r?.ok ? r : { ok: false, motivo: r?.motivo || `a janela de busca de “${rotulo}” não trouxe “${valor}”` }; }
  }
  return { ok: false, motivo: `a lupa de “${rotulo}” não abriu a busca (nem janela nem página)` };
}
async function lpPaginaDeBusca(tab, valor, chave, tipoNome) {
  const c = await lpPrincipal(tab, lpBuscaDeModelo, ["consultar", valor, tipoNome]);
  if (!c?.ok) return { ok: false, motivo: c?.motivo || "não consegui consultar na página de busca" };
  let ultimo = null;
  for (let k = 0; k < 60; k++) {      // a lista pode vir por ajax ou recarregando a página: tenta até achar a linha
    await lpDorme(700);
    const r = await lpPrincipal(tab, lpBuscaDeModelo, ["selecionar", valor, tipoNome]);
    if (r) ultimo = r;
    if (r?.ok) {
      for (let j = 0; j < 80; j++) { await lpDorme(500); if ((await lpScript(tab.id, lpNaPaginaPreAnalise, [chave])).some(Boolean)) return { ok: true, via: "página de busca", linha: r.linha, candidatas: r.candidatas }; }
      return { ok: false, motivo: "selecionei o modelo na busca, mas a tela da pré-análise não voltou" };
    }
    if (r && r.motivo && !r.semLinhas) return { ok: false, motivo: r.motivo + (r.linha ? ` (linha: ${r.linha})` : "") };
  }
  return { ok: false, motivo: `a busca não trouxe nenhum modelo chamado “${valor}”${ultimo && ultimo.linhas != null ? ` (a lista tinha ${ultimo.linhas} linha(s))` : ""}` };
}

async function lancarNoProjudi(m, abaStudio) {
  const progresso = (texto) => { if (abaStudio?.id != null) chrome.tabs.sendMessage(abaStudio.id, { acao: "lancar-progresso", texto }).catch(() => {}); };
  const processo = String(m.processo || ""), chave = lpChave(processo);
  if (!chave) return { ok: false, erro: "não achei o número do processo na minuta aberta no Studio" };
  if (!m.texto || m.texto.length < 50) return { ok: false, erro: "a minuta está vazia" };
  const tipoNome = lpTipoDoAto(m.texto, m.tituloAto);
  if (!tipoNome) return { ok: false, erro: "não consegui identificar se a minuta é despacho, decisão ou sentença (não achei o título do ato); confira o título no alto da minuta" };
  const modelo = tipoNome + " Padrão";
  const liberar = await new Promise((pronto) => { if (!navigator.locks) return pronto(() => {}); navigator.locks.request("projudi-aba", () => new Promise((fim) => pronto(() => fim()))).catch(() => pronto(() => {})); });
  try {
    const item = await lpAchaItem(processo);
    const { tab, jaNaTela } = await lpAcharAba(chave);
    if (!tab) return { ok: false, erro: "não há aba do Projudi aberta: abra e entre no Projudi (a extensão não abre aba nova para não derrubar a sessão)" };
    progresso("dividindo a tela: Projudi à esquerda e PDF à direita…");
    const jan = await lpJanelas(tab, item);
    if (!jaNaTela) {
      progresso("abrindo a pré-análise do processo no Projudi…");
      // navega DENTRO do quadro da moldura do Projudi (a aba mantém o cabeçalho e os menus)
      if (item?.serventiaUrl) { if (!(await ProjudiQuadro.irPara(tab.id, new URL(item.serventiaUrl, LP_BASE).href))) return { ok: false, erro: SEM_MOLDURA }; await lpDorme(1200); }
      if (!(await ProjudiQuadro.irPara(tab.id, LP_BASE + "PreAnalisarConclusao?PaginaAtual=2&tipo=todas"))) return { ok: false, erro: SEM_MOLDURA };
      await lpDorme(1500);
      let r = "", visto = 0;
      for (let k = 0; k < 30 && r !== "clicou" && r !== "sem-botao"; k++) {
        const rs = await lpScript(tab.id, lpClicarPreAnalisar, [chave]);
        r = rs.find((x) => x === "clicou" || x === "sem-botao") || rs.find(Boolean) || "";
        if (/^linhas:/.test(r)) visto = +r.split(":")[1];
        if (r !== "clicou" && r !== "sem-botao") await lpDorme(1000);
      }
      if (r !== "clicou") return { ok: false, erro: r === "sem-botao" ? "não achei o botão Pré-Analisar na linha do processo" : `o processo não apareceu na lista de conclusos desta serventia (a lista tinha ${visto} linha(s)); confira se a serventia ativa no Projudi é a do processo` };
      let nela = false; for (let k = 0; k < 40 && !nela; k++) { await lpDorme(1000); nela = (await lpScript(tab.id, lpNaPaginaPreAnalise, [chave])).some(Boolean); }
      if (!nela) return { ok: false, erro: "cliquei em Pré-Analisar, mas a tela de pré-análise não abriu" };
    }
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    progresso(`escolhendo o Tipo de Arquivo “${tipoNome}”…`);
    const tipo = await lpEscolher(tab, "Tipo de Arquivo", tipoNome, chave, tipoNome);
    if (!tipo.ok) return { ok: false, erro: tipo.motivo || "não consegui escolher o Tipo de Arquivo", passo: "tipo" };
    await lpDorme(800);
    progresso(`escolhendo o modelo “${modelo}”…`);
    const mod = await lpEscolher(tab, "Modelo", modelo, chave, tipoNome);
    if (!mod.ok) return { ok: false, erro: (mod.motivo || "não consegui escolher o Modelo") + ` (o tipo “${tipoNome}” já foi escolhido)`, passo: "modelo" };
    progresso("aguardando o modelo carregar no editor…");
    let carregado = false; for (let k = 0; k < 40 && !carregado; k++) { await lpDorme(500); carregado = (await lpScript(tab.id, lpLerEditor)).some((h) => h && h.replace(/<[^>]+>/g, "").trim().length > 40); }
    if (!carregado) return { ok: false, erro: `escolhi o modelo “${modelo}”, mas o texto dele não apareceu no editor`, passo: "editor" };
    progresso("colocando a minuta no editor…");
    const ins = (await lpScript(tab.id, lpInserirNoEditor, [m.html || "", m.texto])).find((x) => x && x.ok);
    if (!ins) return { ok: false, erro: "não consegui colocar a minuta no editor do Projudi", passo: "inserir" };
    const avisos = [];
    if (!ins.tituloAchado) avisos.push("não achei o título do ato no modelo: a minuta foi colocada no fim do texto");
    else if (!ins.assinaturaAchada) avisos.push("não achei a linha “..., data do sistema” no modelo: o texto-padrão do modelo foi mantido; apague o que sobrar");
    if (jan.aviso) avisos.push(jan.aviso);
    return { ok: true, tipo: tipoNome, modelo, removidos: ins.removidos, aviso: avisos.join(" · ") };
  } finally { liberar(); }
}
