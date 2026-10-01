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

async function baixar(url) {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return new TextDecoder("windows-1252").decode(await r.arrayBuffer()); // o Projudi usa LATIN1
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

    const serventias = [];
    for (const a of alvos) {
      const url = new URL(a.href, BASE).href;
      const s = { serventia: a.serventia, perfil: a.perfil, url, linhas: [], erro: null };
      try {
        const r = await ler("conclusoes", await baixar(url));
        if (!r.logado) return await terminar({ status: "deslogado" }, cfg);
        if (!r.linhas) s.erro = "tabela de conclusões não encontrada";
        else s.linhas = r.linhas;
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
chrome.runtime.onMessage.addListener((m) => { if (m?.acao === "verificar") verificar(); });
