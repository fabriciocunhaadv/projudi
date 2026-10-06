const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const { analisar, texto, dur } = MonAnalise;
async function desenhar() {
  const { eventos = [], tarefas = [] } = await chrome.storage.local.get(["eventos", "tarefas"]), dias = +$("per").value;
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const desde = dias === 0 ? 0 : dias === 1 ? hoje0.getTime() : Date.now() - dias * 86400000;
  const a = analisar(eventos, { desde });
  if (!a.totalEventos && !a.tempo.length) { $("conteudo").innerHTML = '<p class="dica">Ainda sem dados neste período. Ligue o monitor pelo ícone da extensão e adicione os sites em Opções.</p>'; $("txt").textContent = ""; return; }
  const tab = (tit, cab, linhas) => `<h2>${tit}</h2>${linhas.length ? `<table><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr>${linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>` : '<p class="dica">—</p>'}`;
  $("conteudo").innerHTML =
    tab("Tempo ativo por site", ["Site", "Tempo"], a.tempo.map(([s, ms]) => [s, dur(ms)])) +
    tab("Telas mais abertas", ["Vezes", "Tela"], a.paginas.map(([p, n]) => [n, p])) +
    tab("Botões/links mais clicados", ["Vezes", "Rótulo e tela"], a.cliques.map(([p, n]) => [n, p])) +
    tab("Sequências que se repetem — candidatas a automação", ["Vezes", "Passos"], a.sequencias.map((s) => [s.vezes + "×", s.passos.join("  →  ")])) +
    '<p class="dica">Dica: para automatizar uma sequência, grave-a como tarefa (ícone da extensão → “Começar a gravar”).</p>';
  $("txt").textContent = texto(a, tarefas);
}
$("per").onchange = desenhar;
$("copiar").onclick = async () => { await navigator.clipboard.writeText($("txt").textContent); $("ok").textContent = "Copiado! Cole no chat."; setTimeout(() => ($("ok").textContent = ""), 3000); };
chrome.storage.onChanged.addListener((c) => c.eventos && desenhar());
desenhar();
