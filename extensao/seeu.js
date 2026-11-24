// Painel do SEEU (início): permissão, verificação da aba e diagnóstico das telas (todos os frames).
const $ = (id) => document.getElementById(id);
const ORIGENS = ["https://seeu.pje.jus.br/*"];
const msg = (t, tipo) => { const m = $("msg"); m.textContent = t; m.className = tipo || ""; };
const temPermissao = () => chrome.permissions.contains({ origins: ORIGENS });
const abasSeeu = async () => (await chrome.tabs.query({ url: ORIGENS })).filter((t) => !!t.id);

let lendoAreas = false;
// A permissão do SEEU é opcional (a loja não desativa a extensão ao atualizar); o Chrome só deixa pedir num clique. Pedimos no primeiro clique em qualquer ponto da página.
document.addEventListener("click", async () => { if (!(await temPermissao())) { try { await chrome.permissions.request({ origins: ORIGENS }); } catch (e) { /* recusou */ } atualizar().catch(() => {}); } }, true);
async function atualizar() {
  if (!(await temPermissao())) { $("estadoSeeu").textContent = "Clique em qualquer lugar desta página para liberar o SEEU (o Chrome pergunta uma única vez)."; $("estadoSeeu").className = "dica"; $("btnAbrirSeeu").hidden = true; $("btnCopiar").disabled = $("btnBaixar").disabled = $("btnAreas").disabled = $("btnLista").disabled = true; return; }
  const abas = await abasSeeu();
  $("estadoSeeu").textContent = abas.length ? `✔ SEEU encontrado (${abas.length} aba(s)).` : "Não achei o SEEU aberto. Abra-o e entre como de costume (a extensão nunca digita sua senha).";
  $("estadoSeeu").className = abas.length ? "dica ok" : "dica";
  $("btnAbrirSeeu").hidden = !!abas.length;
  $("btnCopiar").disabled = $("btnBaixar").disabled = $("btnAreas").disabled = $("btnLista").disabled = !abas.length;
  if (abas.length && !lendoAreas && !$("areas").innerHTML) { lendoAreas = true; try { await lerAreas(true); } finally { lendoAreas = false; } }
}
$("btnAbrirSeeu").onclick = () => chrome.tabs.create({ url: "https://seeu.pje.jus.br/seeu/" });
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.status === "complete" && /seeu\.pje\.jus\.br/.test(tab.url || "")) atualizar().catch(() => {}); });
chrome.tabs.onRemoved.addListener(() => atualizar().catch(() => {}));

async function diagnostico() {
  const abas = await abasSeeu(); if (!abas.length) throw new Error("Abra o SEEU em uma aba e tente de novo.");
  const aba = abas.find((t) => t.active) || abas[0];
  const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func: coletarFrameSeeu });
  const quadros = rs.map((r) => r.result).filter(Boolean);
  const partes = quadros.map((q, i) => `===== QUADRO ${i + 1}${q.topo ? " (moldura externa)" : ""} — ${q.url}${q.titulo ? " — " + q.titulo : ""}${q.nome ? " — nome=" + q.nome : ""} =====\n${q.erro ? "ERRO: " + q.erro : q.html}`);
  return { texto: `DIAGNÓSTICO DO SEEU — ${quadros.length} quadro(s)\n\n` + partes.join("\n\n"), quadros: quadros.length };
}

$("btnCopiar").onclick = async () => { try { const d = await diagnostico(); await navigator.clipboard.writeText(d.texto); msg(`Diagnóstico copiado (${d.quadros} quadro(s), ${Math.round(d.texto.length / 1000)} mil caracteres). Cole na conversa.`, "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
$("btnBaixar").onclick = async () => { try { const d = await diagnostico(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([d.texto], { type: "text/plain;charset=utf-8" })); a.download = "diagnostico-seeu.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); msg("Arquivo baixado. Anexe na conversa.", "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
// Executa um leitor em todos os quadros da aba e devolve o primeiro resultado que serve.
async function lerNaAba(func, serve, args) {
  const abas = await abasSeeu(); if (!abas.length) throw new Error("Abra o SEEU em uma aba e tente de novo.");
  const aba = abas.find((t) => t.active) || abas[0];
  const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func, args: args || [] });
  return rs.map((r) => r.result).find((r) => r && serve(r));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let lidos = [];
function mostrarMarcados() { const n = lidos.filter((p) => p.marcado).length; $("marcados").textContent = lidos.length ? `${n} de ${lidos.length} processo(s) marcado(s).` : ""; chrome.storage.local.set({ seeu_marcados: lidos.filter((p) => p.marcado).map((p) => ({ numero: p.numero, idConclusao: p.idConclusao, tipo: p.tipo })) }).catch(() => {}); }
function desenharLista() {
  $("lista").innerHTML = lidos.length ? `<table class="l"><tr><th><input type="checkbox" id="todos" title="Marcar todos"></th><th>Processo</th><th>Tipo</th><th>Entrada</th><th>Partes</th></tr>` + lidos.map((p, i) => `<tr><td><input type="checkbox" data-i="${i}" ${p.marcado ? "checked" : ""}></td><td>${esc(p.numero)}${p.urgente ? '<span class="tag">URGENTE</span>' : ""}${p.reuPreso ? '<span class="tag p">RÉU PRESO</span>' : ""}</td><td>${esc(p.tipo)}</td><td>${esc(p.entrada)}</td><td>${esc(p.partes.join("; "))}</td></tr>`).join("") + "</table>" : "";
  $("lista").querySelectorAll("input[data-i]").forEach((c) => { c.onchange = () => { lidos[+c.dataset.i].marcado = c.checked; mostrarMarcados(); }; });
  const t = $("todos"); if (t) t.onchange = () => { lidos.forEach((p) => { p.marcado = t.checked; }); desenharLista(); mostrarMarcados(); };
  mostrarMarcados();
}
$("btnLista").onclick = async () => { try {
  const r = await lerNaAba(lerConclusoesSeeu, (x) => x.ok); if (!r) throw new Error("Não achei a lista de Conclusões. Abra Conclusões no SEEU (e clique em Filtrar) e tente de novo.");
  lidos = r.processos; $("resumoLista").textContent = `${r.processos.length} processo(s) nesta página. ${r.contador}`; desenharLista(); msg(`Li ${r.processos.length} processo(s).`, "ok");
} catch (e) { msg("✖ " + e.message, "erro"); } };
async function lerAreas(silencioso) { try {
  const r = await lerNaAba(lerAreasSeeu, (x) => x.areas && x.areas.length); if (!r) throw new Error("Ainda não achei as serventias. Entre no SEEU (faça o login) e clique em “Ler serventias” de novo.");
  $("areas").innerHTML = r.areas.map((a) => `<div>• ${esc(a.nome)}</div>`).join(""); if (!silencioso) msg(`${r.areas.length} serventia(s) encontrada(s) (${r.fonte}).`, "ok");
} catch (e) { if (!silencioso) msg("✖ " + e.message, "erro"); } }
$("btnAreas").onclick = () => lerAreas(false);
// Menu "Conclusões" do SEEU: botões para abrir cada lista e já ler os processos
async function carregarMenu() { try {
  const m = await lerNaAba(lerMenuConclusoesSeeu, (x) => x.ok); const alvo = $("menuConclusoes"); if (!m) { alvo.innerHTML = ""; return; }
  const uteis = m.itens.filter((n) => /^Para (Despacho|Decisão|Sentença|Homologação)$|Urgência/.test(n));
  alvo.innerHTML = '<div class="dica">Abrir no SEEU e ler:</div>' + uteis.map((n, i) => `<button class="s" data-menu="${i}">${esc(n)}</button>`).join("");
  alvo.querySelectorAll("button[data-menu]").forEach((b) => { b.onclick = async () => { const nome = uteis[+b.dataset.menu]; try {
    msg(`Abrindo “${nome}” no SEEU…`);
    const ok = await lerNaAba(abrirMenuConclusoesSeeu, (x) => x.ok, [nome]); if (!ok) throw new Error("Não consegui abrir esse item do menu do SEEU.");
    let r = null; for (let k = 0; k < 20 && !r; k++) { await new Promise((s) => setTimeout(s, 1000)); r = await lerNaAba(lerConclusoesSeeu, (x) => x.ok && x.processos.length).catch(() => null); }
    if (!r) throw new Error("A tela abriu, mas não achei processos. Se o SEEU mostra um filtro, clique em Filtrar nele e depois em “Ler lista de Conclusões”.");
    lidos = r.processos; $("resumoLista").textContent = `${nome}: ${r.processos.length} processo(s) nesta página. ${r.contador}`; desenharLista(); msg(`Li ${r.processos.length} processo(s).`, "ok");
  } catch (e) { msg("✖ " + e.message, "erro"); } }; });
} catch (e) { /* sem menu */ } }
setTimeout(() => carregarMenu(), 1500);
atualizar().catch((e) => msg("✖ " + e.message, "erro"));
