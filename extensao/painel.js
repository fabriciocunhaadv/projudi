const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BASE = "https://projudi.tjgo.jus.br/";
const link = (p) => (p.url ? new URL(p.url, BASE).href : "");
const ROTULO = { naoAnalisadas: "Não analisadas", preAnalisadas: "Pré-analisadas" };
let estado = null, aberto = false;

const todos = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) =>
  (s.processos?.[tipo] || []).map((p) => ({ ...p, situacao: ROTULO[tipo], tipo })));

function casa(p, q) {
  return !q || sa([p.processo, p.classificador, p.usuarioPreAnalise, p.tipoConclusao, p.tipoMovimento, p.tipoAcao, p.urgenciaTexto].join(" ")).includes(q);
}

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

  // 3) Detalhe
  const cmp = Ordenar.comparador($("modo").value), fila = $("visao").value === "fila";
  const agora = Date.now();
  const dias = (p) => { const t = Ordenar.ms(p.dataInicio || p.dataPreAnalise); return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / 86400000)) : ""; };
  const linha = (p, comCls) => {
    const num = link(p) ? `<a href="${esc(link(p))}" target="_blank"><b>${esc(p.processo)}</b></a>` : `<b>${esc(p.processo)}</b>`;
    const urg = p.urgencia && p.urgencia < 3 ? `<span class="tag urg${p.urgencia}">${esc(p.urgenciaTexto || "urgente")}</span>` : "";
    return `<tr><td class="n">${p.prioridade ?? ""}</td><td>${num}${urg}</td>` +
      (comCls ? `<td class="cls">${esc(p.classificador)}</td><td>${esc(p.situacao)}</td>` : "") +
      `<td>${esc(p.dataInicio)}</td><td class="n ${dias(p) >= 30 ? "alerta" : ""}" title="dias desde o início">${dias(p)}</td><td>${esc(p.dataPreAnalise)}${p.origem === "multipla" ? ' <span class="tag">múltipla</span>' : ""}</td><td>${esc(p.tipoConclusao)}</td><td>${esc(p.tipoAcao)}</td><td>${esc(p.usuarioPreAnalise)}</td><td>${esc(p.tipoMovimento)}</td></tr>`;
  };
  const cabecalho = (comCls) => `<table><tr><th title="Prioridade do classificador">Prior.</th><th>Processo</th>${comCls ? "<th>Classificador</th><th>Situação</th>" : ""}<th>Início (data e hora)</th><th title="Dias desde o início">Dias</th><th>Pré-análise</th><th>Conclusão</th><th>Tipo da ação</th><th>Usuário</th><th>Movimento</th></tr>`;
  h += "<h2>Processos</h2>";
  let achou = false;
  for (const s of estado.serventias) {
    const procs = todos(s).filter((p) => casa(p, q)).sort(cmp);
    if (!procs.length) continue;
    achou = true;
    h += `<details ${aberto || q || fila ? "open" : ""}><summary>${esc(s.serventia)} <span class="qtd">— ${procs.length} processo(s)</span></summary>`;
    if (fila) {
      h += cabecalho(true) + procs.map((p) => linha(p, true)).join("") + "</table>";
    } else {
      for (const sit of Object.values(ROTULO)) {
        const dessa = procs.filter((p) => p.situacao === sit);
        if (!dessa.length) continue;
        h += `<details open><summary>${sit} <span class="qtd">(${dessa.length})</span></summary>`;
        const grupos = new Map();
        dessa.forEach((p) => { const k = p.classificador || "(sem classificador)"; (grupos.get(k) || grupos.set(k, []).get(k)).push(p); });
        for (const [cls, ps] of [...grupos].sort((a, b) => cmp(a[1][0], b[1][0]))) {
          h += `<details open><summary class="cls">${esc(cls)} <span class="qtd">(${ps.length}${ps[0].prioridade != null ? `, prioridade ${ps[0].prioridade}` : ""})</span></summary>` +
            cabecalho(false) + ps.map((p) => linha(p, false)).join("") + "</table></details>";
        }
        h += "</details>";
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
  $("modo").value = guardado("modo", "trabalho"); $("visao").value = guardado("visao", "classificador");
  for (const id of ["modo", "visao"]) $(id).onchange = () => { try { localStorage.setItem(id, $(id).value); } catch {} desenhar(); };
  $("busca").oninput = desenhar;
  $("csv").onclick = csv;
  $("abrir").onclick = () => { aberto = !aberto; $("abrir").textContent = aberto ? "Recolher tudo" : "Expandir tudo"; desenhar(); };
  $("atualizar").onclick = () => chrome.runtime.sendMessage({ acao: "verificar" });
  desenhar();
})();
