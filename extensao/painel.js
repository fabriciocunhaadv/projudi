const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ROTULO = { naoAnalisadas: "Não analisadas", preAnalisadas: "Pré-analisadas" };
let estado = null, aberto = false;

const todos = (s) => ["naoAnalisadas", "preAnalisadas"].flatMap((tipo) =>
  (s.processos?.[tipo] || []).map((p) => ({ ...p, situacao: ROTULO[tipo], tipo })));

function casa(p, q) {
  return !q || sa([p.processo, p.classificador, p.usuarioPreAnalise, p.tipoConclusao, p.tipoMovimento].join(" ")).includes(q);
}

function desenhar() {
  const el = $("conteudo"), q = sa($("busca").value.trim());
  $("quando").textContent = estado?.quando ? "Atualizado " + new Date(estado.quando).toLocaleString("pt-BR") : "";
  if (!estado) return (el.innerHTML = '<div class="msg">Ainda sem dados. Clique em “Verificar agora”.</div>');
  if (estado.status === "verificando") return (el.innerHTML = '<div class="msg">Verificando… (pode levar alguns minutos)</div>');
  if (estado.status === "deslogado") return (el.innerHTML = '<div class="msg">Você não está logado no Projudi. <a href="https://projudi.tjgo.jus.br/" target="_blank">Entrar</a> e clique em “Verificar agora”.</div>');
  if (estado.status === "erro") return (el.innerHTML = `<div class="msg erro">Erro: ${esc(estado.mensagem)}</div>`);

  // 1) Resumo: uma linha por serventia
  let h = "<h2>Resumo por serventia</h2><table><tr><th>Serventia</th><th>Perfil</th><th>Não analisadas</th><th>Pré-analisadas</th></tr>";
  let tNa = 0, tPre = 0;
  for (const s of estado.serventias) {
    const na = s.linhas.reduce((n, l) => n + l.naoAnalisadas, 0), pre = s.linhas.reduce((n, l) => n + l.preAnalisadas, 0);
    tNa += na; tPre += pre;
    const lis = (k) => (s.processos?.[k] || []).length;
    const c = (n, k) => `<td class="n ${n ? "alerta" : "zero"}">${n}${n !== lis(k) && (n || lis(k)) ? `<br><small>(lista: ${lis(k)})</small>` : ""}</td>`;
    h += `<tr><td><a href="${esc(s.url)}" target="_blank">${esc(s.serventia)}</a>${s.erro ? `<br><span class="erro">${esc(s.erro)}</span>` : ""}</td><td>${esc(s.perfil)}</td>${c(na, "naoAnalisadas")}${c(pre, "preAnalisadas")}</tr>`;
  }
  h += `<tr><th colspan="2">Total</th><th class="n">${tNa}</th><th class="n">${tPre}</th></tr></table>`;

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

  // 3) Detalhe: serventia > situação > classificador > processos
  h += "<h2>Processos</h2>";
  let achou = false;
  for (const s of estado.serventias) {
    const procs = todos(s).filter((p) => casa(p, q));
    if (!procs.length) continue;
    achou = true;
    h += `<details ${aberto || q ? "open" : ""}><summary>${esc(s.serventia)} <span class="qtd">— ${procs.length} processo(s)</span></summary>`;
    for (const sit of Object.values(ROTULO)) {
      const dessa = procs.filter((p) => p.situacao === sit);
      if (!dessa.length) continue;
      h += `<details open><summary>${sit} <span class="qtd">(${dessa.length})</span></summary>`;
      const grupos = new Map();
      dessa.forEach((p) => { const k = p.classificador || "(sem classificador)"; (grupos.get(k) || grupos.set(k, []).get(k)).push(p); });
      for (const [cls, ps] of grupos) {
        h += `<details open><summary class="cls">${esc(cls)} <span class="qtd">(${ps.length})</span></summary><table><tr><th>Processo</th><th>Conclusão</th><th>Início</th><th>Pré-análise</th><th>Usuário</th><th>Movimento</th></tr>`;
        ps.forEach((p) => (h += `<tr><td><b>${esc(p.processo)}</b></td><td>${esc(p.tipoConclusao)}</td><td>${esc(p.dataInicio)}</td><td>${esc(p.dataPreAnalise)}</td><td>${esc(p.usuarioPreAnalise)}</td><td>${esc(p.tipoMovimento)}</td></tr>`));
        h += "</table></details>";
      }
      h += "</details>";
    }
    h += "</details>";
  }
  if (!achou) h += `<p class="zero">${q ? "Nada encontrado para esse filtro." : "Nenhum processo listado (ou as listas ainda não foram lidas — use “Copiar diagnóstico” no popup)."}</p>`;
  el.innerHTML = h;
}

function csv() {
  const cab = ["Serventia", "Perfil", "Situação", "Classificador", "Processo", "Conclusão", "Início", "Pré-análise", "Usuário", "Movimento"];
  const lin = [cab];
  estado?.serventias?.forEach((s) => todos(s).forEach((p) =>
    lin.push([s.serventia, s.perfil, p.situacao, p.classificador, p.processo, p.tipoConclusao, p.dataInicio, p.dataPreAnalise, p.usuarioPreAnalise, p.tipoMovimento])));
  const txt = "﻿" + lin.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = `conclusoes-projudi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

(async () => {
  estado = (await chrome.storage.local.get("estado")).estado;
  chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.estado) { estado = c.estado.newValue; desenhar(); } });
  $("busca").oninput = desenhar;
  $("csv").onclick = csv;
  $("abrir").onclick = () => { aberto = !aberto; $("abrir").textContent = aberto ? "Recolher tudo" : "Expandir tudo"; desenhar(); };
  $("atualizar").onclick = () => chrome.runtime.sendMessage({ acao: "verificar" });
  desenhar();
})();
