// Pauta geral de audiências: lê a lista do Projudi (Audiências > Pendentes) e, opcionalmente, as movimentações de cada processo.
const BASE = "https://projudi.tjgo.jus.br/";
const $ = (id) => document.getElementById(id);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let pauta = [];

const buscar = async (url) => { const r = await fetch(new URL(url, BASE).href, { credentials: "include" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); };
const dataExtenso = (iso) => { const [a, m, d] = iso.split("-"); return `${d} de ${MESES[+m - 1]} de ${a}`; };

async function lerLista() {
  const url = `Audiencia?PaginaAtual=2&AudienciaTipoCodigo=${$("tipo").value}&fluxo=${$("fluxo").value}`;
  const vistos = new Set([url]); const fila = [url]; const todas = [];
  while (fila.length && vistos.size < 60) {
    const u = fila.shift();
    $("msg").textContent = `Lendo a lista de audiências… (${vistos.size} página(s))`;
    const r = window.ProjudiParser.parseAudiencias(await buscar(u));
    if (!r.logado) throw new Error("Sessão do Projudi não encontrada: entre no Projudi e escolha a serventia.");
    if (r.linhas === null) throw new Error("Não achei a tabela de audiências. Confira se a serventia está selecionada.");
    todas.push(...r.linhas);
    r.paginas.filter((p) => /^\d+$/.test(p.texto)).forEach((p) => { if (!vistos.has(p.href)) { vistos.add(p.href); fila.push(p.href); } });
  }
  return todas;
}

async function lerProcesso(l) {
  if (!l.url) return [];
  try { return window.ProjudiParser.parseMovimentacoesPauta(await buscar(l.url)); } catch { return []; }
}
const textoSugestao = (movs) => {
  const g = (t) => movs.filter((m) => m.tipo === t).map((m) => m.mov);
  const lin = [];
  [["intimacao", "Intimação mov."], ["citacao", "Citação mov."], ["oficio", "Ofício mov."], ["mandado", "Mandado mov."], ["denuncia", "Denúncia mov."]].forEach(([t, r]) => { const x = g(t); if (x.length) lin.push(`${r} ${x.join(", ")}`); });
  return lin.length ? lin.join("\n") + "\n[conferir nos autos]" : "";
};

function desenhar() {
  const dias = {};
  pauta.forEach((l) => (dias[l.data] = dias[l.data] || []).push(l));
  $("saida").innerHTML = Object.keys(dias).sort().map((d) => `<div class="folha"><h2 class="dia">Pauta dia ${esc(dataExtenso(d))}</h2><table class="p">` +
    dias[d].sort((a, b) => a.hora.localeCompare(b.hora)).map((l) => `<tr><td class="h">${esc(l.hora.replace(":", "h"))}</td><td class="n">${esc(l.processo)}<small>${esc(l.status)}</small></td>` +
      `<td class="parte"><span class="rot">Promovente</span><b>${esc(l.promovente)}</b><span class="rot">Promovido</span><b>${esc(l.promovido)}</b></td>` +
      `<td><div class="obs" contenteditable="true">${l.obs ? `<span class="sug">${esc(l.obs).replace(/\n/g, "<br>")}</span>` : ""}</div></td></tr>`).join("") + `</table></div>`).join("");
  $("msg").textContent = pauta.length ? `${pauta.length} audiência(s). Os campos da última coluna são editáveis; o que aparece em amarelo é sugestão lida das movimentações e precisa ser conferido.` : "Nenhuma audiência no período.";
}

$("gerar").onclick = async () => {
  try {
    $("gerar").disabled = true; pauta = [];
    let l = await lerLista();
    const de = $("de").value, ate = $("ate").value;
    l = l.filter((x) => (!de || x.data >= de) && (!ate || x.data <= ate));
    if ($("lerProc").checked) for (let i = 0; i < l.length; i++) { $("msg").textContent = `Lendo processo ${i + 1} de ${l.length}…`; l[i].obs = textoSugestao(await lerProcesso(l[i])); }
    pauta = l; desenhar();
  } catch (e) { $("msg").textContent = "Erro: " + (e.message || e); } finally { $("gerar").disabled = false; }
};
$("imprimir").onclick = () => window.print();
$("copiar").onclick = async () => {
  const t = [...document.querySelectorAll(".folha")].map((f) => f.querySelector("h2").textContent + "\n" + [...f.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\n+/g, " / ")).join("  ")).join("\n")).join("\n\n");
  await navigator.clipboard.writeText(t); $("msg").textContent = "Pauta copiada.";
};
