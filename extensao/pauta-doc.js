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
  const parte = (rot, nome, sit, alerta, adv) => (rot ? `<span class="rot">${esc(rot)}: </span>` : "") + `<span class="nome">${esc(nome)}</span>` + (sit ? `\n<span class="${alerta ? "alerta" : ""}">${esc(sit)}</span>` : "") + (adv ? `\n${esc(adv)}` : "");
  const advSoltos = d.advogados.length ? d.advogados.map(esc).join("\n") : "";
  const partes = d.criminal
    ? parte("", nomeReu || nomeAutor, d.situacaoReu, d.alertaReu, d.advReu)
    : [nomeAutor && parte("AUTOR", nomeAutor, d.situacaoAutor, d.alertaAutor, d.advAutor), nomeReu && parte("RÉU", nomeReu, d.situacaoReu, d.alertaReu, d.advReu)].filter(Boolean).join("\n\n");
  const corpo = [d.autos ? "" : advSoltos, notas.map(esc).join("\n"), evs.join("\n")].filter(Boolean).join("\n\n");
  const aviso = d.autosOutro ? "[o texto bruto aberto na Mesa é de outro processo e não foi usado: reanalise esta audiência na Mesa]" : !d.autos ? "[sem o texto bruto dos autos: atualize o Studio e reenvie o processo à Mesa para completar citações, intimações e datas]" : "";
  const c3 = partes + (corpo ? "\n\n" + corpo : "") + (aviso ? `\n<span class="sug nao-imprimir">${esc(aviso)}</span>` : "") + (d.vazio ? `\n<span class="sug nao-imprimir">[nada localizado nas abas da Mesa para esta audiência: confira o Briefing e o Roteiro no Studio e use “Reler a Mesa”.]</span>` : "");
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
    it.dados = dadosPautaMesa(lido, { autor: it.audPromovente, reu: it.audPromovido, processo: it.processo }); it.erroLeitura = "";
    await atualizar(it.id, { pautaDados: it.dados, pautaEm: Date.now(), pautaV: 3 });
  } catch (e) { it.dados = null; it.erroLeitura = e.message || String(e); }
}

async function montar(forcar) {
  const ids = (new URLSearchParams(location.search).get("ids") || "").split(",").filter(Boolean);
  const todosItens = await todos();
  itens = ids.map((id) => todosItens.find((x) => x.id === id)).filter(Boolean).map((x) => ({ ...x, dados: forcar || x.pautaV !== 3 ? null : x.pautaDados || null }));
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
// Google Docs: copia a pauta formatada (tabela, negrito, amarelo, vermelho) e abre um documento em branco; o usuário cola (Ctrl+V) e edita
function htmlParaDocs() {
  const estilo = { nome: "font-weight:bold;text-transform:uppercase", rot: "font-weight:bold", dest: "background:#ffff00;font-weight:bold", alerta: "color:#d00000", peq: "font-size:8pt" };
  const limpa = (cel) => {
    const c = cel.cloneNode(true);
    c.querySelectorAll(".nao-imprimir,.sug").forEach((e) => e.remove());
    c.querySelectorAll("[class]").forEach((e) => { const st = [...e.classList].map((k) => estilo[k]).filter(Boolean).join(";"); e.removeAttribute("class"); if (st) e.setAttribute("style", st); });
    c.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
    return c.innerHTML.replace(/\n/g, "<br>");
  };
  return [...document.querySelectorAll(".folha")].map((f, i) => {
    const linhas = [...f.querySelectorAll("tbody tr")].map((tr) => "<tr>" + [...tr.querySelectorAll("td")].map((td, k) => `<td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font:10pt Arial;${k === 0 ? "width:7%" : k === 1 ? "width:22%" : ""}">${limpa(td)}</td>`).join("") + "</tr>").join("");
    return (i ? '<br style="page-break-before:always">' : "") + `<p style="text-align:center;font:bold 12pt Arial;text-transform:uppercase">${esc(f.querySelector("h2").textContent)}</p><table style="border-collapse:collapse;width:100%">${linhas}</table>`;
  }).join("");
}
$("docs").onclick = async () => {
  const html = htmlParaDocs(), titulo = document.querySelector("h2.dia")?.textContent || "Pauta de audiências";
  let copiou = false;
  try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([document.querySelector(".folha")?.innerText || ""], { type: "text/plain" }) })]); copiou = true; } catch (e) { /* sem permissão: o usuário usa Copiar texto */ }
  await chrome.storage.local.set({ pauta_docs_pend: { titulo, html, texto: document.querySelector(".folha")?.innerText || "", ts: Date.now() } });      // a extensão cola sozinha no Docs que vai abrir
  chrome.tabs.create({ url: "https://docs.google.com/document/create?title=" + encodeURIComponent(titulo), active: true });
  $("msg").textContent = "Abrindo o Google Docs: a pauta é inserida sozinha em alguns segundos." + (copiou ? " Se o documento ficar em branco, aperte Ctrl+V (a pauta já está copiada)." : " Se ficar em branco, use “Copiar texto” e cole.");
};
$("reler").onclick = () => montar(true);
$("copiar").onclick = async () => {
  const t = [...document.querySelectorAll(".folha")].map((f) => f.querySelector("h2").textContent + "\n\n" + [...f.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("td")].map((c) => c.innerText.replace(/\n{2,}/g, "\n").trim().replace(/\n/g, " / ")).join("  |  ")).join("\n")).join("\n\n\n");
  await navigator.clipboard.writeText(t); $("msg").textContent = "Pauta copiada.";
};
window.__pautaDoc = { montar, desenhar, get itens() { return itens; }, set itens(v) { itens = v; } };
montar(false);
