// Sentenciar com o vídeo da audiência: para processos CONCLUSOS (a audiência já foi feita e a mídia já foi juntada). Não depende da pauta do Projudi,
// de onde o processo sai depois da audiência. A fonte é a lista de conclusos que o painel já lê (estado). A esteira entrega o PDF e os vídeos ao Studio.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BASE = "https://projudi.tjgo.jus.br/";
const link = (p) => { try { return p ? new URL(p, BASE).href : ""; } catch { return ""; } };
const chave = (p) => String(p).replace(/\D/g, "").slice(0, 13) || p;
let estado = null, ocultas = { servs: [], cargos: [] }, marcados = new Set();
const ROTULO = { naoAnalisadas: "Não analisada", preAnalisadas: "Pré-analisada" };

function candidatos() {      // cada processo uma vez (dois perfis na mesma unidade listam os mesmos)
  const vistos = new Set(), r = [];
  for (const s of estado?.serventias || []) {
    if (ocultas.servs.includes(s.serventia) || ocultas.cargos.includes(s.perfil)) continue;
    for (const tipo of ["preAnalisadas", "naoAnalisadas"]) for (const p of s.processos?.[tipo] || []) {
      const k = chave(p.processo); if (vistos.has(k) || !p.url) continue; vistos.add(k);
      r.push({ ...p, tipo, serventia: s.serventia, serventiaUrl: s.url || "" });
    }
  }
  return r;
}
const filtrados = () => { const f = $("serv").value, q = $("busca").value.replace(/\D/g, ""); return candidatos().filter((p) => (!f || p.serventia === f) && (!q || String(p.processo).replace(/\D/g, "").includes(q))); };
function desenhar() {
  const todos = candidatos();
  const nomes = [...new Set(todos.map((p) => p.serventia))].sort((a, b) => a.localeCompare(b, "pt-BR")), atual = $("serv").value;
  $("serv").innerHTML = '<option value="">Serventia: todas</option>' + nomes.map((n) => `<option>${esc(n)}</option>`).join(""); $("serv").value = nomes.includes(atual) ? atual : "";
  const l = filtrados();
  if (!l.length) $("lista").innerHTML = `<div class="vazio">${estado ? "Nenhum processo concluso neste filtro." : "Ainda não há a lista de conclusos. Clique em “↻ Atualizar conclusos” (com o Projudi logado em outra aba)."}</div>`;
  else $("lista").innerHTML = `<table><tr><th></th><th>Processo</th><th>Serventia</th><th>Situação</th><th>Classificador</th></tr>${l.map((p) =>
    `<tr><td><input type="checkbox" class="sel" data-k="${esc(p.processo)}" ${marcados.has(p.processo) ? "checked" : ""} aria-label="Marcar ${esc(p.processo)}"></td><td><a href="${esc(link(p.url))}" target="_blank"><b>${esc(p.processo)}</b></a></td><td>${esc(p.serventia)}</td><td><span class="etq ${p.tipo === "preAnalisadas" ? "az" : "av"}">${ROTULO[p.tipo]}</span></td><td>${esc(p.classificador || "")}</td></tr>`).join("")}</table>`;
  document.querySelectorAll(".sel").forEach((c) => (c.onchange = () => { c.checked ? marcados.add(c.dataset.k) : marcados.delete(c.dataset.k); atualizarBotao(); }));
  atualizarBotao();
}
function atualizarBotao() { const n = candidatos().filter((p) => marcados.has(p.processo)).length; $("video").disabled = !n; $("qtd").textContent = n ? `${n} processo(s) marcado(s)` : ""; }
async function carregarPrompts() {
  const sel = $("promptVideo"), guardado = (await chrome.storage.local.get("pauta_video_prompt")).pauta_video_prompt || "", atual = sel.value || guardado;
  let lista = [];
  try { const { lerPromptDoStudio } = await import("./studio-cliente.js"); await lerPromptDoStudio(""); } catch (e) { lista = Array.isArray(e.opcoes) ? e.opcoes : []; }
  if (!lista.length) { const { automacao = {} } = await chrome.storage.sync.get("automacao"); lista = [...new Set(Object.values(automacao).map((a) => a.prompt).filter(Boolean))]; }
  sel.innerHTML = '<option value="">— prompt da serventia —</option>' + lista.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  if (atual && lista.includes(atual)) sel.value = atual;
}
$("video").onclick = async () => {
  const sel = candidatos().filter((p) => marcados.has(p.processo));
  if (!sel.length) { $("msg").textContent = "Marque ao menos um processo concluso."; return; }
  const manual = $("promptVideo").value.trim(); await chrome.storage.local.set({ pauta_video_prompt: manual });
  // prompt de cada processo: o campo (se preenchido) vale para todos; senão, o prompt da SERVENTIA (cadastrado no Painel) ou a sugestão pelo nome da serventia
  const { automacao = {} } = await chrome.storage.sync.get("automacao");
  const promptDe = (serv) => manual || automacao[serv]?.prompt || (globalThis.Sugestoes ? Sugestoes.prompt(serv) : "") || "";
  const id = "pautavideo" + Date.now();
  const itens = sel.map((p) => ({ processo: p.processo, url: p.url, urlPre: p.urlPre || "", classificador: p.classificador || "conclusos", serventia: p.serventia, serventiaUrl: p.serventiaUrl, situacao: p.tipo, prompt: promptDe(p.serventia) }));
  const usados = [...new Set(itens.map((i) => i.prompt || "(sem prompt: a esteira vai pedir a escolha)"))];
  await chrome.storage.local.set({ ["lote_" + id]: { itens, pasta: "Projudi/Sentenças com vídeo", opcoes: { studio: { ativo: true, modo: "video", docs: false } } } });
  chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id), active: false });
  $("msg").textContent = `${sel.length} processo(s): baixando o PDF e os vídeos da audiência de cada um. Prompt(s) usado(s): ${usados.join(" | ")}. A esteira entrega ao Studio, que degrava e redige a sentença (mantenha a aba do Assessor aberta e logada; acompanhe na esteira).`;
};
$("promptVideoRec").onclick = () => void carregarPrompts();
$("serv").onchange = $("busca").oninput = desenhar;
$("todos").onclick = () => { filtrados().forEach((p) => marcados.add(p.processo)); desenhar(); };
$("nenhum").onclick = () => { marcados.clear(); desenhar(); };
$("atualizar").onclick = () => { chrome.runtime.sendMessage({ acao: "verificar" }); $("msg").textContent = "Lendo o Projudi… (a lista aparece sozinha quando terminar; o Projudi precisa estar logado em outra aba)."; };
(async () => {
  estado = (await chrome.storage.local.get("estado")).estado || null;
  try { ocultas = { servs: [], cargos: [], ...((await chrome.storage.sync.get({ ocultas: {} })).ocultas) }; } catch { /* sem sync */ }
  desenhar(); void carregarPrompts();
  chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.estado) { estado = c.estado.newValue; desenhar(); if (estado?.status === "ok") $("msg").textContent = ""; } });
})();
