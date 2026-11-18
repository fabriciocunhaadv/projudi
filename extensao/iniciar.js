// "Inicie aqui": passo a passo para o usuário leigo. Uma coisa por tela: 1 verificar a listagem · 2 serventias · 3 o que fazer · 4 conferir e processar · 5 acompanhar.
// Usa os MESMOS dados e o MESMO caminho do painel completo (estado da verificação, serventias ocultas, automacao, lote de PDFs e esteira); o painel completo não muda.
import { enfileirar } from "./esteira-banco.js";
import { STUDIO_URL } from "./studio-cliente.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const curto = (s) => String(s || "").replace(/^.*?\s-\s(?=[^-]+\s-\s[A-Z]{2}$)/, "").replace(/\s-\s[A-Z]{2}$/, "");      // "Montes Claros de Goiás - Vara Cível - GO" → "Vara Cível"
const cidade = (s) => { const p = String(s || "").split(/\s+-\s+/); return p.length > 2 ? p[0] : ""; };
const chaveProc = (p) => String(p).replace(/\D/g, "").slice(0, 13) || p;
const dig = (n) => Number(n || 0).toLocaleString("pt-BR");

let estado = null, ocultas = { servs: [], cargos: [] }, automacao = {}, sit = {}, job = null;
let passo = 1, modo = "studio", verTodas = false, verOcultas = false, aviso = "", ocupado = false;

// ---------- dados ----------
function deduplicar(e) {      // dois perfis na MESMA unidade listam os mesmos processos: cada processo conta uma vez (igual ao painel completo)
  if (!e?.serventias) return e;
  const unidade = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const vistos = new Map();
  const serventias = e.serventias.map((s0) => {
    const s = { ...s0, processos: { naoAnalisadas: [...(s0.processos?.naoAnalisadas || [])], preAnalisadas: [...(s0.processos?.preAnalisadas || [])] } };
    const k = unidade(s.serventia), set = vistos.get(k) || new Set(); vistos.set(k, set);
    for (const tipo of ["naoAnalisadas", "preAnalisadas"]) s.processos[tipo] = s.processos[tipo].filter((p) => { const id = chaveProc(p.processo); if (set.has(id)) return false; set.add(id); return true; });
    return s;
  });
  return { ...e, serventias };
}
const visiveis = () => (estado?.serventias || []).filter((s) => !ocultas.servs.includes(s.serventia) && !ocultas.cargos.includes(s.perfil));
const procsDe = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) => (s.processos?.[tipo] || []).map((p) => ({ ...p, tipo, serventia: s.serventia, serventiaUrl: s.url || "" })));
const ativa = (s) => !!automacao[s.serventia]?.ativa;
const promptDe = (serv) => automacao[serv]?.prompt || (globalThis.Sugestoes ? Sugestoes.prompt(serv) : "") || "";
function candidatos() {      // processos das serventias ligadas, na ordem de trabalho, sem os que já foram baixados/estão na esteira
  const vistos = new Set();
  return visiveis().filter(ativa).flatMap(procsDe).filter((p) => p.url).sort(Ordenar.comparador("trabalho"))
    .filter((p) => { const k = chaveProc(p.processo); if (vistos.has(k) || sit[p.processo]?.feito) return false; vistos.add(k); return true; });
}
async function carregarSituacao() {
  const tudo = await chrome.storage.local.get(null), novo = {};
  for (const proc of Object.keys(tudo.baixados || {})) novo[proc] = { feito: true, estado: "baixado" };
  for (const id of tudo.esteira_ordem || []) { const it = tudo["esteira_" + id]; if (it) novo[it.processo] = { feito: true, estado: it.estado, erro: it.erro || "" }; }
  sit = novo; job = tudo.iniciar_job || null;
}
async function carregar() {
  ocultas = { servs: [], cargos: [], ...((await chrome.storage.sync.get({ ocultas: {} })).ocultas) };
  automacao = (await chrome.storage.sync.get("automacao")).automacao || {};
  estado = deduplicar((await chrome.storage.local.get("estado")).estado);
  modo = (await chrome.storage.local.get("iniciar_modo")).iniciar_modo || "studio";
  await carregarSituacao();
}
const salvarAuto = () => chrome.storage.sync.set({ automacao });
const salvarOcultas = () => chrome.storage.sync.set({ ocultas });

// ---------- apresentação ----------
function haQuanto(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "agora mesmo" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dia(s)`;
}
const quandoTxt = (ms) => { const d = new Date(ms), hoje = new Date(); const mesmo = d.toDateString() === hoje.toDateString(); const h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); return mesmo ? `hoje, ${d.toLocaleDateString("pt-BR")} às ${h}` : `${d.toLocaleDateString("pt-BR")} às ${h}`; };
const NOMES = ["Verificar", "Serventias", "O que fazer", "Processar", "Acompanhar"];
function stepper() {
  return '<div class="st5">' + NOMES.map((n, i) => { const k = i + 1, c = k < passo ? "ok" : k === passo ? "on" : ""; return `<div class="d ${c}"><b>${k < passo ? "✓" : k}</b>${n}</div>${k < 5 ? `<div class="ln ${k < passo ? "ok" : ""}"></div>` : ""}`; }).join("") + "</div>";
}
function moldura(titulo, sub, corpo, { voltar = true, continuar = "Continuar →", pode = true, extra = "" } = {}) {
  return `<div class="hd"><div class="logo"></div><h1>Conclusões Projudi <small>· Inicie aqui</small></h1><span class="sp"></span><button class="btn" data-acao="painel" style="font-size:13px;padding:7px 12px">Abrir painel completo</button></div>` + stepper() +
    `<div class="card"><h2>${titulo}</h2><p class="sub">${sub}</p>${corpo}${aviso ? `<div class="aviso" data-testid="iniciar-aviso">${aviso}</div>` : ""}<div class="ft">${voltar ? '<button class="btn" data-acao="voltar">← Voltar</button>' : ""}<span class="sp"></span>${extra}${continuar ? `<button class="btn p big" data-acao="continuar" ${pode ? "" : "disabled"}>${continuar}</button>` : ""}</div></div>`;
}

function telaPasso1() {
  const verificando = estado?.status === "verificando";
  const emAndamento = job && !job.fim && job.processos?.some((p) => sit[p] && !["concluido", "erro", "pulado"].includes(sit[p].estado || "")) ? `<div class="line">⏳ <span>Você tem processos em andamento (${dig(job.processos.length)}).</span><span class="sp"></span><button class="link" data-acao="acompanhar">Acompanhar →</button></div>` : "";
  if (!estado || estado.status === "erro" || estado.status === "deslogado" || verificando || !estado.serventias) {
    const msg = verificando ? ["⏳", "Verificando o Projudi…", "Pode levar alguns minutos. Pode deixar esta aba aberta: a lista aparece sozinha."]
      : estado?.status === "deslogado" ? ["🔒", "Você não está logado no Projudi.", 'Entre no Projudi (<a href="https://projudi.tjgo.jus.br/" target="_blank">abrir o Projudi</a>) e clique em “Verificar agora”.']
      : estado?.status === "erro" ? ["⚠️", "A última verificação deu erro.", esc(estado.mensagem || "")]
      : ["🔎", "Vamos começar.", "Ela só <b>lê</b> as listas do Projudi (nada é alterado lá) e monta a relação de processos de cada serventia."];
    return moldura("Passo 1 de 5 · Verificar seus processos", "Primeiro, a extensão precisa consultar o Projudi para saber quais processos estão esperando por você.",
      `${emAndamento}<div class="emp"><div class="ic">${msg[0]}</div><p><b>${msg[1]}</b><br>${msg[2]}</p><button class="btn g big" data-acao="verificar" ${verificando ? "disabled" : ""} data-testid="iniciar-verificar">${verificando ? "Verificando…" : "🔍 Verificar agora"}</button>${verificando ? "" : '<p style="font-size:13.5px;margin-top:14px">Leva cerca de 1 minuto. Deixe o Projudi aberto e logado.</p>'}</div>`, { voltar: false, pode: false });
  }
  const vs = visiveis(), total = vs.reduce((n, s) => n + procsDe(s).length, 0), urg = vs.reduce((n, s) => n + procsDe(s).filter((p) => p.urgencia && p.urgencia < 3).length, 0);
  const lista = [...vs].sort((a, b) => procsDe(b).length - procsDe(a).length), mostrar = verTodas ? lista : lista.slice(0, 4);
  return moldura("Passo 1 de 5 · Verificar seus processos", "A listagem já está pronta. Se chegaram processos novos, é só atualizar.",
    `${emAndamento}<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px"><span class="chip" data-testid="iniciar-pronta">✔ Listagem pronta</span><span style="color:var(--mut)">Última verificação: <b style="color:var(--fg)" data-testid="iniciar-quando">${quandoTxt(estado.quando)}</b> (${haQuanto(estado.quando)})</span></div>` +
    `<div class="tipw" style="margin-bottom:16px"><button class="btn" data-acao="verificar" data-testid="iniciar-atualizar">↻ Atualizar a listagem</button><span class="tip">Consulta o Projudi de novo. Use quando achar que chegaram processos novos desde a última verificação.</span></div>` +
    `<div class="kp"><div><b>${dig(total)}</b><span>processos esperando</span></div><div><b>${vs.length}</b><span>serventias</span></div><div><b>${dig(urg)}</b><span>urgentes</span></div></div>` +
    `<div class="mini">${mostrar.map((s) => `<div class="r"><span>${esc(curto(s.serventia))}</span><b>${procsDe(s).length}</b></div>`).join("")}${lista.length > 4 ? `<div class="r" style="color:var(--mut)"><span>${verTodas ? "" : `+ ${lista.length - 4} outras serventias`}</span><button class="link" data-acao="vertodas">${verTodas ? "mostrar menos" : "ver todas"}</button></div>` : ""}</div>`,
    { voltar: false, pode: total > 0 });
}

function telaPasso2() {
  const vs = visiveis().sort((a, b) => Number(ativa(b)) - Number(ativa(a)) || procsDe(b).length - procsDe(a).length);
  const lig = vs.filter((s) => ativa(s) && procsDe(s).length), n = lig.reduce((t, s) => t + procsDe(s).length, 0);
  const linhas = vs.map((s) => { const q = procsDe(s).length, on = ativa(s); return `<div class="row ${on ? "" : "off"}"><button class="sw ${on ? "on" : ""}" data-serv="${esc(s.serventia)}" aria-label="Ligar ou desligar ${esc(curto(s.serventia))}" aria-pressed="${on}"></button><div class="nm"><b>${esc(curto(s.serventia))}</b><small>${esc(cidade(s.serventia))}${on ? "" : " · desligada"}</small></div><span class="badge ${on && q ? "" : "z"}">${q} processo${q === 1 ? "" : "s"}</span><button class="hide" data-ocultar="${esc(s.serventia)}" title="Esconde esta serventia do painel e da contagem (dá para mostrar de novo)">Ocultar</button></div>`; }).join("");
  const oc = ocultas.servs;
  const blocoOc = oc.length ? `<div style="margin-top:10px"><button class="link" data-acao="veroc">${verOcultas ? "Esconder" : "Mostrar"} ${oc.length} serventia${oc.length === 1 ? "" : "s"} oculta${oc.length === 1 ? "" : "s"}</button>${verOcultas ? oc.map((x) => `<div class="row"><div class="nm"><b>${esc(curto(x))}</b><small>oculta</small></div><button class="hide" data-reativar="${esc(x)}">Reativar</button></div>`).join("") + '<small style="color:var(--mut)">Depois de reativar, volte ao passo 1 e atualize a listagem.</small>' : ""}</div>` : "";
  return moldura("Passo 2 de 5 · Onde você trabalha?", "Deixe ligadas só as serventias em que você trabalha. Se uma delas nunca é sua, use <b>Ocultar</b>.",
    `${linhas || '<div class="row">Nenhuma serventia na listagem.</div>'}<div class="line" data-testid="iniciar-resumo2">${lig.length ? `✅ <span><b>${lig.length} serventia${lig.length === 1 ? "" : "s"} ligada${lig.length === 1 ? "" : "s"}</b> · ${dig(n)} processos serão processados</span>` : "👆 <span>Ligue ao menos uma serventia para continuar.</span>"}</div>${blocoOc}`, { pode: lig.length > 0 });
}

function telaPasso3() {
  const lig = visiveis().filter((s) => ativa(s) && procsDe(s).length), cards = [
    ["studio", "✨", "Analisar no Studio", "Baixa os autos, lê o PDF e o Studio escreve a minuta. Você acompanha pelo Histórico.", true],
    ["agaia", "🤖", "Enviar ao Agaia", "Para quem usa o Agaia. Você informa o nome do prompt do Agaia.", false],
    ["pdf", "⬇", "Só baixar os PDFs", "Baixa cada processo em PDF com OCR, sem analisar.", false]];
  const campos = lig.map((s) => `<div><label>${esc(curto(s.serventia))} — ${modo === "agaia" ? "nome do prompt no Agaia" : "prompt no Studio"}</label>` +
    (modo === "agaia" ? `<input data-promptagaia="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.promptAgaia || "")}" placeholder="nome IGUAL ao cadastrado no Agaia">` : `<input data-prompt="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.prompt || "")}" placeholder="${esc(Sugestoes.prompt(s.serventia) ? "sugerido: " + Sugestoes.prompt(s.serventia) : "ex.: Outros Área Judicial - Família e Sucessões")}">`) + "</div>").join("");
  const agaiaAviso = modo === "agaia" ? '<div class="line w" data-testid="iniciar-aviso-agaia">⚠️ <span><b>O nome do prompt tem de ser IGUAL ao cadastrado no Agaia</b> (mesmas letras, acentos e espaços; o ideal é copiar e colar). Se estiver diferente, a extensão não acha o prompt lá e o processo dá erro. Em branco, ela usa o nome do prompt do Studio.</span></div>' : "";
  return moldura("Passo 3 de 5 · O que a extensão deve fazer?", "Escolha uma opção. Dá para mudar depois.",
    `<div class="opts">${cards.map(([k, ic, t, d, rec]) => `<button class="opt ${modo === k ? "sel" : ""}" data-modo="${k}" data-testid="iniciar-modo-${k}">${rec ? '<span class="rec">Recomendado</span>' : ""}<div class="ic">${ic}</div><b>${t}</b><p>${d}</p></button>`).join("")}</div>${agaiaAviso}` +
    (modo !== "pdf" ? `<div class="pr">${campos}</div><p style="font-size:13px;color:var(--mut)">${modo === "agaia" ? "Em branco, vale o prompt do Studio." : "Já vem o prompt sugerido para cada serventia. Só mude se precisar."}</p>` : ""));
}

function telaPasso4() {
  const fila = candidatos(), lig = visiveis().filter((s) => ativa(s) && procsDe(s).length), jaFeitos = lig.reduce((n, s) => n + procsDe(s).filter((p) => p.url && sit[p.processo]?.feito).length, 0);
  const oQue = { studio: "✨ Analisar no Studio", agaia: "🤖 Enviar ao Agaia", pdf: "⬇ Só baixar os PDFs" }[modo];
  const prompts = [...new Set(lig.map((s) => (modo === "agaia" ? automacao[s.serventia]?.promptAgaia || promptDe(s.serventia) : promptDe(s.serventia)) || "(sem prompt)"))];
  return moldura("Passo 4 de 5 · Conferir e processar", "Está tudo certo? Confira o resumo e clique em Processar.",
    `<div class="rw"><span class="k">Serventias</span><span class="v">${lig.map((s) => esc(curto(s.serventia))).join(", ")}</span><button class="link" data-passo="2">Alterar</button></div>` +
    `<div class="rw"><span class="k">Processos</span><span class="v" data-testid="iniciar-qtd">${dig(fila.length)} (os mais urgentes primeiro)${jaFeitos ? ` · ${dig(jaFeitos)} já feito(s) ficam de fora` : ""}</span></div>` +
    `<div class="rw"><span class="k">O que fazer</span><span class="v">${oQue}</span><button class="link" data-passo="3">Alterar</button></div>` +
    (modo !== "pdf" ? `<div class="rw"><span class="k">Prompt</span><span class="v">${prompts.map(esc).join(" · ")}</span><button class="link" data-passo="3">Alterar</button></div>` : "") +
    '<div class="line">ℹ️ <span>Um processo de cada vez. Deixe o Chrome aberto e logado no Projudi. As minutas vão aparecendo no Histórico do Studio.</span></div>',
    { continuar: `▶ Processar ${dig(fila.length)} processo${fila.length === 1 ? "" : "s"}`, pode: fila.length > 0 && !ocupado });
}

function telaPasso5() {
  if (!job) return moldura("Passo 5 de 5 · Acompanhar", "Ainda não há nada em andamento.", '<div class="emp"><p>Volte ao passo 4 e clique em Processar.</p></div>', { continuar: "", voltar: true });
  const ESTADOS = { concluido: ["ok", "✔ Minuta pronta"], erro: ["e", "✖ Erro"], pulado: ["", "↷ Pulado"], analisando: ["run", "● Analisando…"], aguardando: ["", "Na fila"], baixado: ["ok", "✔ PDF baixado"], pausado: ["run", "⏸ Pausado"] };
  const lista = job.processos.map((p) => ({ p, e: sit[p]?.estado || "", erro: sit[p]?.erro || "" }));
  const fim = lista.filter((x) => ["concluido", "erro", "pulado", "baixado"].includes(x.e)).length, pct = lista.length ? Math.round((fim / lista.length) * 100) : 0;
  const rot = { studio: "Enviando seus processos para o Studio…", agaia: "Enviando seus processos ao Agaia…", pdf: "Baixando os PDFs dos processos…" }[job.tipo];
  const ordem = [...lista].sort((a, b) => ({ analisando: 0, pausado: 1, aguardando: 2, "": 3 }[a.e] ?? 4) - ({ analisando: 0, pausado: 1, aguardando: 2, "": 3 }[b.e] ?? 4)).slice(0, 7);
  return moldura(`⏳ ${rot}`, "Um de cada vez, na ordem de urgência. Você já pode abrir o Studio e ir lendo as minutas conforme ficam prontas.",
    `<div class="pb"><i style="width:${pct}%"></i></div><div style="display:flex;justify-content:space-between;color:var(--mut);font-size:13.5px"><span><b style="color:var(--fg)" data-testid="iniciar-feitos">${fim} de ${lista.length}</b> processos prontos</span><span>${job.tipo === "pdf" ? "os PDFs ficam salvos em Downloads" : ""}</span></div>` +
    `<div style="margin-top:14px">${ordem.map(({ p, e, erro }) => { const [c, t] = ESTADOS[e] || ["", job.tipo === "pdf" ? "Baixando…" : "Aguardando o download"]; return `<div class="li"><span class="n">${esc(p)}</span><span style="flex:1;color:var(--mut)">${esc(curto(job.serventias?.[p] || ""))}</span><span class="stt ${c}" ${erro ? `title="${esc(erro)}"` : ""}>${t}</span></div>`; }).join("")}${lista.length > 7 ? `<div class="li" style="color:var(--mut)">+ ${lista.length - 7} outros na Esteira de minutas</div>` : ""}</div>` +
    '<div class="line">ℹ️ <span>Mantenha o Chrome aberto e logado no Projudi. Se algum processo der erro, o motivo aparece nele e a fila continua com o próximo.</span></div>',
    { continuar: "", extra: `<button class="btn" data-acao="esteira">Ver a Esteira completa</button><button class="btn p" data-acao="studio" style="margin-left:8px">Abrir o Studio</button>` });
}

function desenhar() {
  const f = { 1: telaPasso1, 2: telaPasso2, 3: telaPasso3, 4: telaPasso4, 5: telaPasso5 }[passo];
  $("app").innerHTML = f();
}

// ---------- ações ----------
function validarPasso3() {
  const lig = visiveis().filter((s) => ativa(s) && procsDe(s).length);
  if (modo === "studio") { const sem = lig.filter((s) => !promptDe(s.serventia)).map((s) => curto(s.serventia)); if (sem.length) return `Defina o prompt do Studio destas serventias antes de continuar: <b>${sem.map(esc).join(", ")}</b>.`; }
  return "";
}
async function processar() {
  if (ocupado) return; ocupado = true; aviso = ""; desenhar();
  try {
    const fila = candidatos(); if (!fila.length) { aviso = "Não há processos novos para processar."; return; }
    const hoje = new Date().toISOString().slice(0, 10), id = String(Date.now());
    const novoJob = { tipo: modo, inicio: Date.now(), processos: fila.map((p) => p.processo), serventias: Object.fromEntries(fila.map((p) => [p.processo, p.serventia])) };
    if (modo === "agaia") {
      for (const p of fila) await enfileirar({ processo: p.processo, url: p.url, urlPre: p.urlPre || "", serventia: p.serventia, serventiaUrl: p.serventiaUrl || "", prompt: automacao[p.serventia]?.promptAgaia || promptDe(p.serventia), modo: "agaia", pdfNome: "(Agaia — sem PDF)", classificador: p.classificador || "(sem classificador)" }, new Uint8Array([0]));
      try { chrome.runtime.sendMessage({ acao: "esteira-abrir" }); } catch (e) { /* a esteira abre pelo botão */ }
    } else {
      const itens = fila.map((p) => ({ processo: p.processo, url: p.url, classificador: p.classificador || "(sem classificador)", serventia: p.serventia, situacao: p.tipo, urlPre: p.urlPre || "", serventiaUrl: p.serventiaUrl || "", arquivoModelos: automacao[p.serventia]?.arquivoModelos || "", prompt: promptDe(p.serventia),
        pasta: `Projudi/${hoje}/${[p.serventia, p.classificador || "(sem classificador)"].map((x) => String(x).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60).replace(/[\s.]+$/g, "")).join("/")}` }));
      await chrome.storage.local.set({ ["lote_" + id]: { itens, pasta: "Projudi/" + hoje, opcoes: { atualizarBase: false, studio: { ativo: modo === "studio", modo: "analise", docs: false, iaId: "chatgpt" } } } });
      await chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id), active: false });
    }
    await chrome.storage.local.set({ iniciar_job: novoJob }); job = novoJob; passo = 5;
  } catch (e) { aviso = "Não consegui iniciar: " + esc(e?.message || e); } finally { ocupado = false; desenhar(); }
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest?.("[data-acao],[data-serv],[data-ocultar],[data-reativar],[data-modo],[data-passo]"); if (!t) return;
  const d = t.dataset;
  if (d.serv !== undefined) { automacao[d.serv] = { ...automacao[d.serv], ativa: !automacao[d.serv]?.ativa }; salvarAuto(); }
  else if (d.ocultar !== undefined) { if (!ocultas.servs.includes(d.ocultar)) ocultas.servs.push(d.ocultar); salvarOcultas(); }
  else if (d.reativar !== undefined) { ocultas.servs = ocultas.servs.filter((x) => x !== d.reativar); salvarOcultas(); }
  else if (d.modo !== undefined) { modo = d.modo; aviso = ""; chrome.storage.local.set({ iniciar_modo: modo }); }
  else if (d.passo !== undefined) { passo = Number(d.passo); aviso = ""; }
  else if (d.acao === "verificar") { chrome.runtime.sendMessage({ acao: "verificar" }); }
  else if (d.acao === "vertodas") verTodas = !verTodas;
  else if (d.acao === "veroc") verOcultas = !verOcultas;
  else if (d.acao === "voltar") { passo = Math.max(1, passo - 1); aviso = ""; }
  else if (d.acao === "acompanhar") passo = 5;
  else if (d.acao === "painel") { chrome.tabs.create({ url: chrome.runtime.getURL("painel.html") }); return; }
  else if (d.acao === "esteira") { chrome.tabs.create({ url: chrome.runtime.getURL("esteira.html") }); return; }
  else if (d.acao === "studio") { chrome.tabs.create({ url: STUDIO_URL }); return; }
  else if (d.acao === "continuar") {
    if (passo === 3) { aviso = validarPasso3(); if (aviso) return desenhar(); }
    if (passo === 4) return processar();
    passo = Math.min(5, passo + 1); aviso = "";
  }
  desenhar();
});
document.addEventListener("change", (e) => {      // os prompts digitados valem também no painel completo (mesmos campos)
  const t = e.target, d = t.dataset || {};
  if (d.prompt !== undefined) { automacao[d.prompt] = { ...automacao[d.prompt], prompt: t.value.trim() }; salvarAuto(); aviso = ""; }
  else if (d.promptagaia !== undefined) { automacao[d.promptagaia] = { ...automacao[d.promptagaia], promptAgaia: t.value.trim() }; salvarAuto(); }
});

(async () => {
  await carregar(); desenhar();
  chrome.storage.onChanged.addListener(async (c, area) => {
    if (area === "local" && c.estado) { estado = deduplicar(c.estado.newValue); desenhar(); }
    if (area === "local" && Object.keys(c).some((k) => k === "baixados" || k === "iniciar_job" || k.startsWith("esteira_"))) { await carregarSituacao(); if (passo === 5 || passo === 1) desenhar(); }
    if (area === "sync" && (c.ocultas || c.automacao)) { await carregar(); if (!document.activeElement || document.activeElement.tagName !== "INPUT") desenhar(); }
  });
  setInterval(() => { if (passo === 1 && estado?.status === "ok") desenhar(); }, 60000);      // "há X min" se atualiza sozinho
})();
