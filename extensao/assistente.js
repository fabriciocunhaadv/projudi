// Modo simples: tudo com poucos cliques e frases curtas. Usa os mesmos dados e a mesma fila das telas avançadas.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BASE = "https://projudi.tjgo.jus.br/";
const nomeCls = (p) => p.classificador || "(sem classificador)";
let estado = null, automacao = {}, sit = {};
const servs = () => estado?.serventias || [];

const FRASES = {   // o que a pessoa precisa fazer agora, em cada etapa
  aguardando: ["Na fila", "Aguardando a vez no Studio."],
  analisando: ["Studio", "O Studio está escrevendo a minuta. Pode deixar esta aba aberta e trabalhar em outra."],
  recebida: ["Studio", "Minuta recebida; abrindo o Google Docs."],
  pausado: ["Studio", "Foi interrompido. Abra a fila completa e escolha “Usar a minuta do Studio” ou “Analisar de novo”."],
  conferindo: ["Conferência", "A minuta está no Google Docs, ao lado do PDF. Confira e corrija; depois clique em “Concluir conferência e enviar ao Projudi”, na barra azul do Docs."],
  conferido: ["Projudi", "Abrindo o processo no Projudi…"],
  cadastrando: ["Projudi", "No Projudi: a minuta é lançada no editor. Confira, salve e clique em “Lancei no Projudi — próximo processo”, na barra azul."],
  concluido: ["Concluído", "Pronto!"], erro: ["Erro", "Algo deu errado neste processo. Abra a fila completa para tentar de novo."], pulado: ["Pulado", "Pulado."],
};
const ETAPAS = ["Studio", "Conferência", "Projudi", "Concluído"];

const todosDe = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) => (s.processos?.[tipo] || []).map((p) => ({ ...p, serventia: s.serventia, tipo })));

async function carregar() {
  const [loc, sync] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get("automacao")]);
  estado = loc.estado; automacao = sync.automacao || {}; sit = {};
  for (const [proc] of Object.entries(loc.baixados || {})) sit[proc] = { estado: "baixado" };
  const itens = (loc.esteira_ordem || []).map((id) => loc["esteira_" + id]).filter(Boolean);
  for (const it of itens) sit[it.processo] = it;
  return { loc, itens };
}

async function checklist(loc) {
  const abas = await chrome.tabs.query({});
  const temProjudi = abas.some((a) => /tjgo\.jus\.br/.test(a.url || "")), temStudio = abas.some((a) => /\.ai\.studio/.test(a.url || ""));
  const google = !/^COLE_AQUI/.test(chrome.runtime.getManifest().oauth2?.client_id || "COLE_AQUI");
  const algumaVara = Object.values(automacao).some((a) => a.ativa);
  const linha = (ok, texto, acao) => `<div class="item"><span class="${ok === true ? "ok" : ok === "aviso" ? "aviso" : "ruim"}">${ok === true ? "✔" : ok === "aviso" ? "●" : "✖"}</span><span class="t">${texto}</span>${acao || ""}</div>`;
  $("checklist").innerHTML =
    linha(temProjudi, temProjudi ? "Projudi aberto" : "Abra o Projudi e entre com a sua conta", temProjudi ? "" : `<a class="botao" target="_blank" href="${BASE}">Abrir o Projudi</a>`) +
    linha(!!servs().length, servs().length ? "Lista de processos carregada" : "Ainda não li os seus processos", `<button id="verificar">Atualizar lista</button>`) +
    linha(temStudio, temStudio ? "Studio aberto" : "Abra o Studio e entre com a sua conta Google", temStudio ? "" : `<a class="botao" target="_blank" href="https://assessor-judicial.ai.studio/">Abrir o Studio</a>`) +
    linha(google ? true : "aviso", google ? "Google conectado" : "Google Docs sem conexão automática: a minuta será colada no documento (funciona normalmente)") +
    linha(algumaVara, algumaVara ? "Varas escolhidas" : "Escolha abaixo as suas varas") +
    linha(loc.modelos ? true : "aviso", loc.modelos ? "Modelos do Projudi lidos" : "Modelos do Projudi ainda não lidos (opcional)", `<a class="botao" target="_blank" href="modelos.html">${loc.modelos ? "Atualizar" : "Ler modelos"}</a>`);
  const v = $("verificar"); if (v) v.onclick = () => { chrome.runtime.sendMessage({ acao: "verificar" }); v.textContent = "Atualizando…"; };
}

function varas() {
  if (!servs().length) { $("varas").innerHTML = '<p class="sub">Clique em “Atualizar lista” acima, com o Projudi aberto.</p>'; return; }
  $("varas").innerHTML = servs().map((s) => {
    const n = todosDe(s).length;
    return `<label class="linha"><input type="checkbox" data-serv="${esc(s.serventia)}" ${automacao[s.serventia]?.ativa ? "checked" : ""}> <span>${esc(s.serventia.replace(/^.*?\s-\s/, "").replace(/\s-\sGO$/, ""))} <small>(${n} processo${n === 1 ? "" : "s"})</small></span></label>`;
  }).join("");
}

function resumo() {
  const cand = candidatos();
  $("resumo").textContent = cand.length ? `Vou preparar ${Math.min(cand.length, +$("quantos").value)} de ${cand.length} processo(s) novo(s), do mais urgente para o menos urgente.` : "Nenhum processo novo nas varas escolhidas.";
  $("comecar").disabled = !cand.length;
}

function candidatos() {
  if (!servs().length) return [];
  const comPre = $("comPre").checked, cmp = Ordenar.comparador("trabalho");
  return servs().filter((s) => automacao[s.serventia]?.ativa).flatMap(todosDe)
    .filter((p) => p.url && (p.tipo === "naoAnalisadas" || comPre) && !sit[p.processo]).sort((a, b) => (a.tipo === b.tipo ? cmp(a, b) : a.tipo === "naoAnalisadas" ? -1 : 1));
}

async function comecar() {
  const fila = candidatos().slice(0, +$("quantos").value);
  if (!fila.length) return;
  const hoje = new Date().toISOString().slice(0, 10), id = String(Date.now());
  const itens = fila.map((p) => ({ processo: p.processo, url: p.url, classificador: nomeCls(p), serventia: p.serventia, situacao: p.tipo, urlPre: p.urlPre || "", arquivoModelos: automacao[p.serventia]?.arquivoModelos || "", prompt: automacao[p.serventia]?.prompt || "", pasta: `Projudi/${hoje}/${[p.serventia, nomeCls(p)].map((x) => String(x).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60)).join("/")}` }));
  await chrome.storage.local.set({ ["lote_" + id]: { itens, pasta: "Projudi/" + hoje, opcoes: { atualizarBase: false, studio: { ativo: true, modo: "analise", docs: true } } } });
  chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id) });
}

function andamento(itens) {
  const ativos = itens.filter((i) => !["concluido", "pulado"].includes(i.estado));
  const agora = ativos.find((i) => ["conferindo", "cadastrando", "erro", "pausado"].includes(i.estado)) || ativos.find((i) => i.estado === "analisando") || ativos[0];
  if (!agora) { $("agora").innerHTML = itens.length ? "✔ Tudo concluído. Pode preparar mais processos." : "Nenhum processo em andamento."; $("lista").innerHTML = ""; return; }
  const [etapa, frase] = FRASES[agora.estado] || ["", agora.estado], pos = Math.max(0, ETAPAS.indexOf(etapa));
  $("agora").innerHTML = `<b>Processo ${esc(agora.processo)}</b><br>${esc(frase)}${agora.erro ? `<br><small>${esc(agora.erro)}</small>` : ""}` +
    `<div class="passos">${ETAPAS.map((e, i) => `<span class="${i < pos ? "feito" : i === pos ? "atual" : ""}">${e}</span>`).join("")}</div>`;
  $("lista").innerHTML = ativos.length > 1 ? `<p class="sub">Depois: ${ativos.filter((i) => i !== agora).map((i) => esc(i.processo)).join(", ")}</p>` : "";
}

async function tudo() {
  const { loc, itens } = await carregar();
  await checklist(loc); varas(); resumo(); andamento(itens);
}

document.addEventListener("change", async (e) => {
  const serv = e.target.dataset?.serv;
  if (serv === undefined) { if (e.target.id === "quantos" || e.target.id === "comPre") resumo(); return; }
  const a = automacao[serv] || {};
  automacao[serv] = { ...a, ativa: e.target.checked, prompt: a.prompt || Sugestoes.prompt(serv), arquivoModelos: a.arquivoModelos || Sugestoes.arquivo(serv) };
  await chrome.storage.sync.set({ automacao });
  tudo();
});
$("comecar").onclick = comecar;
chrome.storage.onChanged.addListener(() => tudo());
setInterval(tudo, 5000);
tudo();
