const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BASE = "https://projudi.tjgo.jus.br/";
const link = (p) => (p.url ? new URL(p.url, BASE).href : "");
const ROTULO = { naoAnalisadas: "Não analisadas", preAnalisadas: "Pré-analisadas" };
let estado = null, aberto = false;
// Situação de cada processo na automação: baixado / em que etapa da esteira (Studio, Google Docs, Projudi) está.
let sitProc = {};
const incluidos = new Set();          // já baixados que o usuário marcou de novo à mão
const fora = (proc) => excluidos.has(proc) || (!!sitProc[proc]?.feito && !incluidos.has(proc) && !opcoes.refazer);
const ETAPAS = {
  aguardando: ["⏳", "Baixado — na fila do Studio"], analisando: ["🤖", "Analisando no Studio"], pausado: ["⏸", "Interrompido no Studio — decidir na esteira"],
  conferindo: ["📝", "Google Docs — aguardando a sua conferência"], conferido: ["⚖", "Indo para o Projudi"], cadastrando: ["⚖", "No Projudi — lançar a minuta"],
  concluido: ["✔", "Concluído"], erro: ["✖", "Erro na esteira"], pulado: ["↷", "Pulado na esteira"],
};
async function carregarSituacao() {
  const tudo = await chrome.storage.local.get(null), novo = {};
  for (const [proc, b] of Object.entries(tudo.baixados || {})) novo[proc] = { feito: true, icone: "⬇", texto: "Baixado em " + new Date(b.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }), esteira: false };
  for (const id of tudo.esteira_ordem || []) {
    const it = tudo["esteira_" + id]; if (!it) continue;
    const [icone, texto] = ETAPAS[it.estado] || ["", it.estado];
    novo[it.processo] = { feito: true, icone, texto: texto + (it.estado === "erro" && it.erro ? ": " + it.erro : ""), esteira: true, estado: it.estado };
  }
  sitProc = novo;
}
const celulaSit = (proc) => { const x = sitProc[proc]; return x ? `<span class="sit sit-${x.estado || "baixado"}">${x.icone} ${esc(x.texto)}</span>${x.esteira ? ' <a href="esteira.html" target="_blank">abrir esteira</a>' : ""}` : '<span class="sit-nada">não baixado</span>'; };
const selCls = new Set(), selSit = new Set(["naoAnalisadas", "preAnalisadas"]), excluidos = new Set();   // seleção para baixar PDFs
let opcoes = { atualizarBase: false, studio: false, modo: "analise", docs: false, refazer: false };   // o que fazer depois de baixar
let automacao = {};   // { serventia: { ativa, prompt } } — guardado na conta do Chrome (sincroniza entre computadores)
const salvarAuto = () => chrome.storage.sync.set({ automacao });
// Preenche sozinho (sem sobrescrever o que o usuário escreveu) o prompt e o arquivo de modelos de cada serventia.
function completarAuto(servs) {
  let mudou = false;
  for (const { serventia: s } of servs) {
    const a = automacao[s] || {}, prompt = a.prompt || Sugestoes.prompt(s), arq = a.arquivoModelos || Sugestoes.arquivo(s);
    if (prompt !== a.prompt || arq !== a.arquivoModelos) { automacao[s] = { ...a, prompt, arquivoModelos: arq }; mudou = true; }
  }
  if (mudou) salvarAuto();
}
const nomeCls = (p) => p.classificador || "(sem classificador)";

const todos = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) =>
  (s.processos?.[tipo] || []).map((p) => ({ ...p, situacao: ROTULO[tipo], tipo })));

function casa(p, q) {
  return !q || sa([p.processo, p.classificador, p.usuarioPreAnalise, p.tipoConclusao, p.tipoMovimento, p.tipoAcao, p.urgenciaTexto].join(" ")).includes(q);
}

const dias0 = (p) => RenderProjudi.diasDe(p, Date.now());

function desenhar() {
  const el = $("conteudo"), q = sa($("busca").value.trim());
  $("quando").textContent = estado?.quando ? "Atualizado " + new Date(estado.quando).toLocaleString("pt-BR") : "";
  if (!estado) return (el.innerHTML = '<div class="msg">Ainda sem dados. Clique em “Verificar agora”.</div>');
  if (estado.status === "verificando") return (el.innerHTML = '<div class="msg">Verificando… (pode levar alguns minutos)</div>');
  if (estado.status === "deslogado") return (el.innerHTML = '<div class="msg">Você não está logado no Projudi. <a href="https://projudi.tjgo.jus.br/" target="_blank">Entrar</a> e clique em “Verificar agora”.</div>');
  if (estado.status === "erro") return (el.innerHTML = `<div class="msg erro">Erro: ${esc(estado.mensagem)}</div>`);

  // 1) Resumo: uma linha por serventia
  let h = "<h2>Resumo por serventia</h2><table><tr><th>Serventia</th><th>Perfil</th><th>Não analisadas</th><th>Pré-analisadas</th><th>Urgentes</th></tr>";
  let tNa = 0, tPre = 0, tUrg = 0;
  for (const s of estado.serventias) {
    const na = s.linhas.reduce((n, l) => n + l.naoAnalisadas, 0), pre = s.linhas.reduce((n, l) => n + l.preAnalisadas, 0);
    const urg = todos(s).filter((p) => p.urgencia && p.urgencia < 3).length;
    tNa += na; tPre += pre; tUrg += urg;
    const lis = (k) => (s.processos?.[k] || []).length;
    const c = (n, k) => `<td class="n ${n ? "alerta" : "zero"}">${n}${n !== lis(k) && (n || lis(k)) ? `<br><small>(lista: ${lis(k)})</small>` : ""}</td>`;
    h += `<tr><td><a href="${esc(s.url)}" target="_blank">${esc(s.serventia)}</a>${s.erro ? `<br><span class="erro">${esc(s.erro)}</span>` : ""}${(s.avisos || []).map((a) => `<br><span class="aviso">⚠ ${a.tipo === "naoAnalisadas" ? "não analisadas" : "pré-analisadas"}: a tela inicial conta ${a.esperado}, mas só ${a.lido} vieram na lista</span>`).join("")}</td><td>${esc(s.perfil)}</td>${c(na, "naoAnalisadas")}${c(pre, "preAnalisadas")}<td class="n ${urg ? "alerta" : "zero"}">${urg}</td></tr>`;
  }
  h += `<tr><th colspan="2">Total</th><th class="n">${tNa}</th><th class="n">${tPre}</th><th class="n">${tUrg}</th></tr></table>`;

  // 2) Por classificador (todas as serventias juntas)
  const porCls = new Map();
  for (const s of estado.serventias) for (const p of todos(s)) {
    const k = p.classificador || "(sem classificador)";
    const o = porCls.get(k) || { naoAnalisadas: 0, preAnalisadas: 0 };
    o[p.tipo]++; porCls.set(k, o);
  }
  if (porCls.size) {
    h += "<h2>Por classificador (todas as serventias)</h2><table><tr><th>Classificador</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>";
    [...porCls].sort((a, b) => (b[1].naoAnalisadas + b[1].preAnalisadas) - (a[1].naoAnalisadas + a[1].preAnalisadas))
      .forEach(([k, o]) => (h += `<tr><td class="cls">${esc(k)}</td><td class="n">${o.naoAnalisadas}</td><td class="n">${o.preAnalisadas}</td></tr>`));
    h += "</table>";
  }

  // 3a) Baixar PDFs para análise: o assessor marca as serventias (varas) em que trabalha; a extensão baixa os processos delas
  // e cada serventia usa o seu prompt no app de IA. Classificadores são um filtro opcional.
  {
    const todosP = estado.serventias.flatMap((s) => todos(s).map((p) => ({ ...p, serventia: s.serventia })));
    const clsLista = [...new Set(todosP.filter((p) => automacao[p.serventia]?.ativa).map(nomeCls))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const cand = todosP.filter((p) => automacao[p.serventia]?.ativa && (!selCls.size || selCls.has(nomeCls(p))) && selSit.has(p.tipo) && p.url).sort(Ordenar.comparador($("modo").value));
    const fila = cand.filter((p) => !fora(p.processo));
    completarAuto(estado.serventias);
    h += `<h2>Baixar PDFs para análise</h2><div class="baixar"><div><b>1) Serventias em que você trabalha</b> <small>(a extensão só mexe nas marcadas)</small></div>` +
      `<table class="tp"><thead><tr><th>Automatizar</th><th>Serventia</th><th>Processos</th><th>Prompt no Studio <small>(igual ao da lista “Prompt Ativo”)</small></th><th>Arquivo de modelos na base <small>(PDF único)</small></th><th>Prompt no ExecAgaia <small>(opcional; vazio = igual ao do Studio)</small></th></tr></thead><tbody>` +
      estado.serventias.map((s) => `<tr class="tp-linha"><td class="n"><input type="checkbox" data-serv="${esc(s.serventia)}" ${automacao[s.serventia]?.ativa ? "checked" : ""}></td><td>${esc(s.serventia)}</td><td class="n">${todos(s).length}</td>` +
        `<td><input type="text" data-promptia="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.prompt || "")}" placeholder="ex.: Outros Área Judicial - Família e Sucessões" size="40"></td>` +
        `<td><input type="text" data-prompt="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.arquivoModelos || "")}" placeholder="ex.: Família - Decisões, Despachos e Sentenças" size="40"></td>` +
        `<td><input type="text" data-promptagaia="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.promptAgaia || "")}" placeholder="ex.: Fabrício Família e Sucessões" size="34"></td></tr>`).join("") + `</tbody></table>`;
    if (clsLista.length) h += `<div><b>2) Só estes classificadores</b> <small>(opcional — sem marcar nenhum, baixa todos)</small><br>` +
      clsLista.map((c) => `<label class="chip"><input type="checkbox" data-cls="${esc(c)}" ${selCls.has(c) ? "checked" : ""}> ${esc(c)} <small>(${todosP.filter((p) => nomeCls(p) === c && automacao[p.serventia]?.ativa).length})</small></label>`).join(" ") + `</div>`;
    h += `<div>Situação: <label><input type="checkbox" data-sit="naoAnalisadas" ${selSit.has("naoAnalisadas") ? "checked" : ""}> Não analisadas</label> <label><input type="checkbox" data-sit="preAnalisadas" ${selSit.has("preAnalisadas") ? "checked" : ""}> Pré-analisadas</label></div>`;
    const SECOES = [["naoAnalisadas", "Não analisadas"], ["preAnalisadas", "Pré-analisadas"]];
    const ordenada = [];   // a fila segue esta ordem: primeiro as não analisadas, depois as pré-analisadas (cada grupo na ordem de trabalho)
    for (const [tipo, rotulo] of SECOES) {
      const grupo = cand.filter((p) => p.tipo === tipo);
      if (!grupo.length) continue;
      ordenada.push(...grupo);
      const marcados = grupo.filter((p) => !fora(p.processo)).length;
      h += `<h3 class="sub-baixar">${rotulo} <span class="qtd">(${marcados} de ${grupo.length} marcados)</span></h3>` +
        `<table class="tp"><thead><tr><th><input type="checkbox" data-todos="${tipo}" ${marcados === grupo.length ? "checked" : ""} title="Marcar/desmarcar todos"></th><th>Processo</th><th>Serventia</th><th>Classificador</th><th>Urgência</th><th>Início</th><th class="n">Dias</th><th>Situação na automação</th></tr></thead><tbody>` +
        grupo.map((p) => `<tr class="tp-linha"><td><input type="checkbox" data-proc="${esc(p.processo)}" ${fora(p.processo) ? "" : "checked"}></td><td><b>${esc(p.processo)}</b></td><td>${esc(p.serventia)}</td><td class="cls">${esc(nomeCls(p))}</td><td>${esc(p.urgenciaTexto)}</td><td>${esc(p.dataInicio)}</td><td class="n">${dias0(p)}</td><td>${celulaSit(p.processo)}</td></tr>`).join("") + `</tbody></table>`;
    }
    if (!ordenada.length) h += `<p class="zero">${Object.values(automacao).some((x) => x.ativa) ? "Nenhum processo com esse filtro." : "Marque ao menos uma serventia acima."}</p>`;
    const fila2 = ordenada.filter((p) => !fora(p.processo));
    const jaFeitos = cand.filter((p) => sitProc[p.processo]?.feito).length;
    h += `<div class="opcoes"><label><input type="checkbox" data-op="refazer" ${opcoes.refazer ? "checked" : ""}> Baixar de novo também os já baixados <small>(${jaFeitos} já baixado(s)/na esteira — por padrão ficam desmarcados)</small></label> <a href="esteira.html" target="_blank">Abrir a esteira de minutas</a></div>` +
      `<div class="opcoes"><b>3) Depois de baixar:</b><br>` +
      `<label><input type="checkbox" data-op="atualizarBase" ${opcoes.atualizarBase ? "checked" : ""}> Cadastrar/atualizar a <b>base de conhecimento</b> do Studio com os modelos das varas selecionadas (PDF único por vara, substitui o antigo)</label><br>` +
      `<label><input type="checkbox" data-op="studio" ${opcoes.studio ? "checked" : ""}> <b>Iniciar a análise</b> de cada PDF no Studio, uma de cada vez, com o prompt da vara:</label>` +
      `<label class="radio"><input type="radio" name="modoStudio" data-modo="analise" ${opcoes.modo === "analise" ? "checked" : ""} ${opcoes.studio ? "" : "disabled"}> Análise dos processos (Gerar Minuta Judicial)</label>` +
      `<label class="radio"><input type="radio" name="modoStudio" data-modo="lupa" ${opcoes.modo === "lupa" ? "checked" : ""} ${opcoes.studio ? "" : "disabled"}> Lupa do Magistrado <small>(precisa da minuta do assessor; por ora só baixa)</small></label>` +
      `<label class="radio"><input type="radio" name="modoStudio" data-modo="turbo" ${opcoes.modo === "turbo" ? "checked" : ""} ${opcoes.studio ? "" : "disabled"}> ⚡ Análise Turbo <small>(Módulo Turbo Independente: anexa o PDF com OCR, Auto-detectar, e gera)</small></label>` +
      `<label><input type="checkbox" data-op="docs" ${opcoes.docs ? "checked" : ""} ${opcoes.studio ? "" : "disabled"}> Depois da minuta pronta, <b>abrir no Google Docs</b> (“número – tipo”, padrão monografia) ao lado do PDF baixado</label></div>`;
    h += `<p><button id="baixarLote" ${fila2.length ? "" : "disabled"}>⬇ Baixar PDFs dos ${fila2.length} processo(s)</button> <small>Ordem da fila: “${esc(Ordenar.MODOS[$("modo").value])}”. Cada processo gera <b>número-OCR.pdf</b>.</small></p></div>`;
    window.__candidatos = fila2;
  }

  // 3) Detalhe: tabelas no formato do Projudi (ou fila única na ordem de trabalho)
  const modo = $("modo").value, fila = $("visao").value === "fila", agora = Date.now();
  const cmp = Ordenar.comparador(modo);
  const dias = (p) => RenderProjudi.diasDe(p, agora);
  const linha = (p) => {
    const num = link(p) ? `<a href="${esc(link(p))}" target="_blank"><b>${esc(p.processo)}</b></a>` : `<b>${esc(p.processo)}</b>`;
    const urg = p.urgencia && p.urgencia < 3 ? `<span class="dot u${p.urgencia}" title="${esc(p.urgenciaTexto)}"></span>` : "";
    return `<tr class="tp-linha"><td class="n">${p.prioridade ?? ""}</td><td class="proc">${urg}${num} <button class="copiar" data-num="${esc(p.processo)}" title="Copiar número do processo">📋</button>${urg ? `<span class="urgtxt">${esc(p.urgenciaTexto)}</span>` : ""}</td>` +
      `<td class="cls">${esc(p.classificador) || '<i>sem classificador</i>'}</td><td>${esc(p.situacao)}${p.origem === "multipla" ? ' <span class="multipla">múltipla</span>' : ""}</td>` +
      `<td>${esc(p.dataInicio)}</td><td class="n ${dias(p) >= 30 ? "velho" : ""}" title="dias desde o início">${dias(p)}</td><td>${esc(p.dataPreAnalise)}</td><td>${esc(p.tipoConclusao)}</td><td>${esc(p.tipoAcao)}</td><td>${esc(p.usuarioPreAnalise)}</td><td>${esc(p.tipoMovimento)}</td></tr>`;
  };
  h += "<h2>Processos</h2>";
  let achou = false;
  for (const s of estado.serventias) {
    const procs = todos(s).filter((p) => casa(p, q));
    if (!procs.length) continue;
    achou = true;
    h += `<details ${aberto || q || fila ? "open" : ""}><summary>${esc(s.serventia)} <span class="qtd">— ${procs.length} processo(s)</span></summary>`;
    if (fila) {
      h += `<table class="tp"><thead><tr><th class="n" title="Prioridade do classificador">Prior.</th><th>Processo</th><th>Classificador</th><th>Situação</th><th>Início (data e hora)</th><th class="n" title="Dias desde o início">Dias</th><th>Pré-análise</th><th>Conclusão</th><th>Tipo da ação</th><th>Usuário</th><th>Movimento</th></tr></thead><tbody>` +
        [...procs].sort(cmp).map(linha).join("") + "</tbody></table>";
    } else {
      for (const tipo of ["naoAnalisadas", "preAnalisadas"]) {
        const dessa = procs.filter((p) => p.tipo === tipo);
        if (!dessa.length) continue;
        h += `<details open><summary>${ROTULO[tipo]} <span class="qtd">(${dessa.length})</span></summary>${RenderProjudi.tabela(dessa, { tipo, modo, dias: true, agora })}</details>`;
      }
    }
    h += "</details>";
  }
  if (!achou) h += `<p class="zero">${q ? "Nada encontrado para esse filtro." : "Nenhum processo listado (ou as listas ainda não foram lidas — use “Copiar diagnóstico” no popup)."}</p>`;
  el.innerHTML = h;
}

function csv() {
  const cab = ["Serventia", "Perfil", "Situação", "Classificador", "Prioridade do classificador", "Urgência", "Processo", "Link", "Conclusão", "Início (data e hora)", "Pré-análise", "Tipo da ação", "Usuário", "Movimento"];
  const lin = [cab];
  estado?.serventias?.forEach((s) => todos(s).sort(Ordenar.comparador($("modo").value)).forEach((p) =>
    lin.push([s.serventia, s.perfil, p.situacao, p.classificador, p.prioridade, p.urgenciaTexto, p.processo, link(p), p.tipoConclusao, p.dataInicio, p.dataPreAnalise, p.tipoAcao, p.usuarioPreAnalise, p.tipoMovimento])));
  const txt = "﻿" + lin.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = `conclusoes-projudi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

(async () => {
  estado = (await chrome.storage.local.get("estado")).estado;
  await carregarSituacao();
  chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.estado) { estado = c.estado.newValue; desenhar(); } });
  chrome.storage.onChanged.addListener(async (c, area) => {      // andamento da fila/esteira: atualiza a coluna "Situação na automação"
    if (area === "local" && Object.keys(c).some((k) => k === "baixados" || k.startsWith("esteira_"))) { await carregarSituacao(); desenhar(); }
  });
  const guardado = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  $("modo").innerHTML = Object.entries(Ordenar.MODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("modo").value = guardado("modo", "trabalho"); $("visao").value = guardado("visao", "tabela");
  for (const id of ["modo", "visao"]) $(id).onchange = () => { try { localStorage.setItem(id, $(id).value); } catch {} desenhar(); };
  $("busca").oninput = desenhar;
  RenderProjudi.ligarCopiar($("conteudo"));
  automacao = (await chrome.storage.sync.get("automacao")).automacao || {};
  opcoes = { ...opcoes, ...((await chrome.storage.sync.get("opcoesLote")).opcoesLote || {}) };
  $("conteudo").addEventListener("change", (e) => {
    const t = e.target, dado = t.dataset || {};
    if (dado.serv !== undefined) { automacao[dado.serv] = { ...automacao[dado.serv], ativa: t.checked }; salvarAuto(); }
    else if (dado.promptagaia !== undefined) { automacao[dado.promptagaia] = { ...automacao[dado.promptagaia], promptAgaia: t.value.trim() }; salvarAuto(); return; }
    else if (dado.promptia !== undefined) { automacao[dado.promptia] = { ...automacao[dado.promptia], prompt: t.value.trim() }; salvarAuto(); return; }
    else if (dado.prompt !== undefined) { automacao[dado.prompt] = { ...automacao[dado.prompt], arquivoModelos: t.value.trim() }; salvarAuto(); return; }
    else if (dado.cls !== undefined) { t.checked ? selCls.add(dado.cls) : selCls.delete(dado.cls); }
    else if (dado.op !== undefined) { opcoes[dado.op] = t.checked; chrome.storage.sync.set({ opcoesLote: opcoes }); }
    else if (dado.modo !== undefined) { opcoes.modo = dado.modo; chrome.storage.sync.set({ opcoesLote: opcoes }); }
    else if (dado.sit !== undefined) { t.checked ? selSit.add(dado.sit) : selSit.delete(dado.sit); }
    else if (dado.proc !== undefined) { if (t.checked) { excluidos.delete(dado.proc); incluidos.add(dado.proc); } else { excluidos.add(dado.proc); incluidos.delete(dado.proc); } }
    else if (dado.todos !== undefined) { // marcar/desmarcar todos de UMA tabela (não analisadas ou pré-analisadas)
      const tabela = t.closest("table");
      [...tabela.querySelectorAll("input[data-proc]")].forEach((x) => (t.checked ? (excluidos.delete(x.dataset.proc), incluidos.add(x.dataset.proc)) : (excluidos.add(x.dataset.proc), incluidos.delete(x.dataset.proc))));
    }
    else return;
    desenhar();
  });
  $("conteudo").addEventListener("click", async (e) => {
    if (!e.target.closest || !e.target.closest("#baixarLote")) return;
    const fila = window.__candidatos || [];   // já na ordem de trabalho
    if (!fila.length) return;
    const hoje = new Date().toISOString().slice(0, 10), id = String(Date.now());
    const itens = fila.map((p) => ({ processo: p.processo, url: p.url, classificador: nomeCls(p), serventia: p.serventia, situacao: p.tipo, urlPre: p.urlPre || "", arquivoModelos: automacao[p.serventia]?.arquivoModelos || "", prompt: automacao[p.serventia]?.prompt || "", pasta: `Projudi/${hoje}/${[p.serventia, nomeCls(p)].map((x) => String(x).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60).replace(/[\s.]+$/g, "")).join("/")}` }));
    await chrome.storage.local.set({ ["lote_" + id]: { itens, pasta: "Projudi/" + hoje, opcoes: { atualizarBase: opcoes.atualizarBase, studio: { ativo: opcoes.studio, modo: opcoes.modo, docs: opcoes.docs } } } });
    chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id) });
  });
  $("csv").onclick = csv;
  $("abrir").onclick = () => { aberto = !aberto; $("abrir").textContent = aberto ? "Recolher tudo" : "Expandir tudo"; desenhar(); };
  $("atualizar").onclick = () => chrome.runtime.sendMessage({ acao: "verificar" });
  desenhar();
})();
