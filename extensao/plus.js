// Painel Plus: visão geral do usuário, só com dados que a extensão JÁ tem no navegador dele
// (conclusos lidos do Projudi pelo painel completo + fila da esteira). Nada é enviado para fora.
import { todos as todosDaEsteira, ROTULO } from "./esteira-banco.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BASE = "https://projudi.tjgo.jus.br/";
const link = (p) => { try { return p ? new URL(p, BASE).href : ""; } catch { return ""; } };
const ESPERA = ["aguardando", "analisando", "gigante", "recebida", "pausado"], PRONTA = ["conferindo", "conferido", "cadastrando"];
const CURTO = { aguardando: "na fila", analisando: "analisando", gigante: "processo gigante", recebida: "recebida", pausado: "interrompido", conferindo: "pronta p/ conferir", conferido: "conferida", cadastrando: "lançar no Projudi", erro: "erro" };
const NOME_MODO = { analise: "Análise", turbo: "Turbo", lupa: "Lupa", mesa: "Mesa", ia: "IA externa", agaia: "Agaia", video: "Vídeo" };
const CARTOES = [
  { id: "conclusos", rotulo: "Conclusos no Projudi", cor: "var(--brand)", dica: "Soma de pré-analisadas e não analisadas lidas do Projudi" },
  { id: "pre", rotulo: "Pré-analisadas", cor: "#8b5cf6", dica: "Conclusos que já têm pré-análise no Projudi" },
  { id: "fila", rotulo: "Na fila / analisando", cor: "var(--aviso)", dica: "Processos que a esteira ainda vai analisar ou está analisando" },
  { id: "prontas", rotulo: "Prontas para lançar", cor: "var(--ok)", dica: "Minutas prontas, aguardando conferência ou lançamento no Projudi" },
  { id: "erro", rotulo: "Com erro na esteira", cor: "var(--erro)", dica: "Itens que pararam com erro: abra a esteira para tentar de novo" },
];
const FERRAMENTAS = [
  { t: "Mandar para análise", d: "Inicie aqui: escolher processos e enviar", aba: "analise" },
  { t: "Processos do Projudi", d: "Tabelas, fila única e CSV", aba: "procs" },
  { t: "Minhas serventias", d: "Onde trabalho e os prompts", aba: "config" },
  { t: "Esteira de minutas", d: "Conferir e lançar no Projudi", href: "esteira.html" },
  { t: "Painel completo", d: "Todas as listas do Projudi", href: "painel.html" },
  { t: "SEEU", d: "Painel independente do SEEU", href: "seeu.html" },
  { t: "Pauta de audiências", d: "Ler e imprimir a pauta", href: "pauta.html" },
  { t: "Sentenciar com vídeo", d: "Conclusos com mídia da audiência", href: "sentenca-video.html" },
  { t: "PDF com OCR", d: "Tornar o PDF pesquisável", href: "ocr.html" },
  { t: "PDF para texto", d: "Extrair o texto do PDF", href: "texto.html" },
  { t: "Modelos do Projudi", d: "Modelos de documentos", href: "modelos.html" },
  { t: "Ferramentas", d: "Outras ferramentas da extensão", href: "ferramentas.html" },
  { t: "Abrir o Studio", d: "Assessor Judicial", studio: true },
];
let abertas = new Set(), aba = "geral";
let estado = null, itens = [], favoritas = [], recentes = [], ocultas = { servs: [], cargos: [] }, filtroCartao = "";

function desenharFerramentas() {
  $("ferramentas").innerHTML = FERRAMENTAS.map((f, i) => f.href || f.studio ? `<a class="tile" data-f="${i}" href="${f.studio ? "https://judicial-mysql.assessor.net.br/" : esc(f.href)}" target="_blank" data-testid="plus-tile-${i}">${esc(f.t)}<small>${esc(f.d)}</small></a>` : `<button class="tile" data-f="${i}" data-testid="plus-tile-${i}">${esc(f.t)}<small>${esc(f.d)}</small></button>`).join("");
  $("ferramentas").querySelectorAll("button.tile").forEach((b) => (b.onclick = () => trocarAba(FERRAMENTAS[b.dataset.f].aba)));
}
const PAINEIS = { geral: ["geral", "tabGeral"], procs: ["procs", "tabProcs"], config: ["config", "tabConfig"], analise: ["analise", "tabAnalise"] };
function trocarAba(nome) {
  aba = nome;
  for (const [k, [painel, tab]] of Object.entries(PAINEIS)) { $(painel).hidden = k !== nome; $(tab).classList.toggle("on", k === nome); }
  if (nome === "analise" && !$("quadro").getAttribute("src")) $("quadro").src = "iniciar.html?embutido=1";      // o passo a passo "Inicie aqui" aparece aqui dentro, com os mesmos dados e o mesmo caminho
  desenharAbaAtual();
}
for (const [k, [, tab]] of Object.entries(PAINEIS)) $(tab).onclick = (e) => { e.preventDefault(); trocarAba(k); };
const ler = async () => {
  estado = (await chrome.storage.local.get("estado")).estado || null;
  try { itens = await todosDaEsteira(); } catch { itens = []; }
  try { automacao = (await chrome.storage.sync.get("automacao")).automacao || {}; favoritas = (await chrome.storage.sync.get({ plus_favoritas: [] })).plus_favoritas; ocultas = (await chrome.storage.sync.get({ ocultas: { servs: [], cargos: [] } })).ocultas; } catch { /* sem sync */ }
  recentes = (await chrome.storage.local.get({ plus_recentes: [] })).plus_recentes;
};
const serventiasVisiveis = () => (estado?.serventias || []).filter((s) => !ocultas.servs.includes(s.serventia) && !ocultas.cargos.includes(s.perfil));
const soma = (s, k) => (s.linhas || []).reduce((n, l) => n + (l[k] || 0), 0);
// Dois perfis na MESMA unidade listam os mesmos processos: uma serventia por nome (a primeira), como no painel completo.
function unicas() { const vistas = new Set(); return serventiasVisiveis().filter((s) => { const k = String(s.serventia || "").toLowerCase().trim(); if (vistas.has(k)) return false; vistas.add(k); return true; }); }
const doFiltro = () => { const f = $("fServentia").value; return f ? unicas().filter((s) => s.serventia === f) : unicas(); };
const itensFiltrados = () => {
  const f = $("fServentia").value, t = $("fTipo").value, q = $("fBusca").value.replace(/\D/g, "");
  return itens.filter((i) => (!f || i.serventia === f) && (!t || i.modo === t) && (!q || String(i.processo || "").replace(/\D/g, "").includes(q)));
};
const grupo = (i) => (i.estado === "erro" ? "erro" : PRONTA.includes(i.estado) ? "prontas" : ESPERA.includes(i.estado) ? "fila" : "");

function desenharCartoes() {
  const sv = doFiltro(), it = itensFiltrados();
  const val = { conclusos: sv.reduce((n, s) => n + soma(s, "naoAnalisadas") + soma(s, "preAnalisadas"), 0), pre: sv.reduce((n, s) => n + soma(s, "preAnalisadas"), 0),
    fila: it.filter((i) => grupo(i) === "fila").length, prontas: it.filter((i) => grupo(i) === "prontas").length, erro: it.filter((i) => grupo(i) === "erro").length };
  $("cartoes").innerHTML = CARTOES.map((c) => `<button class="cartao${filtroCartao === c.id ? " sel" : ""}" data-c="${c.id}" data-testid="plus-cartao-${c.id}" title="${esc(c.dica)}"><i style="background:${c.cor}"></i><b>${val[c.id]}</b><span>${c.rotulo}</span></button>`).join("");
  $("cartoes").querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { filtroCartao = filtroCartao === b.dataset.c ? "" : b.dataset.c; desenhar(); }));
}
function desenharFila() {
  let lista = itensFiltrados().filter((i) => grupo(i) || i.estado === "concluido");
  if (["fila", "prontas", "erro"].includes(filtroCartao)) lista = lista.filter((i) => grupo(i) === filtroCartao);
  else lista = lista.filter((i) => i.estado !== "concluido");
  const peso = { erro: 0, prontas: 1, fila: 2 }; lista.sort((a, b) => (peso[grupo(a)] ?? 3) - (peso[grupo(b)] ?? 3));
  $("filaInfo").textContent = lista.length ? `${lista.length} item(ns)` : "";
  if (!lista.length) { $("fila").innerHTML = `<div class="vazio">${itens.length ? "Nada neste filtro." : "A esteira está vazia. Use “Inicie aqui” ou a Esteira de minutas para colocar processos na fila."}</div>`; return; }
  const cor = { erro: "er", prontas: "ok", fila: "av" };
  $("fila").innerHTML = `<table><tr><th>Processo</th><th>Trabalho</th><th>Situação</th><th>Ações</th></tr>${lista.map((i) => {
    const g = grupo(i), u = link(i.url);
    return `<tr data-id="${esc(i.id)}"><td><b>${esc(i.processo || "(sem número)")}</b><div class="dica">${esc(i.serventia || "")}</div></td><td>${esc(NOME_MODO[i.modo] || i.modo || "Análise")}</td>
      <td><span class="etq ${cor[g] || "az"}">${esc(CURTO[i.estado] || ROTULO[i.estado] || i.estado)}</span>${i.estado === "erro" && i.erro ? `<div class="dica">${esc(String(i.erro).slice(0, 120))}</div>` : ""}</td>
      <td class="ac"><a class="bt" href="esteira.html" title="Abre a esteira, onde estão os botões de conferir, lançar e tentar de novo">Abrir na esteira</a>${u ? `<a class="bt abrir-proc" data-proc="${esc(i.processo)}" data-url="${esc(u)}" href="${esc(u)}" target="_blank">Abrir o processo</a>` : ""}</td></tr>`; }).join("")}</table>`;
}
function desenharServentias() {
  const ordem = $("ordem").value;
  const lista = doFiltro().map((s) => ({ s, na: soma(s, "naoAnalisadas"), pre: soma(s, "preAnalisadas") }));
  lista.sort((a, b) => ordem === "nome" ? a.s.serventia.localeCompare(b.s.serventia, "pt-BR") : ordem === "pre" ? b.pre - a.pre : (b.na + b.pre) - (a.na + a.pre));
  if (!lista.length) { $("serventias").innerHTML = `<div class="vazio">${estado ? "Sem serventias neste filtro." : "Ainda não há dados do Projudi. Clique em “Atualizar dados do Projudi” e depois em “Verificar agora”."}</div>`; return; }
  $("serventias").innerHTML = `<table><tr><th></th><th>Serventia</th><th>Conclusos</th><th>Pré</th><th>Não analisadas</th><th>Urgentes</th><th></th></tr>${lista.map(({ s, na, pre }) =>
    `<tr><td style="white-space:nowrap"><button class="seta" data-abrir="${esc(s.serventia)}" title="Ver os processos" aria-label="Ver os processos de ${esc(s.serventia)}">${abertas.has(s.serventia) ? "▾" : "▸"}</button><button class="estrela${favoritas.includes(s.serventia) ? " on" : ""}" data-fav="${esc(s.serventia)}" title="Favoritar" aria-label="Favoritar ${esc(s.serventia)}">${favoritas.includes(s.serventia) ? "★" : "☆"}</button></td><td><a href="${esc(link(s.url))}" target="_blank">${esc(s.serventia)}</a>${s.erro ? `<div class="dica" style="color:var(--erro)">${esc(s.erro)}</div>` : ""}</td><td>${na + pre}</td><td><span class="etq az">${pre}</span></td><td><span class="etq av">${na}</span></td><td>${urgentesDe(s) ? `<span class="etq er">${urgentesDe(s)}</span>` : '<span class="dica">0</span>'}</td><td style="white-space:nowrap"><button class="mini-btn" data-ocultar-serv="${esc(s.serventia)}" title="A serventia some do painel e deixa de ser lida">ocultar serventia</button><button class="mini-btn" data-ocultar-cargo="${esc(s.perfil || "")}" ${s.perfil ? "" : "disabled"} title="Oculta todas as serventias deste cargo (perfil)">ocultar cargo</button></td></tr>${abertas.has(s.serventia) ? `<tr><td colspan="7" class="procs">${listaProcessos(s)}</td></tr>` : ""}`).join("")}</table>`;
  $("serventias").querySelectorAll("[data-ocultar-serv]").forEach((b) => (b.onclick = () => mexerOcultas("servs", b.dataset.ocultarServ, true)));
  $("serventias").querySelectorAll("[data-ocultar-cargo]").forEach((b) => (b.onclick = () => b.dataset.ocultarCargo && mexerOcultas("cargos", b.dataset.ocultarCargo, true)));
  $("serventias").querySelectorAll("[data-abrir]").forEach((b) => (b.onclick = () => { const n = b.dataset.abrir; abertas.has(n) ? abertas.delete(n) : abertas.add(n); desenhar(); }));
  $("serventias").querySelectorAll("[data-fav]").forEach((b) => (b.onclick = async () => {
    const n = b.dataset.fav; favoritas = favoritas.includes(n) ? favoritas.filter((x) => x !== n) : [...favoritas, n];
    try { await chrome.storage.sync.set({ plus_favoritas: favoritas }); } catch { /* sem sync */ } desenhar(); }));
}
const diasDe = (p) => { const t = globalThis.Ordenar?.ms ? Ordenar.ms(p.dataInicio || p.dataPreAnalise) : NaN; return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null; };
function listaProcessos(s) {      // o mesmo que o painel completo mostra por serventia, aqui dobrável
  const linhas = ["preAnalisadas", "naoAnalisadas"].flatMap((tipo) => (s.processos?.[tipo] || []).map((p) => ({ ...p, tipo })));
  if (!linhas.length) return '<div class="vazio">Nenhum processo listado nesta serventia.</div>';
  linhas.sort((a, b) => (diasDe(b) ?? -1) - (diasDe(a) ?? -1));
  return `<table><tr><th>Processo</th><th>Situação</th><th>Classificador</th><th>Dias</th></tr>${linhas.map((p) => `<tr><td>${link(p.url) ? `<a class="abrir-proc" data-proc="${esc(p.processo)}" data-url="${esc(link(p.url))}" href="${esc(link(p.url))}" target="_blank">${esc(p.processo)}</a>` : esc(p.processo)}</td><td><span class="etq ${p.tipo === "preAnalisadas" ? "az" : "av"}">${p.tipo === "preAnalisadas" ? "pré-analisada" : "não analisada"}</span></td><td>${esc(p.classificador || "")}</td><td>${diasDe(p) ?? ""}</td></tr>`).join("")}</table>`;
}
function desenharFavoritas() {
  const mapa = new Map(unicas().map((s) => [s.serventia, s])); const lista = favoritas.filter((n) => mapa.has(n));
  if (!lista.length) { $("favoritas").innerHTML = `<div class="vazio">Clique na ☆ ao lado de uma serventia para fixá-la aqui.</div>`; return; }
  $("favoritas").innerHTML = lista.map((n) => { const s = mapa.get(n), na = soma(s, "naoAnalisadas"), pre = soma(s, "preAnalisadas"), nf = itens.filter((i) => i.serventia === n && ["fila", "prontas"].includes(grupo(i))).length;
    return `<div class="linha"><span class="nome">${esc(n)}</span><span class="etq az">${pre} pré</span><span class="etq av">${na} sem análise</span>${nf ? `<span class="etq ok">${nf} na esteira</span>` : ""}</div>`; }).join("");
}
function desenharRecentes() {
  $("recentes").innerHTML = recentes.length ? recentes.slice(0, 8).map((r) => `<div class="linha"><a class="nome abrir-proc" data-proc="${esc(r.processo)}" data-url="${esc(r.url)}" href="${esc(r.url)}" target="_blank">${esc(r.processo)}</a><span class="dica">${esc(r.serventia || "")}</span></div>`).join("") : `<div class="vazio">Os processos que você abrir por esta tela aparecem aqui.</div>`;
}
function preencherFiltros() {
  const sv = $("fServentia").value, tp = $("fTipo").value;
  const nomes = [...new Set([...unicas().map((s) => s.serventia), ...itens.map((i) => i.serventia).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("fServentia").innerHTML = `<option value="">Serventia: todas</option>` + nomes.map((n) => `<option>${esc(n)}</option>`).join(""); $("fServentia").value = nomes.includes(sv) ? sv : "";
  const modos = [...new Set(itens.map((i) => i.modo).filter(Boolean))];
  $("fTipo").innerHTML = `<option value="">Tipo de trabalho: todos</option>` + modos.map((m) => `<option value="${esc(m)}">${esc(NOME_MODO[m] || m)}</option>`).join(""); $("fTipo").value = modos.includes(tp) ? tp : "";
}
function desenharAviso() {
  const q = estado?.quando ? new Date(estado.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("quando").textContent = q ? "Projudi lido em " + q : "";
  const st = estado?.status; $("situacaoLeitura").textContent = st === "verificando" ? "⏳ Lendo o Projudi…" : st === "deslogado" ? "🔒 Projudi sem login" : st === "erro" ? "⚠ A última leitura deu erro" : "";
  $("atualizar").disabled = st === "verificando";
  const a = $("aviso");
  if (!estado) { a.hidden = false; a.textContent = "Ainda não há dados do Projudi neste navegador. Clique em “Atualizar dados do Projudi”, entre no Projudi se pedir e use “Verificar agora”. A fila da esteira abaixo já funciona."; }
  else if (estado.status === "deslogado") { a.hidden = false; a.textContent = "O Projudi estava sem login na última leitura: os números de conclusos podem estar desatualizados."; }
  else a.hidden = true;
}

// ---------- o que veio do painel completo, na organização do Plus ----------
const todosDe = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) => (s.processos?.[tipo] || []).map((p) => ({ ...p, tipo, situacao: tipo === "preAnalisadas" ? "Pré-analisadas" : "Não analisadas" })));
const urgentesDe = (s) => todosDe(s).filter((p) => p.urgencia && p.urgencia < 3).length;
async function mexerOcultas(lista, valor, add) {
  const i = ocultas[lista].indexOf(valor); if (add && i < 0) ocultas[lista].push(valor); if (!add && i >= 0) ocultas[lista].splice(i, 1);
  try { await chrome.storage.sync.set({ ocultas }); } catch { /* sem sync */ } desenhar();
}
function desenharOcultas() {
  const n = ocultas.servs.length + ocultas.cargos.length;
  $("ocultasBloco").innerHTML = n ? `<div class="bloco"><details><summary style="padding:12px 16px;cursor:pointer;font-weight:700;color:var(--brand)">Ocultas (${n}) <small>— não aparecem nem são lidas; clique para reativar</small></summary><div style="padding:8px 16px">${ocultas.servs.map((x) => `<div class="linha">Serventia: <b class="nome">${esc(x)}</b><button class="mini-btn" data-reativar-serv="${esc(x)}">reativar</button></div>`).join("")}${ocultas.cargos.map((x) => `<div class="linha">Cargo: <b class="nome">${esc(x)}</b><button class="mini-btn" data-reativar-cargo="${esc(x)}">reativar</button></div>`).join("")}<p class="dica">Depois de reativar, use “Verificar o Projudi agora” para ler de novo.</p></div></details></div>` : "";
  $("ocultasBloco").querySelectorAll("[data-reativar-serv]").forEach((b) => (b.onclick = () => mexerOcultas("servs", b.dataset.reativarServ, false)));
  $("ocultasBloco").querySelectorAll("[data-reativar-cargo]").forEach((b) => (b.onclick = () => mexerOcultas("cargos", b.dataset.reativarCargo, false)));
}
function desenharClassificadores() {
  const m = new Map();
  for (const s of doFiltro()) for (const p of todosDe(s)) { const k = p.classificador || "(sem classificador)"; const o = m.get(k) || { naoAnalisadas: 0, preAnalisadas: 0 }; o[p.tipo]++; m.set(k, o); }
  $("clsInfo").textContent = m.size ? `— ${m.size} classificador(es)` : "";
  $("classificadores").innerHTML = m.size ? `<table><tr><th>Classificador</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>${[...m].sort((a, b) => (b[1].naoAnalisadas + b[1].preAnalisadas) - (a[1].naoAnalisadas + a[1].preAnalisadas)).map(([k, o]) => `<tr><td>${esc(k)}</td><td><span class="etq av">${o.naoAnalisadas}</span></td><td><span class="etq az">${o.preAnalisadas}</span></td></tr>`).join("")}</table>` : '<div class="vazio">Sem classificadores lidos ainda.</div>';
}
// Aba "Processos": o mesmo que o painel completo mostra (tabelas no formato do Projudi ou fila única), com filtro, ordem e CSV
let procsAberto = false;
const guardadoLocal = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };      // só preferência de tela deste navegador
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function desenharProcessos() {
  const q = sa($("pBusca").value.trim()), modo = $("pModo").value || "trabalho", fila = $("pVisao").value === "fila", agora = Date.now();
  const casa = (p) => !q || sa([p.processo, p.classificador, p.usuarioPreAnalise, p.tipoConclusao, p.tipoMovimento, p.tipoAcao, p.urgenciaTexto].join(" ")).includes(q);
  if (!estado) { $("pConteudo").innerHTML = '<div class="vazio">Ainda sem dados. Use “Verificar o Projudi agora”.</div>'; return; }
  let h = "", achou = false;
  const cmp = Ordenar.comparador(modo);
  for (const s of doFiltro()) {
    const procs = todosDe(s).filter(casa); if (!procs.length) continue; achou = true;
    h += `<details class="procs-det" ${procsAberto || q || fila ? "open" : ""}><summary>${esc(s.serventia)} <small>— ${procs.length} processo(s)</small></summary>`;
    if (fila) h += RenderProjudi.tabela([...procs].sort(cmp), { tipo: "naoAnalisadas", modo, dias: true, agora });
    else for (const tipo of ["naoAnalisadas", "preAnalisadas"]) { const d = procs.filter((p) => p.tipo === tipo); if (d.length) h += `<details open><summary><b>${tipo === "preAnalisadas" ? "Pré-analisadas" : "Não analisadas"}</b> <small>(${d.length})</small></summary>${RenderProjudi.tabela(d, { tipo, modo, dias: true, agora })}</details>`; }
    h += "</details>";
  }
  $("pConteudo").innerHTML = achou ? h : `<div class="vazio">${q ? "Nada encontrado para esse filtro." : "Nenhum processo listado (ou as listas ainda não foram lidas)."}</div>`;
}
function exportarCsv() {
  const cab = ["Serventia", "Perfil", "Situação", "Classificador", "Prioridade do classificador", "Urgência", "Processo", "Link", "Conclusão", "Início (data e hora)", "Pré-análise", "Tipo da ação", "Usuário", "Movimento"], lin = [cab];
  for (const s of unicas()) todosDe(s).sort(Ordenar.comparador($("pModo").value || "trabalho")).forEach((p) => lin.push([s.serventia, s.perfil, p.situacao, p.classificador, p.prioridade, p.urgenciaTexto, p.processo, link(p.url), p.tipoConclusao, p.dataInicio, p.dataPreAnalise, p.tipoAcao, p.usuarioPreAnalise, p.tipoMovimento]));
  const txt = "﻿" + lin.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = `conclusoes-projudi-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
// Aba "Minhas serventias": automatizar + prompt do Studio + arquivo de modelos + prompt do Agaia (mesmos dados do painel completo: chrome.storage.sync "automacao")
let automacao = {};
const salvarAuto = () => chrome.storage.sync.set({ automacao }).catch(() => {});
function desenharConfig() {
  const lista = unicas();
  $("cfgInfo").textContent = lista.length ? `— ${lista.filter((s) => automacao[s.serventia]?.ativa).length} de ${lista.length} ligadas` : "";
  if (!lista.length) { $("cConteudo").innerHTML = '<div class="vazio">Ainda não há serventias lidas. Use “Verificar o Projudi agora”.</div>'; return; }
  const sug = (f, s) => (globalThis.Sugestoes?.[f]?.(s) ? "sugestão: " + Sugestoes[f](s) : "");
  $("cConteudo").innerHTML = `<table><tr><th>Automatizar</th><th>Serventia</th><th>Processos</th><th>Prompt no Studio <small>(igual ao da lista “Prompt Ativo”)</small></th><th>Arquivo de modelos na base <small>(PDF único)</small></th><th>Prompt no Agaia <small>(opcional)</small></th></tr>${lista.map((s) => { const a = automacao[s.serventia] || {};
    return `<tr><td><input type="checkbox" data-c-ativa="${esc(s.serventia)}" ${a.ativa ? "checked" : ""} aria-label="Automatizar ${esc(s.serventia)}"></td><td>${esc(s.serventia)}</td><td>${todosDe(s).length}</td>
      <td><input type="text" data-c-prompt="${esc(s.serventia)}" value="${esc(a.prompt || "")}" placeholder="${esc(sug("prompt", s.serventia) || "ex.: Outros Área Judicial - Cível")}"></td>
      <td><input type="text" data-c-arq="${esc(s.serventia)}" value="${esc(a.arquivoModelos || "")}" placeholder="${esc(sug("arquivo", s.serventia) || "ex.: Família - Decisões, Despachos e Sentenças")}"></td>
      <td><input type="text" data-c-agaia="${esc(s.serventia)}" value="${esc(a.promptAgaia || "")}" placeholder="nome igual ao do Agaia"></td></tr>`; }).join("")}</table>`;
  const grava = (serv, campo, v) => { automacao[serv] = { ...automacao[serv], [campo]: v }; return salvarAuto(); };
  $("cConteudo").querySelectorAll("[data-c-ativa]").forEach((x) => (x.onchange = async () => { await grava(x.dataset.cAtiva, "ativa", x.checked); desenharConfig(); }));
  $("cConteudo").querySelectorAll("[data-c-prompt]").forEach((x) => (x.onchange = () => grava(x.dataset.cPrompt, "prompt", x.value.trim())));
  $("cConteudo").querySelectorAll("[data-c-arq]").forEach((x) => (x.onchange = () => grava(x.dataset.cArq, "arquivoModelos", x.value.trim())));
  $("cConteudo").querySelectorAll("[data-c-agaia]").forEach((x) => (x.onchange = () => grava(x.dataset.cAgaia, "promptAgaia", x.value.trim())));
}
function desenharAbaAtual() { if (aba === "procs") desenharProcessos(); else if (aba === "config") desenharConfig(); }
function desenhar() { desenharFerramentas(); desenharOcultas(); desenharClassificadores(); desenharAbaAtual(); desenharAviso(); preencherFiltros(); desenharCartoes(); desenharFila(); desenharServentias(); desenharFavoritas(); desenharRecentes(); ligarAbrir(); }
function ligarAbrir() {
  document.querySelectorAll(".abrir-proc").forEach((a) => (a.onclick = async () => {
    const serv = itens.find((i) => i.processo === a.dataset.proc)?.serventia || ""; const novos = [{ processo: a.dataset.proc, url: a.dataset.url, serventia: serv, em: Date.now() }, ...recentes.filter((r) => r.processo !== a.dataset.proc)].slice(0, 20);
    recentes = novos; await chrome.storage.local.set({ plus_recentes: novos }); desenharRecentes(); ligarAbrir(); }));
}
["fServentia", "fTipo", "ordem"].forEach((id) => ($(id).onchange = desenhar)); $("fBusca").oninput = desenhar;
$("pModo").innerHTML = Object.entries(Ordenar.MODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(""); $("pModo").value = guardadoLocal("plus_modo", "trabalho"); $("pVisao").value = guardadoLocal("plus_visao", "tabela");
for (const [id, k] of [["pModo", "plus_modo"], ["pVisao", "plus_visao"]]) $(id).onchange = () => { try { localStorage.setItem(k, $(id).value); } catch { /* sem armazenamento */ } desenharProcessos(); };
$("pBusca").oninput = desenharProcessos; $("pCsv").onclick = exportarCsv;
$("pExpandir").onclick = () => { procsAberto = !procsAberto; $("pExpandir").textContent = procsAberto ? "Recolher tudo" : "Expandir tudo"; desenharProcessos(); };
$("cIr").onclick = () => trocarAba("analise"); RenderProjudi.ligarCopiar($("pConteudo"));
$("atualizar").onclick = () => { try { chrome.runtime.sendMessage({ acao: "verificar" }); } catch { /* fora da extensão */ } $("situacaoLeitura").textContent = "⏳ Lendo o Projudi…"; };
(async () => { await ler(); desenhar();
  chrome.storage.onChanged.addListener(async (c, area) => { if (area === "local" && (c.estado || c.esteira_ordem || Object.keys(c).some((k) => k.startsWith("esteira_")))) { await ler(); desenhar(); } });
})();
