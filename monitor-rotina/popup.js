const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let dados = {};
const rotuloPasso = (p) => `${{ clicar: "Clicar em", preencher: "Preencher", selecionar: "Escolher" }[p.tipo]} “${p.alvo.texto || p.alvo.name || p.alvo.id || "campo"}”`;

async function desenhar() {
  dados = await chrome.storage.local.get(["cfg", "gravacao", "tarefas", "execucao"]);
  const cfg = dados.cfg || { ativo: false, sites: [] }, g = dados.gravacao, tarefas = dados.tarefas || [];
  $("mon").textContent = cfg.ativo ? "⏸ Pausar monitor" : "▶ Ligar monitor";
  $("monTxt").textContent = cfg.ativo ? `Ligado em ${cfg.sites.length} site(s)` : "Desligado (nada é registrado)";
  $("grav").innerHTML = g && g.ativa
    ? `<p class="erro"><b>● Gravando…</b> ${g.passos.length} passo(s). Faça a tarefa na página e volte aqui.</p><div class="linha"><input type="text" id="nome" placeholder="Nome da tarefa" size="26"><button class="p" id="salvar">■ Parar e salvar</button><button class="r" id="cancelar">Descartar</button></div>`
    : `<button id="gravar">● Começar a gravar</button> <small>Só nos sites autorizados.</small>`;
  $("tarefas").innerHTML = tarefas.length ? tarefas.map((t) => `<div class="linha"><span>${esc(t.nome)} <small>(${t.passos.length} passos)</small></span><button data-exec="${t.id}">▶ Executar</button></div>`).join("") : "Nenhuma ainda.";
  const x = dados.execucao;
  $("exec").innerHTML = x ? `<p class="${x.estado === "erro" ? "erro" : x.estado === "concluida" ? "ok" : ""}">${{ rodando: `Executando passo ${x.i + 1} de ${x.total}…`, concluida: "✔ Tarefa concluída.", erro: "✖ " + esc(x.erro), parada: "Parada." }[x.estado]} ${x.estado === "rodando" ? '<button id="parar" class="r">Parar</button>' : ""}</p>` : "";
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const cfg = dados.cfg || { ativo: false, sites: [], rotulos: true };
  if (b.id === "mon") await chrome.storage.local.set({ cfg: { ...cfg, ativo: !cfg.ativo } });
  else if (b.id === "gravar") await chrome.storage.local.set({ gravacao: { ativa: true, passos: [], inicio: Date.now() } });
  else if (b.id === "cancelar") await chrome.storage.local.remove("gravacao");
  else if (b.id === "salvar") {
    const g = (await chrome.storage.local.get("gravacao")).gravacao, nome = $("nome").value.trim() || "Tarefa " + new Date().toLocaleString("pt-BR");
    if (g && g.passos.length) { const { tarefas = [] } = await chrome.storage.local.get("tarefas"); tarefas.push({ id: "t" + Date.now(), nome, passos: g.passos, criada: Date.now() }); await chrome.storage.local.set({ tarefas }); }
    await chrome.storage.local.remove("gravacao");
  } else if (b.dataset.exec) {
    const t = (dados.tarefas || []).find((x) => x.id === b.dataset.exec), vars = t.passos.map((p, i) => [p, i]).filter(([p]) => p.variavel);
    if (!vars.length) return iniciar(t, {});
    $("exec").innerHTML = `<h2>${esc(t.nome)}</h2>` + vars.map(([p, i]) => `<div class="linha"><label>${esc(rotuloPasso(p))}: <input type="text" data-v="${i}" size="22"></label></div>`).join("") + `<button class="p" id="ir" data-id="${t.id}">Executar</button>`;
    return;
  } else if (b.id === "ir") {
    const t = (dados.tarefas || []).find((x) => x.id === b.dataset.id), valores = {};
    document.querySelectorAll("[data-v]").forEach((i) => (valores[i.dataset.v] = i.value)); return iniciar(t, valores);
  } else if (b.id === "parar") await chrome.runtime.sendMessage({ acao: "parar" });
  else if (b.id === "rel") chrome.tabs.create({ url: chrome.runtime.getURL("relatorio.html") });
  else if (b.id === "opc") chrome.runtime.openOptionsPage();
  desenhar();
});
async function iniciar(t, valores) {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.remove("execucao");
  chrome.runtime.sendMessage({ acao: "executar", id: t.id, valores: Object.fromEntries(t.passos.map((p, i) => [i, p.variavel ? valores[i] : p.valor]).filter(([, v]) => v !== undefined)), tabId: aba.id });
  setTimeout(desenhar, 500);
}
chrome.storage.onChanged.addListener(() => desenhar());
desenhar();
