// Pauta de audiências no modelo do gabinete (HORA | PROCESSO | PARTE | VÍTIMA/TESTEMUNHAS), montada com o que a Mesa de Audiência do Studio mostra
// (Briefing, Roteiro, Deliberações, Sentença, Ata e ata preliminar) e com a data/hora/partes da lista do Projudi. Nada é inventado: o que faltar fica em branco.
import { todos, atualizar } from "./esteira-banco.js";
import { analisarNoStudio } from "./studio-cliente.js";
import { dadosPautaMesa } from "./pauta-dados.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const tituloDia = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `PAUTA DIA ${+m[3]} DE ${MESES[+m[2] - 1].toUpperCase()} DE ${m[1]}` : "PAUTA DE AUDIÊNCIAS"; };
const horaH = (h) => String(h || "").replace(/^(\d{1,2}):(\d{2})$/, "$1h$2");
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let itens = [];

const linhaSit = (t, alerta) => (t ? `\n<span class="${alerta ? "alerta" : ""}">${esc(t)}</span>` : "");

function celulas(it) {
  const d = it.dados, nomeReu = it.audPromovido || "", nomeAutor = it.audPromovente || "";
  const proc = d?.processo || it.processo;
  const c2 = `<div class="proc"><div>${esc(proc)}${it.audTipo ? `<div class="tipo">${esc(String(it.audTipo).toUpperCase())}</div>` : ""}</div>${d?.artigo ? `<div class="art">${esc(d.artigo)}</div>` : ""}</div>`;
  if (!d) return { c2, c3: `<span class="nome">${esc(nomeReu || nomeAutor)}</span>\n<span class="alerta">${esc(it.erroLeitura || "Mesa de Audiência não lida: abra a audiência na Mesa e use “Reler a Mesa”.")}</span>`, c4: "" };
  const notas = [];
  if (d.fatos.dataFato) notas.push(`Data do fato: ${d.fatos.dataFato}`);
  if (d.fatos.nascimento) notas.push(`Data de nascimento do autor: ${d.fatos.nascimento}`);
  if (d.fatos.denunciaMov != null) notas.push(`Denúncia mov. ${d.fatos.denunciaMov}`);
  if (d.fatos.recebimentoMov != null) notas.push(`Recebeu denúncia mov. ${d.fatos.recebimentoMov}`);
  const advTxt = d.advogados.length ? d.advogados.map(esc).join("\n") : "";
  const evs = d.eventos.map((e) => `<span class="${e.alerta ? "alerta" : ""}">${esc(e.texto)}</span>`);
  const corpo = [advTxt, notas.map(esc).join("\n"), evs.join("\n")].filter(Boolean).join("\n\n");
  const c3 = (d.criminal ? `<span class="nome">${esc(nomeReu || nomeAutor)}</span>` : [nomeAutor && `<span class="rot">AUTOR: </span><span class="nome">${esc(nomeAutor)}</span>`, nomeReu && `<span class="rot">RÉU: </span><span class="nome">${esc(nomeReu)}</span>`].filter(Boolean).join("\n"))
    + (corpo ? "\n\n" + corpo : "") + (d.vazio ? `\n<span class="sug nao-imprimir">[nada localizado nas abas da Mesa para esta audiência: confira o Briefing e o Roteiro no Studio e use “Reler a Mesa”.]</span>` : "");
  const pes = (p) => `\n<span class="nome">${esc(p.nome)}</span>${p.lado ? ` <span class="peq">(${esc(p.lado)})</span>` : ""}${linhaSit(p.situacao, p.alerta)}`;
  const vit = d.testemunhas.filter((t) => t.papel === "vitima"), tes = d.testemunhas.filter((t) => t.papel !== "vitima");
  let c4 = "";
  if (vit.length) c4 += `<span class="dest">VÍTIMA</span>` + vit.map(pes).join("");
  if (tes.length) c4 += (c4 ? "\n" : "") + `<span class="dest">TESTEMUNHAS</span>` + tes.map(pes).join("");
  return { c2, c3, c4 };
}

function desenhar() {
  const dias = {};
  itens.filter((i) => !i.removido).forEach((i) => (dias[i.audData || ""] = dias[i.audData || ""] || []).push(i));
  $("saida").innerHTML = Object.keys(dias).sort().map((dia) => {
    const rows = dias[dia].sort((a, b) => String(a.audHora || "").localeCompare(String(b.audHora || ""))).map((it) => {
      const c = celulas(it);
      return `<tr data-id="${it.id}"><td class="h"><div class="cel" contenteditable="true">${esc(horaH(it.audHora))}</div></td><td class="n"><div class="cel" contenteditable="true">${c.c2}</div></td><td><div class="cel" contenteditable="true">${c.c3}</div></td><td><div class="cel" contenteditable="true">${c.c4}</div></td></tr>`;
    }).join("");
    return `<div class="folha"><h2 class="dia">${esc(tituloDia(dia))}</h2><table class="p"><tbody>${rows}</tbody></table></div>`;
  }).join("") || "<p style='text-align:center'>Nenhuma audiência selecionada.</p>";
}

async function ler(it, forcar) {
  if (it.dados && !forcar) return;
  try {
    const lido = await analisarNoStudio(null, { modo: "mesa-ler", processo: it.processo, texto: "x" });
    it.dados = dadosPautaMesa(lido, { autor: it.audPromovente }); it.erroLeitura = "";
    await atualizar(it.id, { pautaDados: it.dados, pautaEm: Date.now(), pautaV: 2 });
  } catch (e) { it.dados = null; it.erroLeitura = e.message || String(e); }
}

async function montar(forcar) {
  const ids = (new URLSearchParams(location.search).get("ids") || "").split(",").filter(Boolean);
  const todosItens = await todos();
  itens = ids.map((id) => todosItens.find((x) => x.id === id)).filter(Boolean).map((x) => ({ ...x, dados: forcar || x.pautaV !== 2 ? null : x.pautaDados || null }));
  desenhar();
  let n = 0;
  for (const it of itens) {
    $("msg").textContent = `Lendo a Mesa de Audiência (${++n} de ${itens.length}): ${it.processo}…`;
    await ler(it, forcar); desenhar();
  }
  const falhas = itens.filter((i) => !i.dados).length;
  $("msg").textContent = falhas ? `${itens.length - falhas} de ${itens.length} lido(s) da Mesa. ${falhas} não lido(s): confira se a aba do Studio está aberta e logada.` : `Pauta pronta (${itens.length} audiência(s)). As células são editáveis; confira antes de imprimir.`;
}

$("imprimir").onclick = () => window.print();
$("reler").onclick = () => montar(true);
$("copiar").onclick = async () => {
  const t = [...document.querySelectorAll(".folha")].map((f) => f.querySelector("h2").textContent + "\n\n" + [...f.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("td")].map((c) => c.innerText.replace(/\n{2,}/g, "\n").trim().replace(/\n/g, " / ")).join("  |  ")).join("\n")).join("\n\n\n");
  await navigator.clipboard.writeText(t); $("msg").textContent = "Pauta copiada.";
};
window.__pautaDoc = { montar, desenhar, get itens() { return itens; }, set itens(v) { itens = v; } };
montar(false);
