const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const padraoDe = (txt) => { const t = txt.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""); return t ? (t.startsWith("*") ? `*://${t}/*` : `*://*.${t}/*`) : ""; };
async function cfg() { return { ativo: false, sites: [], rotulos: true, ...((await chrome.storage.local.get("cfg")).cfg || {}) }; }
const salvarCfg = (c) => chrome.storage.local.set({ cfg: c });

async function desenhar() {
  const c = await cfg(), { tarefas = [], eventos = [] } = await chrome.storage.local.get(["tarefas", "eventos"]);
  const aut = await Promise.all(c.sites.map((s) => chrome.permissions.contains({ origins: [s.padrao] })));
  $("sites").innerHTML = c.sites.length ? `<table><tr><th>Site</th><th>Permissão</th><th></th></tr>${c.sites.map((s, i) => `<tr><td>${esc(s.padrao)}</td><td class="${aut[i] ? "ok" : "erro"}">${aut[i] ? "autorizado" : "falta autorizar"}</td><td><button class="r" data-rm="${i}">Remover</button></td></tr>`).join("")}</table>` : '<p class="dica">Nenhum site ainda.</p>';
  $("rotulos").checked = c.rotulos;
  $("tarefas").innerHTML = tarefas.length ? tarefas.map((t, ti) => `<h3>${esc(t.nome)} <button data-rt="${ti}">Renomear</button> <button class="r" data-dt="${ti}">Excluir tarefa</button></h3><table>${t.passos.map((p, i) => `<tr><td>${i + 1}</td><td>${{ clicar: "Clicar em", preencher: "Preencher", selecionar: "Escolher" }[p.tipo]} “${esc(p.alvo.texto || p.alvo.name || p.alvo.id || p.alvo.css)}”</td><td>${p.tipo === "clicar" ? "" : p.tipo === "preencher" ? `<label><input type="checkbox" data-var="${ti}:${i}" ${p.variavel ? "checked" : ""}> perguntar o valor ao executar</label> ${p.variavel ? "" : `<input type="text" data-val="${ti}:${i}" value="${esc(p.valor || "")}" placeholder="valor fixo" size="18">`}` : `valor: ${esc(p.valor)}`}</td><td><button class="r" data-dp="${ti}:${i}">×</button></td></tr>`).join("")}</table>`).join("") : '<p class="dica">Nenhuma. Grave pelo ícone da extensão.</p>';
  $("info").textContent = `${eventos.length} evento(s) guardados.`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const c = await cfg();
  if (b.id === "add") {
    const padrao = padraoDe($("novo").value); if (!padrao) return;
    const ok = await chrome.permissions.request({ origins: [padrao] });
    if (!ok) { $("info").textContent = "Permissão negada: o site não foi adicionado."; return; }
    if (!c.sites.some((s) => s.padrao === padrao)) c.sites.push({ padrao }); await salvarCfg(c); $("novo").value = ""; await chrome.runtime.sendMessage({ acao: "registrar" });
  } else if (b.dataset.rm !== undefined) { const [s] = c.sites.splice(+b.dataset.rm, 1); await salvarCfg(c); await chrome.permissions.remove({ origins: [s.padrao] }).catch(() => {}); await chrome.runtime.sendMessage({ acao: "registrar" }); }
  else if (b.id === "apagar") { if (confirm("Apagar eventos e relatórios? (As tarefas gravadas ficam.)")) await chrome.storage.local.remove(["eventos"]); }
  else if (b.dataset.rt !== undefined || b.dataset.dt !== undefined || b.dataset.dp !== undefined) {
    const { tarefas = [] } = await chrome.storage.local.get("tarefas");
    if (b.dataset.rt !== undefined) { const n = prompt("Novo nome:", tarefas[+b.dataset.rt].nome); if (n) tarefas[+b.dataset.rt].nome = n; }
    else if (b.dataset.dt !== undefined) { if (confirm("Excluir esta tarefa?")) tarefas.splice(+b.dataset.dt, 1); }
    else { const [ti, i] = b.dataset.dp.split(":").map(Number); tarefas[ti].passos.splice(i, 1); }
    await chrome.storage.local.set({ tarefas });
  }
  desenhar();
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "rotulos") { const c = await cfg(); c.rotulos = t.checked; await salvarCfg(c); return; }
  const { tarefas = [] } = await chrome.storage.local.get("tarefas");
  if (t.dataset.var) { const [ti, i] = t.dataset.var.split(":").map(Number); tarefas[ti].passos[i].variavel = t.checked; if (t.checked) delete tarefas[ti].passos[i].valor; }
  else if (t.dataset.val) { const [ti, i] = t.dataset.val.split(":").map(Number); tarefas[ti].passos[i].valor = t.value; }
  else return;
  await chrome.storage.local.set({ tarefas }); desenhar();
});
chrome.storage.onChanged.addListener((c) => { if (c.eventos || c.cfg) desenhar(); });
desenhar();
