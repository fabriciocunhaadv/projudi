const BASE = "https://projudi.tjgo.jus.br/";
const LISTA = BASE + "Usuario?PaginaAtual=9";
const PADRAO = { filtro: "Montes Claros", intervalo: 30, notificar: true };
let rodando = false;

const getCfg = async () => ({ ...PADRAO, ...(await chrome.storage.sync.get(PADRAO)) });

async function garantirOffscreen() {
  const ja = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (ja.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html", reasons: ["DOM_PARSER"], justification: "Ler o HTML do Projudi",
  });
}

const ler = (tipo, html) => chrome.runtime.sendMessage({ alvo: "offscreen", tipo, html });

async function baixar(url, init = {}) {
  const r = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return new TextDecoder("windows-1252").decode(await r.arrayBuffer()); // o Projudi usa LATIN1
}

const INICIO = BASE + "Usuario?PaginaAtual=-10"; // tela dentro do iframe da moldura
const LISTAS = { // menu Conclusões: "Pendentes" e "Pré-Análises > Simples"
  naoAnalisadas: "PreAnalisarConclusao?PaginaAtual=2&tipo=todas",
  preAnalisadas: "PreAnalisarConclusao?PaginaAtual=6&tipo=todas",
};

async function guardarDebug(rotulo, url, html) {
  const limpo = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").slice(0, 60000);
  const { debug = {} } = await chrome.storage.local.get("debug");
  debug[rotulo] = { url, html: limpo };
  await chrome.storage.local.set({ debug });
}

async function lerProcessos(s, tipo) {
  const url = BASE + LISTAS[tipo];
  let html = await baixar(url);
  let r = await ler("processos", html);
  if (!r.processos.length && r.formulario) { // a lista só aparece depois de "Consultar"
    const f = r.formulario, alvo = new URL(f.action || LISTAS[tipo], url).href;
    const dados = new URLSearchParams(f.campos);
    html = f.method === "post"
      ? await baixar(alvo, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: dados })
      : await baixar(alvo + (alvo.includes("?") ? "&" : "?") + dados);
    r = await ler("processos", html);
  }
  const { debug = {} } = await chrome.storage.local.get("debug");
  if (!r.processos.length) await guardarDebug(`${s.serventia} :: ${tipo} (SEM PROCESSOS LIDOS)`, url, html);
  else if (!debug["amostra " + tipo]) await guardarDebug("amostra " + tipo, url, html);
  return r.processos;
}

const ocioso = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function verificar() {
  if (rodando) return;
  rodando = true;
  await chrome.storage.local.set({ estado: { status: "verificando" } });
  try {
    const cfg = await getCfg();
    await garantirOffscreen();
    const lista = await ler("lista", await baixar(LISTA));
    if (!lista.logado) return await terminar({ status: "deslogado" }, cfg);

    const filtros = cfg.filtro.split(";").map((f) => semAcento(f)).filter(Boolean);
    const alvos = lista.itens.filter((i) =>
      !filtros.length || filtros.some((f) => semAcento(i.serventia).includes(f)));

    await chrome.storage.local.set({ debug: {} });
    const serventias = [];
    for (const a of alvos) {
      const url = new URL(a.href, BASE).href;
      const s = { serventia: a.serventia, perfil: a.perfil, url, linhas: [], processos: { naoAnalisadas: [], preAnalisadas: [] }, erro: null };
      try {
        await baixar(url); // escolhe a serventia na sessão (devolve só a moldura da página)
        const html = await baixar(INICIO);
        const r = await ler("conclusoes", html);
        if ((await chrome.storage.local.get("debug")).debug?.["amostra inicio"] === undefined) await guardarDebug("amostra inicio", INICIO, html);
        if (!r.linhas) { guardarDebug(s.serventia + " :: tela inicial", INICIO, html); s.erro = "tabela de conclusões não encontrada"; }
        else {
          s.linhas = r.linhas;
          const soma = (k) => r.linhas.reduce((n, l) => n + l[k], 0);
          if (soma("naoAnalisadas")) s.processos.naoAnalisadas = await lerProcessos(s, "naoAnalisadas");
          if (soma("preAnalisadas")) s.processos.preAnalisadas = await lerProcessos(s, "preAnalisadas");
        }
      } catch (e) {
        s.erro = String(e.message || e);
      }
      serventias.push(s);
      await ocioso(1500); // ritmo humano
    }
    await terminar({ status: "ok", quando: Date.now(), serventias }, cfg);
  } catch (e) {
    await chrome.storage.local.set({ estado: { status: "erro", mensagem: String(e.message || e) } });
  } finally {
    rodando = false;
  }
}

// O background não carrega parser.js (precisa de DOM); só a normalização de texto é repetida aqui.
function semAcento(s) {
  return (s || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const chave = (s, l) => `${s.serventia}|${s.perfil}|${l.tipo}`;

async function terminar(estado, cfg) {
  const { estado: anterior } = await chrome.storage.local.get("estado");
  await chrome.storage.local.set({ estado });
  if (estado.status !== "ok") {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b00020" });
    return;
  }
  let naoAn = 0, pre = 0;
  const novos = [];
  const antes = new Map();
  (anterior?.serventias || []).forEach((s) =>
    s.linhas.forEach((l) => antes.set(chave(s, l), l)));
  estado.serventias.forEach((s) => s.linhas.forEach((l) => {
    naoAn += l.naoAnalisadas; pre += l.preAnalisadas;
    const a = antes.get(chave(s, l));
    if (anterior?.status === "ok" && l.naoAnalisadas > (a?.naoAnalisadas || 0))
      novos.push(`${s.serventia}: ${l.tipo} (+${l.naoAnalisadas - (a?.naoAnalisadas || 0)})`);
  }));
  await chrome.action.setBadgeText({ text: naoAn ? String(naoAn) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#1a56a0" });
  if (cfg.notificar && novos.length) {
    chrome.notifications.create({
      type: "basic", iconUrl: "icone.png", title: "Novas conclusões no Projudi",
      message: novos.slice(0, 5).join("\n"),
    });
  }
}


async function agendar() {
  const { intervalo } = await getCfg();
  await chrome.alarms.clear("verificar");
  if (intervalo > 0) chrome.alarms.create("verificar", { periodInMinutes: Math.max(5, +intervalo) });
}

chrome.runtime.onInstalled.addListener(() => { agendar(); verificar(); });
chrome.runtime.onStartup.addListener(() => { agendar(); verificar(); });
chrome.alarms.onAlarm.addListener((a) => a.name === "verificar" && verificar());
chrome.storage.onChanged.addListener((c, area) => area === "sync" && agendar());
// Captura o HTML da aba (e de todos os iframes), sem scripts/estilos, para diagnóstico/ajustes.
async function capturarAba(tabId) {
  const res = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const orig = [...document.querySelectorAll("input,textarea,select")];
      const c = document.documentElement.cloneNode(true);
      [...c.querySelectorAll("input,textarea,select")].forEach((el, i) => { // grava o estado atual dos campos
        const o = orig[i];
        if (!o) return;
        if (["checkbox", "radio"].includes(o.type)) el.toggleAttribute("checked", o.checked);
        else if (o.tagName === "INPUT" && !["password", "file"].includes(o.type)) el.setAttribute("value", o.value);
        else if (o.tagName === "TEXTAREA") el.textContent = o.value;
      });
      c.querySelectorAll("script,style,link,svg,noscript,meta,input[type=password]").forEach((e) => e.remove());
      return { url: location.href, titulo: document.title, html: c.outerHTML.replace(/\s+/g, " ").slice(0, 200000) };
    },
  });
  return res.map((r) => r.result).filter(Boolean);
}

// Atalho Alt+Shift+C: captura a aba/janela em foco (inclusive janelas pop-up sem barra de extensões)
// e abre uma página com o texto pronto para copiar.
async function capturarEAbrir(tabId) {
  if (!tabId) [{ id: tabId } = {}] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const quadros = await capturarAba(tabId);
  const txt = quadros.map((f, i) => `===== FRAME ${i} | ${f.url} | ${f.titulo} =====\n${f.html}`).join("\n\n");
  await chrome.storage.local.set({ captura: txt });
  await chrome.tabs.create({ url: chrome.runtime.getURL("captura.html") });
}
chrome.commands.onCommand.addListener((c) => c === "capturar-tela" && capturarEAbrir().catch(console.error));

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m?.acao === "verificar") verificar();
  if (m?.acao === "capturar") { capturarAba(m.tabId).then(responder, (e) => responder({ erro: String(e.message || e) })); return true; }
});
