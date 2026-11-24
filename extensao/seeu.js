// Painel do SEEU (início): permissão, verificação da aba e diagnóstico das telas (todos os frames).
const $ = (id) => document.getElementById(id);
const ORIGENS = ["https://seeu.pje.jus.br/*"];
const msg = (t, tipo) => { const m = $("msg"); m.textContent = t; m.className = tipo || ""; };
const temPermissao = () => chrome.permissions.contains({ origins: ORIGENS });
const abasSeeu = async () => (await chrome.tabs.query({ url: ORIGENS })).filter((t) => !!t.id);

async function atualizar() {
  const ok = await temPermissao();
  $("permEstado").textContent = ok ? "✔ Autorizado" : "Ainda não autorizado.";
  $("permEstado").className = ok ? "ok" : "";
  $("btnPerm").disabled = ok;
  const abas = ok ? await abasSeeu() : [];
  $("abaEstado").textContent = !ok ? "Autorize o SEEU primeiro." : abas.length ? `✔ ${abas.length} aba(s) do SEEU aberta(s).` : "Não achei nenhuma aba do SEEU aberta. Abra o SEEU e clique em “Verificar agora”.";
  $("abaEstado").className = abas.length ? "ok" : "";
  $("btnCopiar").disabled = $("btnBaixar").disabled = $("btnAreas").disabled = $("btnLista").disabled = !abas.length;
}

async function diagnostico() {
  const abas = await abasSeeu(); if (!abas.length) throw new Error("Abra o SEEU em uma aba e tente de novo.");
  const aba = abas.find((t) => t.active) || abas[0];
  const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func: coletarFrameSeeu });
  const quadros = rs.map((r) => r.result).filter(Boolean);
  const partes = quadros.map((q, i) => `===== QUADRO ${i + 1}${q.topo ? " (moldura externa)" : ""} — ${q.url}${q.titulo ? " — " + q.titulo : ""}${q.nome ? " — nome=" + q.nome : ""} =====\n${q.erro ? "ERRO: " + q.erro : q.html}`);
  return { texto: `DIAGNÓSTICO DO SEEU — ${quadros.length} quadro(s)\n\n` + partes.join("\n\n"), quadros: quadros.length };
}

$("btnPerm").onclick = async () => { try { const g = await chrome.permissions.request({ origins: ORIGENS }); msg(g ? "SEEU autorizado." : "Você não autorizou. Sem isso a extensão não consegue ver as telas do SEEU.", g ? "ok" : "erro"); } catch (e) { msg("✖ " + e.message, "erro"); } await atualizar(); };
$("btnVerificar").onclick = async () => { await atualizar(); msg("Verificado.", "ok"); };
$("btnCopiar").onclick = async () => { try { const d = await diagnostico(); await navigator.clipboard.writeText(d.texto); msg(`Diagnóstico copiado (${d.quadros} quadro(s), ${Math.round(d.texto.length / 1000)} mil caracteres). Cole na conversa.`, "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
$("btnBaixar").onclick = async () => { try { const d = await diagnostico(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([d.texto], { type: "text/plain;charset=utf-8" })); a.download = "diagnostico-seeu.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); msg("Arquivo baixado. Anexe na conversa.", "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
// Executa um leitor em todos os quadros da aba e devolve o primeiro resultado que serve.
async function lerNaAba(func, serve) {
  const abas = await abasSeeu(); if (!abas.length) throw new Error("Abra o SEEU em uma aba e tente de novo.");
  const aba = abas.find((t) => t.active) || abas[0];
  const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func });
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
$("btnAreas").onclick = async () => { try {
  const r = await lerNaAba(lerAreasSeeu, (x) => x.areas && x.areas.length); if (!r) throw new Error("Não achei a lista de serventias. Deixe aberta a tela “Área de atuação” (menu: Alterar Atuação) e tente de novo.");
  $("areas").innerHTML = r.areas.map((a) => `<div>• ${esc(a.nome)}</div>`).join(""); msg(`${r.areas.length} serventia(s) encontrada(s).`, "ok");
} catch (e) { msg("✖ " + e.message, "erro"); } };
atualizar().catch((e) => msg("✖ " + e.message, "erro"));
