// Pauta geral de audiências: lê a lista do Projudi (por serventia), baixa os autos dos processos marcados pela esteira automática (lote)
// e preenche a pauta com o que o texto do processo informa (intimações, ofícios, denúncia…). Tudo editável e marcado "conferir".
const BASE = "https://projudi.tjgo.jus.br/";
const $ = (id) => document.getElementById(id);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chave = (p) => String(p).replace(/\D/g, "").slice(0, 9);
let pauta = [], servs = [];

// O Projudi responde em ISO-8859-1 (windows-1252): ler como UTF-8 estraga os acentos.
function decodificar(buf, tipo) {
  const cs = (/charset=([\w-]+)/i.exec(tipo || "") || [])[1];
  if (cs) { try { return new TextDecoder(cs).decode(buf); } catch { /* charset desconhecido */ } }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); }
}
const buscar = async (url) => { const r = await fetch(new URL(url, BASE).href, { credentials: "include" }); if (!r.ok) throw new Error("HTTP " + r.status); return decodificar(await r.arrayBuffer(), r.headers.get("content-type")); };
const dataExtenso = (iso) => { const [a, m, d] = iso.split("-"); return `${+d} de ${MESES[+m - 1]} de ${a}`; };
const dataBr = (iso) => iso.split("-").reverse().join("/");

async function carregarServentias() {
  try {
    const r = window.ProjudiParser.parseLista(await buscar("Usuario?PaginaAtual=9"));
    servs = r.itens;
    $("serv").innerHTML = '<option value="">(serventia atual da sessão)</option>' + servs.map((s, i) => `<option value="${i}">${esc(s.serventia)} — ${esc(s.perfil)}</option>`).join("");
  } catch { /* sem sessão: segue só com a atual */ }
}

async function lerLista() {
  const s = servs[+$("serv").value];
  if (s) { $("msg").textContent = "Entrando na serventia " + s.serventia + "…"; await buscar(s.href); }
  const url = `Audiencia?PaginaAtual=2&AudienciaTipoCodigo=${$("tipo").value}&fluxo=${$("fluxo").value}`;
  const vistos = new Set([url]); const fila = [url]; const todas = [];
  while (fila.length && vistos.size < 60) {
    const u = fila.shift();
    $("msg").textContent = `Lendo a lista de audiências… (${vistos.size} página(s))`;
    const r = window.ProjudiParser.parseAudiencias(await buscar(u));
    if (!r.logado) throw new Error("Sessão do Projudi não encontrada: entre no Projudi e escolha a serventia.");
    if (r.linhas === null) throw new Error("Não achei a tabela de audiências. Confira se a serventia está selecionada.");
    todas.push(...r.linhas.map((l) => ({ ...l, serventiaUrl: s ? s.href : "", serventiaNome: s ? s.serventia : l.serventia })));
    r.paginas.filter((p) => /^\d+$/.test(p.texto)).forEach((p) => { if (!vistos.has(p.href)) { vistos.add(p.href); fila.push(p.href); } });
  }
  return todas;
}

// ---- desenho no formato da pauta do gabinete: HORA | PROCESSO | AUTOR | VÍTIMA/TESTEMUNHAS ----
const celAutor = (l) => { const d = l.dados; return `<span class="nome">${esc(l.promovido)}</span>` + (d ? [
  d.nascimentoReu && `Data de nascimento do réu: ${esc(d.nascimentoReu)}`, d.dataFato && `Data do fato: ${esc(d.dataFato)}`,
  d.denunciaMov != null && `Denúncia – mov. ${d.denunciaMov}`, d.recebimentoMov != null && `Recebeu denúncia – mov. ${d.recebimentoMov}`].filter(Boolean).map((x) => "\n" + x).join("") + "\n<span class=\"sug\">[conferir nos autos]</span>" : ""); };
const celPessoas = (l) => { const d = l.dados; let h = l.promovente ? `<span class="rot">Promovente:</span> <b>${esc(l.promovente)}</b>` : "";
  if (d) {
    const v = d.pessoas.filter((p) => p.papel === "vitima"), t = d.pessoas.filter((p) => p.papel !== "vitima");
    const pes = (p) => `\n<b>${esc(p.nome)}</b>${p.situacao ? "\n" + esc(p.situacao) : ""}`;
    if (v.length) h += `\n<span class="dest">VÍTIMA</span>` + v.map(pes).join("");
    if (t.length) h += `\n<span class="dest">TESTEMUNHAS</span>` + t.map(pes).join("");
    if (d.mandadoNaoDevolvido) h += `\n<span class="alerta">Mandado não foi devolvido</span>`;
    if (!d.pessoas.length) h += `\n<span class="sug">[nenhuma testemunha/vítima identificada no texto — conferir]</span>`;
  }
  return h; };
const celProc = (l) => `${esc(l.processo)}${l.dados?.artigo ? `\n\n${esc(l.dados.artigo)}` : ""}\n<span class="sug">${esc(l.status)}</span>`;

function desenhar() {
  const dias = {};
  pauta.forEach((l) => (dias[l.data] = dias[l.data] || []).push(l));
  $("saida").innerHTML = Object.keys(dias).sort().map((d) => `<div class="folha"><h2 class="dia">Audiências ${esc(dataBr(d))}</h2><table class="p"><thead><tr><th class="h">HORA</th><th class="n">PROCESSO</th><th>AUTOR</th><th>VÍTIMA/ TESTEMUNHAS</th></tr></thead><tbody>` +
    dias[d].sort((a, b) => a.hora.localeCompare(b.hora)).map((l) => `<tr data-k="${chave(l.processo)}"><td class="h"><label class="nao-imprimir"><input type="checkbox" class="sel" ${l.marcado ? "checked" : ""}></label><br>${esc(l.hora.replace(":", "h").replace(/h00$/, ":00").replace("h", ":"))}</td>` +
      `<td class="n"><div class="cel" contenteditable="true">${celProc(l)}</div></td><td><div class="cel" contenteditable="true">${celAutor(l)}</div></td><td><div class="cel" contenteditable="true">${celPessoas(l)}</div></td></tr>`).join("") + `</tbody></table></div>`).join("");
  document.querySelectorAll(".sel").forEach((c) => (c.onchange = () => { const k = c.closest("tr").dataset.k; pauta.find((l) => chave(l.processo) === k).marcado = c.checked; $("analisar").disabled = !pauta.some((l) => l.marcado); }));
  $("analisar").disabled = !pauta.some((l) => l.marcado);
}

$("gerar").onclick = async () => {
  try {
    $("gerar").disabled = true; pauta = [];
    let l = await lerLista();
    const de = $("de").value, ate = $("ate").value;
    pauta = l.filter((x) => (!de || x.data >= de) && (!ate || x.data <= ate)).map((x) => ({ ...x, marcado: true }));
    desenhar(); $("msg").textContent = pauta.length ? `${pauta.length} audiência(s) lida(s). Desmarque as que não quer analisar e clique em “2. Analisar…”.` : "Nenhuma audiência no período.";
  } catch (e) { $("msg").textContent = "Erro: " + (e.message || e); } finally { $("gerar").disabled = false; }
};

// esteira automática: o lote baixa o PDF completo de cada processo marcado (dentro da serventia) e o OCR devolve os dados da pauta
$("analisar").onclick = async () => {
  const marcados = pauta.filter((l) => l.marcado && l.url);
  if (!marcados.length) { $("msg").textContent = "Marque ao menos um processo (com link na lista)."; return; }
  const id = "pauta" + Date.now();
  const itens = marcados.map((l) => ({ processo: l.processo, url: l.url, classificador: "pauta", serventia: l.serventiaNome || "", serventiaUrl: l.serventiaUrl || "", situacao: "" }));
  await chrome.storage.local.set({ pauta_ativa: true, ["lote_" + id]: { itens, pasta: "Projudi/Pauta", opcoes: { studio: { ativo: false } } } });
  chrome.tabs.create({ url: chrome.runtime.getURL("lote.html?lote=" + id), active: false });
  $("msg").textContent = `Esteira em andamento: ${marcados.length} processo(s). A pauta é preenchida aqui conforme cada processo termina (pode levar alguns minutos por processo).`;
};
const aplicar = (k, v) => { const l = pauta.find((x) => chave(x.processo) === k); if (l && v?.dados) { l.dados = v.dados; return true; } return false; };
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return; let mudou = false;
  Object.keys(c).filter((k) => k.startsWith("pauta_res_") && c[k].newValue).forEach((k) => { if (aplicar(k.slice(10), c[k].newValue)) mudou = true; });
  if (mudou) { const ed = document.activeElement; if (!ed?.classList?.contains("cel")) { desenhar(); $("msg").textContent = `${pauta.filter((l) => l.dados).length} de ${pauta.filter((l) => l.marcado).length} processo(s) analisado(s).`; } }
});
$("imprimir").onclick = () => window.print();
$("copiar").onclick = async () => {
  const t = [...document.querySelectorAll(".folha")].map((f) => f.querySelector("h2").textContent + "\n" + [...f.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((c) => c.innerText.replace(/\n+/g, " / ").trim()).join("  |  ")).join("\n")).join("\n\n");
  await navigator.clipboard.writeText(t); $("msg").textContent = "Pauta copiada.";
};
window.__pauta = { get: () => pauta, desenhar, aplicar };
carregarServentias();
