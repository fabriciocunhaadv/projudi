// Leitura da minuta que o assessor escreveu na pré-análise (botão Visualizar da Busca de Pré-Análises). Mesma lógica usada pela fila de download (lote.js),
// aqui disponível também para a esteira (processos já baixados).
const BASE = "https://projudi.tjgo.jus.br/";
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
function carregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ou); ok(false); }, ms);
    const ou = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ou); ok(true); } };
    chrome.tabs.onUpdated.addListener(ou);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") ou(tabId, { status: "complete" }); }).catch(() => {});
  });
}

const lerEditor = (tabId) => chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: () => {
  try {
    const ck = window.CKEDITOR; if (ck && ck.instances) { const n = Object.keys(ck.instances)[0]; if (n) return ck.instances[n].getData(); }
    if (window.tinymce && window.tinymce.activeEditor) return window.tinymce.activeEditor.getContent();
    const fixo = document.getElementById("divTextoEditor");      // tela “Texto Pré-Análise”: a minuta já escrita fica em HTML fixo (não é um editor)
    if (fixo && fixo.innerText && fixo.innerText.trim().length > 20) return fixo.innerHTML;
  } catch (e) { /* sem editor neste quadro */ }
  return null;
} }).catch(() => []);
function htmlParaTexto(html) {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote").forEach((e) => e.append("\n"));
  d.querySelectorAll("img,hr").forEach((e) => e.remove());
  let t = d.body.textContent.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // a minuta começa no título do ato; o que vem antes é o timbre do gabinete e a identificação das partes
  const ini = t.search(/^(DESPACHO|DECIS[ÃA]O( INTERLOCUT[ÓO]RIA)?|SENTEN[ÇC]A)\s*$/m);
  if (ini > 0 && t.slice(0, ini).split("\n").length < 25) t = t.slice(ini);
  return t;
}
export async function lerMinutaPre(item) {
  const digitos = String(item.processo).replace(/\D/g, "").slice(0, 9), novas = [];
  const aoCriar = (t) => novas.push(t.id); chrome.tabs.onCreated.addListener(aoCriar);
  const tab = await chrome.tabs.create({ url: BASE + "PreAnalisarConclusao?PaginaAtual=6&tipo=todas", active: false });
  const motivo = { m: "" };
  try {
    // As listas do Projudi são da serventia ativa NA SESSÃO (e a verificação deixa a sessão na última serventia lida): escolhe a do processo antes.
    if (item.serventiaUrl) {
      await chrome.tabs.update(tab.id, { url: new URL(item.serventiaUrl, BASE).href }); await dorme(600);
      await carregou(tab.id); await dorme(1200);
      await chrome.tabs.update(tab.id, { url: BASE + "PreAnalisarConclusao?PaginaAtual=6&tipo=todas" }); await dorme(600);
    }
    await carregou(tab.id); await dorme(1500);
    const clicar = (alvo) => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", args: [alvo], func: (dig) => {
      // O Visualizar chama submeter2(...) e o Projudi abre o editor em NOVA aba; sem clique do usuário o Chrome bloquearia esse pop-up.
      // Nesta aba (só nela) o envio passa a abrir na própria aba, e a extensão lê o editor aqui mesmo.
      if (!window.__projudiMesmaAba) {
        window.__projudiMesmaAba = true;
        const sub = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { this.target = "_self"; return sub.call(this); };
        const rs = HTMLFormElement.prototype.requestSubmit; if (rs) HTMLFormElement.prototype.requestSubmit = function (...a) { this.target = "_self"; return rs.apply(this, a); };
        document.addEventListener("submit", (e) => { if (e.target && e.target.tagName === "FORM") e.target.target = "_self"; }, true);
        const abrir = window.open; window.open = function (u) { if (u) { location.href = u; return window; } return abrir.apply(this, arguments); };
      }
      const linhas = [...document.querySelectorAll("tr")].filter((tr) => tr.querySelector("a[href*='Id_Processo']"));
      const tr = linhas.find((r) => [...r.querySelectorAll("a[href*='Id_Processo']")].some((a) => (a.textContent || "").replace(/\D/g, "").slice(0, 9) === dig));
      if (!tr) return linhas.length ? "linhas:" + linhas.length : "";
      const b = tr.querySelector("button[title='Visualizar'],a[title='Visualizar'],[title='Visualizar']") || tr.querySelector("button.imgIcons");
      if (!b) return "sem-botao"; b.click(); return "clicou";
    } }).then((r) => r.map((x) => x.result).find((x) => x === "clicou" || x === "sem-botao") || r.map((x) => x.result).find(Boolean) || "").catch(() => "");
    // a lista pode demorar a carregar: tenta por até ~30 s; no meio do caminho aperta “Consultar” uma vez (a lista pode vir vazia até isso)
    let r = "", viuLinhas = 0, consultou = false;
    for (let k = 0; k < 30 && r !== "clicou" && r !== "sem-botao"; k++) {
      r = await clicar(digitos);
      if (/^linhas:/.test(r)) viuLinhas = +r.split(":")[1];
      if (r !== "clicou" && r !== "sem-botao") {
        if (k === 8 && !consultou) { consultou = true; await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => document.getElementById("formLocalizarBotao")?.click() }).catch(() => {}); }
        await dorme(1000);
      }
    }
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    if (r === "sem-botao") { motivo.m = "não achei o botão Visualizar na linha do processo"; return { texto: "", motivo: motivo.m }; }
    if (r !== "clicou") { motivo.m = `o processo não apareceu na Busca de Pré-Análises (a lista tinha ${viuLinhas} linha(s); página: “${(t && t.title || "").slice(0, 60)}”)`; return { texto: "", motivo: motivo.m }; }
    for (let k = 0; k < 40; k++) {      // o editor abre na mesma aba ou em outra
      await dorme(1000);
      for (const id of [tab.id, ...novas]) {
        const html = (await lerEditor(id)).map((x) => x.result).filter(Boolean).sort((a, b) => b.length - a.length)[0];
        if (html) { const t = htmlParaTexto(html); if (t) return { texto: t, motivo: "" }; }
      }
    }
    return { texto: "", motivo: "cliquei em Visualizar, mas não achei o editor com a minuta (ou ele está vazio)" };
  } finally {
    chrome.tabs.onCreated.removeListener(aoCriar);
    for (const id of [tab.id, ...novas]) chrome.tabs.remove(id).catch(() => {});
  }
}

