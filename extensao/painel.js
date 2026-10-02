const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BASE = "https://projudi.tjgo.jus.br/";
const link = (p) => (p.url ? new URL(p.url, BASE).href : "");
const ROTULO = { naoAnalisadas: "Não analisadas", preAnalisadas: "Pré-analisadas" };
let estado = null, aberto = false;
const selCls = new Set(), selSit = new Set(["naoAnalisadas", "preAnalisadas"]), excluidos = new Set();   // seleção para baixar PDFs
let automacao = {};   // { serventia: { ativa, prompt } } — guardado na conta do Chrome (sincroniza entre computadores)
const salvarAuto = () => chrome.storage.sync.set({ automacao });
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
    const fila = cand.filter((p) => !excluidos.has(p.processo));
    h += `<h2>Baixar PDFs para análise</h2><div class="baixar"><div><b>1) Serventias em que você trabalha</b> <small>(a extensão só mexe nas marcadas)</small></div>` +
      `<table class="tp"><thead><tr><th>Automatizar</th><th>Serventia</th><th>Processos</th><th>Prompt no app de IA <small>(nome igual ao da lista “Prompt Ativo”)</small></th></tr></thead><tbody>` +
      estado.serventias.map((s) => `<tr class="tp-linha"><td class="n"><input type="checkbox" data-serv="${esc(s.serventia)}" ${automacao[s.serventia]?.ativa ? "checked" : ""}></td><td>${esc(s.serventia)}</td><td class="n">${todos(s).length}</td>` +
        `<td><input type="text" data-prompt="${esc(s.serventia)}" value="${esc(automacao[s.serventia]?.prompt || "")}" placeholder="ex.: Outros Área Judicial - Família e Sucessões" size="46"></td></tr>`).join("") + `</tbody></table>`;
    if (clsLista.length) h += `<div><b>2) Só estes classificadores</b> <small>(opcional — sem marcar nenhum, baixa todos)</small><br>` +
      clsLista.map((c) => `<label class="chip"><input type="checkbox" data-cls="${esc(c)}" ${selCls.has(c) ? "checked" : ""}> ${esc(c)} <small>(${todosP.filter((p) => nomeCls(p) === c && automacao[p.serventia]?.ativa).length})</small></label>`).join(" ") + `</div>`;
    h += `<div>Situação: <label><input type="checkbox" data-sit="naoAnalisadas" ${selSit.has("naoAnalisadas") ? "checked" : ""}> Não analisadas</label> <label><input type="checkbox" data-sit="preAnalisadas" ${selSit.has("preAnalisadas") ? "checked" : ""}> Pré-analisadas</label></div>`;
    if (cand.length) {
      h += `<table class="tp"><thead><tr><th><input type="checkbox" id="marcarTodos" ${fila.length === cand.length ? "checked" : ""}></th><th>Processo</th><th>Serventia</th><th>Classificador</th><th>Urgência</th><th>Início</th><th class="n">Dias</th></tr></thead><tbody>` +
        cand.map((p) => `<tr class="tp-linha"><td><input type="checkbox" data-proc="${esc(p.processo)}" ${excluidos.has(p.processo) ? "" : "checked"}></td><td><b>${esc(p.processo)}</b></td><td>${esc(p.serventia)}</td><td class="cls">${esc(nomeCls(p))}</td><td>${esc(p.urgenciaTexto)}</td><td>${esc(p.dataInicio)}</td><td class="n">${dias0(p)}</td></tr>`).join("") + `</tbody></table>`;
    } else h += `<p class="zero">${Object.values(automacao).some((x) => x.ativa) ? "Nenhum processo com esse filtro." : "Marque ao menos uma serventia acima."}</p>`;
    h += `<p><button id="baixarLote" ${fila.length ? "" : "disabled"}>⬇ Baixar PDFs dos ${fila.length} processo(s)</button> <small>Ordem da fila: “${esc(Ordenar.MODOS[$("modo").value])}”. Cada processo gera <b>número-OCR.pdf</b> e <b>número-OCR.txt</b>.</small></p></div>`;
    window.__candidatos = fila;
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
  chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.estado) { estado = c.estado.newValue; desenhar(); } });
  const guardado = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  $("modo").innerHTML = Object.entries(Ordenar.MODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("modo").value = guardado("modo", "trabalho"); $("visao").value = guardado("visao", "tabela");
  for (const id of ["modo", "visao"]) $(id).onchange = () => { try { localStorage.setItem(id, $(id).value); } catch {} desenhar(); };
  $("busca").oninput = desenhar;
  RenderProjudi.ligarCopiar($("conteudo"));
  automacao = (await chrome.storage.sync.get("automacao")).automacao || {};
  $("conteudo").addEventListener("change", (e) => {
    const t = e.target, dado = t.dataset || {};
    if (dado.serv !== undefined) { automacao[dado.serv] = { ...automacao[dado.serv], ativa: t.checked }; salvarAuto(); }
    else if (dado.prompt !== undefined) { automacao[dado.prompt] = { ...automacao[dado.prompt], prompt: t.value.trim() }; salvarAuto(); return; }
    else if (dado.cls !== undefined) { t.checked ? selCls.add(dado.cls) : selCls.delete(dado.cls); }
    else if (dado.sit !== undefined) { t.checked ? selSit.add(dado.sit) : selSit.delete(dado.sit); }
    else if (dado.proc !== undefined) { t.checked ? excluidos.delete(dado.proc) : excluidos.add(dado.proc); }
    else if (t.id === "marcarTodos") { const lista = [...document.querySelectorAll("input[data-proc]")].map((x) => x.dataset.proc); lista.forEach((n) => (t.checked ? excluidos.delete(n) : excluidos.add(n))); }
    else return;
    desenhar();
  });
  $("conteudo").addEventListener("click", async (e) => {
    if (!e.target.closest || !e.target.closest("#baixarLote")) return;
    const fila = window.__candidatos || [];   // já na ordem de trabalho
    if (!fila.length) return;
    const hoje = new Date().toISOString().slice(0, 10), id = String(Date.now());
    const itens = fila.map((p) => ({ processo: p.processo, url: p.url, classificador: nomeCls(p), serventia: p.serventia, situacao: p.tipo, prompt: automacao[p.serventia]?.prompt || "", pasta: `Projudi/${hoje}/${[p.serventia, nomeCls(p)].map((x) => String(x).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60)).join("/")}` }));
    await chrome.storage.local.set({ ["lote_" + id]: { itens, pasta: "Projudi/" + hoje } });
    chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id) });
  });
  $("csv").onclick = csv;
  $("abrir").onclick = () => { aberto = !aberto; $("abrir").textContent = aberto ? "Recolher tudo" : "Expandir tudo"; desenhar(); };
  $("atualizar").onclick = () => chrome.runtime.sendMessage({ acao: "verificar" });
  desenhar();
})();
