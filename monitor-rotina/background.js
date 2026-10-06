importScripts("util.js");
const { normalizar, casaHost } = MonUtil;
const CFG_PADRAO = { ativo: false, sites: [], rotulos: true };
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
let cfg = { ...CFG_PADRAO }, ocioso = "active", atual = null, fila = Promise.resolve();
const serie = (fn) => (fila = fila.then(fn, fn));          // grava um de cada vez (evita corrida na leitura-e-escrita)

async function carregarCfg() { cfg = { ...CFG_PADRAO, ...((await chrome.storage.local.get("cfg")).cfg || {}) }; }
const pronto = carregarCfg();
const permitido = (host) => cfg.sites.some((s) => casaHost(s.padrao, host));

function evento(e) {
  if (!cfg.ativo) return Promise.resolve();
  return serie(async () => {
    const { eventos = [] } = await chrome.storage.local.get("eventos");
    eventos.push(e); if (eventos.length > 20000) eventos.splice(0, eventos.length - 15000);
    await chrome.storage.local.set({ eventos });
  });
}

// ---------- tempo ativo por site (só sites escolhidos; o resto vira "(outros)", sem endereço) ----------
async function fecharIntervalo() {
  const { atualMon } = await chrome.storage.session.get("atualMon"); const a = atual || atualMon; atual = null;
  await chrome.storage.session.remove("atualMon");
  if (a) { const ms = Date.now() - a.t0; if (ms > 1000) await evento({ t: a.t0, tipo: "tempo", site: a.site, ms }); }
}
async function reavaliar() {
  await pronto; await fecharIntervalo();
  if (!cfg.ativo || ocioso !== "active") return;
  const jan = await chrome.windows.getLastFocused().catch(() => null);
  if (!jan || !jan.focused) return;
  const [aba] = await chrome.tabs.query({ active: true, windowId: jan.id });
  if (!aba) return;
  let site = "(outros)";
  if (/^https?:/.test(aba.url || "")) { const h = new URL(aba.url).hostname; if (permitido(h)) site = h; }
  atual = { site, t0: Date.now() }; await chrome.storage.session.set({ atualMon: atual });
}
chrome.tabs.onActivated.addListener(reavaliar);
chrome.tabs.onUpdated.addListener((id, ch) => { if (ch.url || ch.status === "complete") reavaliar(); });
chrome.windows.onFocusChanged.addListener(reavaliar);
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((s) => { ocioso = s; reavaliar(); });
chrome.alarms.create("ponto", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((a) => a.name === "ponto" && reavaliar());

// ---------- navegação (inclui quadros internos, como o do Projudi, e telas que mudam por script) ----------
const nav = (d) => { if (!cfg.ativo) return; const { host, pg } = normalizar(d.url); if (host && permitido(host)) evento({ t: Date.now(), tipo: "nav", site: host, pg }); };
chrome.webNavigation.onCommitted.addListener(nav);
chrome.webNavigation.onHistoryStateUpdated.addListener(nav);

// ---------- scripts de página só nos sites escolhidos e autorizados ----------
async function registrar() {
  await pronto;
  try { await chrome.scripting.unregisterContentScripts({ ids: ["mon"] }); } catch (e) { /* ainda não havia */ }
  const ok = [];
  for (const s of cfg.sites) if (await chrome.permissions.contains({ origins: [s.padrao] })) ok.push(s.padrao);
  if (ok.length) await chrome.scripting.registerContentScripts([{ id: "mon", matches: ok, js: ["util.js", "content.js"], allFrames: true, runAt: "document_idle", persistAcrossSessions: true }]);
  return ok;
}
chrome.runtime.onInstalled.addListener(() => registrar());
chrome.runtime.onStartup.addListener(() => registrar());
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.cfg) { carregarCfg().then(() => { registrar(); reavaliar(); }); } });
chrome.permissions.onAdded.addListener(() => registrar());

// ---------- gravação e execução de tarefas ----------
function addPasso(passo) {
  return serie(async () => {
    const { gravacao } = await chrome.storage.local.get("gravacao");
    if (!gravacao || !gravacao.ativa) return;
    const ant = gravacao.passos[gravacao.passos.length - 1];
    passo.espera = ant ? Math.min(Date.now() - ant.t, 2000) : 0; passo.t = Date.now();
    gravacao.passos.push(passo); await chrome.storage.local.set({ gravacao });
  });
}
let parar = false;
async function executar(id, valores, tabId) {
  const { tarefas = [] } = await chrome.storage.local.get("tarefas"), t = tarefas.find((x) => x.id === id);
  if (!t) return;
  parar = false;
  const marca = (o) => chrome.storage.local.set({ execucao: { tarefa: id, total: t.passos.length, ...o } });
  for (let i = 0; i < t.passos.length; i++) {
    if (parar) { await marca({ i, estado: "parada" }); return; }
    const p = { ...t.passos[i] }; if (p.variavel) p.valor = valores[i] ?? "";
    await marca({ i, estado: "rodando" });
    let feito = false;
    for (let k = 0; k < 40 && !feito && !parar; k++) {
      const r = await chrome.tabs.sendMessage(tabId, { acao: "executar-passo", passo: p }).catch(() => null);
      if (r && r.ok) feito = true; else await dorme(500);
    }
    if (!feito) { await marca({ i, estado: "erro", erro: parar ? "parada pelo usuário" : `não achei “${p.alvo?.texto || p.alvo?.name || p.alvo?.id || p.alvo?.css || "?"}” (passo ${i + 1})` }); return; }
    await dorme(Math.max(250, Math.min(p.espera || 0, 2000)));
  }
  await marca({ i: t.passos.length, estado: "concluida" });
}

chrome.runtime.onMessage.addListener((m, s, responder) => {
  (async () => {
    await pronto;
    if (m.acao === "clique") await evento({ t: Date.now(), tipo: "clique", site: normalizar(s.url || s.tab?.url || "").host, pg: m.pg, rot: cfg.rotulos ? m.rot : "(clique)" });
    else if (m.acao === "passo") await addPasso(m.passo);
    else if (m.acao === "executar") executar(m.id, m.valores || {}, m.tabId);
    else if (m.acao === "parar") parar = true;
    else if (m.acao === "registrar") return responder({ sites: await registrar() });
    responder({ ok: true });
  })();
  return true;
});
