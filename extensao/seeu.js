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
  if (!(await temPermissao())) { $("estadoSeeu").textContent = "Clique em qualquer lugar desta página para liberar o SEEU (o Chrome pergunta uma única vez)."; $("estadoSeeu").className = "dica"; $("btnAbrirSeeu").hidden = true; $("btnCopiar").disabled = $("btnBaixar").disabled = $("btnAreas").disabled = true; return; }
  const abas = await abasSeeu();
  $("estadoSeeu").textContent = abas.length ? `✔ SEEU encontrado (${abas.length} aba(s)).` : "Não achei o SEEU aberto. Abra-o e entre como de costume (a extensão nunca digita sua senha).";
  $("estadoSeeu").className = abas.length ? "dica ok" : "dica";
  $("btnAbrirSeeu").hidden = !!abas.length;
  $("btnCopiar").disabled = $("btnBaixar").disabled = $("btnAreas").disabled = $("btnRemetidos").disabled = !abas.length;
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
let lidos = [], serventiaDaLista = "";
function mostrarMarcados() { atualizarEnvio(); const n = lidos.filter((p) => p.marcado).length; $("marcados").textContent = lidos.length ? `${n} de ${lidos.length} processo(s) marcado(s).` : ""; chrome.storage.local.set({ seeu_marcados: lidos.filter((p) => p.marcado).map((p) => ({ numero: p.numero, idConclusao: p.idConclusao, tipo: p.tipo })) }).catch(() => {}); }
function desenharLista() {
  $("lista").innerHTML = lidos.length ? `<table class="l"><tr><th><input type="checkbox" id="todos" title="Marcar todos"></th><th>Processo</th><th>Tipo</th><th>Entrada</th><th>Agrupador / partes</th></tr>` + lidos.map((p, i) => `<tr><td><input type="checkbox" data-i="${i}" ${p.marcado ? "checked" : ""}></td><td>${esc(p.numero)}${p.urgente ? '<span class="tag">URGENTE</span>' : p.prioridade ? '<span class="tag">PRIORIDADE</span>' : ""}${p.reuPreso ? '<span class="tag p">RÉU PRESO</span>' : ""}</td><td>${esc(p.tipo)}</td><td>${esc(p.entrada)}</td><td>${esc(p.partes.length ? p.partes.join("; ") : (p.agrupador || ""))}</td></tr>`).join("") + "</table>" : "";
  $("lista").querySelectorAll("input[data-i]").forEach((c) => { c.onchange = () => { lidos[+c.dataset.i].marcado = c.checked; mostrarMarcados(); }; });
  const t = $("todos"); if (t) t.onchange = () => { lidos.forEach((p) => { p.marcado = t.checked; }); desenharLista(); mostrarMarcados(); };
  mostrarMarcados();
}
// Do mais antigo para o mais novo (data de envio da conclusão); sem data vai para o fim.
const tempoDe = (s) => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/); return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : Infinity; };
const ordenarMaisAntigoPrimeiro = (ps) => ps.map((p, i) => ({ p, i })).sort((a, b) => tempoDe(a.p.entrada) - tempoDe(b.p.entrada) || a.i - b.i).map((x) => x.p);
let atualSeeu = "";
const igual = (x, y) => String(x || "").replace(/\s+/g, " ").trim().toLowerCase() === String(y || "").replace(/\s+/g, " ").trim().toLowerCase();
async function lerTodosQuadros(func, args) { const abas = await abasSeeu(); if (!abas.length) return []; const aba = abas.find((t) => t.active) || abas[0]; const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func, args: args || [] }); return rs.map((r) => r.result).filter(Boolean); }
function desenharAreas(areas, atual, fonte) {
  const ha = areas.some((a) => igual(a.nome, atual));
  $("areas").innerHTML = (atual ? `<div class="atual" data-testid="seeu-serventia-atual">● Você está logado em: <b>${esc(atual)}</b></div>` : `<div class="dica">Não consegui ver em qual serventia você está logado.</div>`) +
    areas.map((a) => igual(a.nome, atual) ? `<div class="area atualItem">▶ ${esc(a.nome)} <span class="tag">LOGADO AQUI</span></div>` : `<div class="area">• ${esc(a.nome)}</div>`).join("") +
    (atual && !ha && areas.length ? `<div class="dica">(A serventia atual não está na lista acima; use “Ler serventias” de novo.)</div>` : "");
}
async function lerAreas(silencioso) { try {
  const rs = await lerTodosQuadros(lerAreasSeeu); const r = rs.find((x) => x.areas && x.areas.length); if (!r) throw new Error("Ainda não achei as serventias. Entre no SEEU (faça o login) e clique em “Ler serventias” de novo.");
  atualSeeu = rs.map((x) => x.atual).find(Boolean) || ""; desenharAreas(r.areas, atualSeeu, r.fonte);
  if (!silencioso) msg(`${r.areas.length} serventia(s) encontrada(s) (${r.fonte}).`, "ok");
} catch (e) { if (!silencioso) msg("✖ " + e.message, "erro"); } }
// Vigia: se você trocar de serventia no SEEU, o painel percebe, mostra a nova e descarta a lista antiga (era de outra serventia).
async function vigiarAtuacao() { try {
  if (!(await temPermissao())) return; const rs = await lerTodosQuadros(lerAtuacaoSeeu); const nova = rs.map((x) => x.atual).find(Boolean) || ""; if (!nova || igual(nova, atualSeeu)) return;
  const trocou = !!atualSeeu; atualSeeu = nova; await lerAreas(true);
  if (trocou && lidos.length) { lidos = []; $("lista").innerHTML = ""; $("resumoLista").textContent = ""; mostrarMarcados(); msg(`Você trocou de serventia: agora é ${nova}. A lista anterior foi apagada; abra os processos de novo.`, "erro"); }
} catch (e) { /* sem aba */ } }
setInterval(vigiarAtuacao, 4000);
$("btnAreas").onclick = () => lerAreas(false);
// Um só botão: "Processos Remetidos p/ Conclusão" já traz todos os processos da serventia em que você está.
async function abrirRemetidos() { try {
  if (!atualSeeu) await lerAreas(true);
  msg("Abrindo “Processos Remetidos p/ Conclusão” no SEEU…");
  const ok = await lerNaAba(abrirMenuConclusoesSeeu, (x) => x.ok); if (!ok) throw new Error("Não achei esse item no menu do SEEU. Abra o SEEU (tela com o menu no alto) e tente de novo.");
  let r = null; for (let k = 0; k < 20 && !r; k++) { await new Promise((s) => setTimeout(s, 1000)); r = await lerNaAba(lerConclusoesSeeu, (x) => x.ok && x.processos.length).catch(() => null); }
  if (!r) throw new Error("A tela abriu, mas não achei processos. Se o SEEU mostra um filtro, clique em Filtrar nele e depois em “Abrir Processos Remetidos p/ Conclusão” de novo.");
  lidos = ordenarMaisAntigoPrimeiro(r.processos); serventiaDaLista = atualSeeu; $("resumoLista").innerHTML = `<b>Serventia: ${esc(serventiaDaLista || "?")}</b> — ${r.processos.length} processo(s)${r.total && r.processos.length >= r.total ? " (todas as páginas, numa lista só)" : " nesta página"}. ${esc(r.aviso || "")}`; desenharLista(); msg(`Li ${r.processos.length} processo(s) de ${serventiaDaLista || "sua serventia"}.`, "ok");
} catch (e) { msg("✖ " + e.message, "erro"); } }
$("btnRemetidos").onclick = abrirRemetidos;

// ---- Enviar os marcados: Analisar → exportação → PDF → OCR → esteira (um por vez) ----
const hojeISO = () => new Date().toISOString().slice(0, 10);
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
let parar = false, enviando = false;
function atualizarEnvio() {
  const n = lidos.filter((p) => p.marcado).length; $("cartaoEnvio").hidden = !lidos.length;
  $("btnEnviar").disabled = enviando || !n; $("btnEnviar").textContent = n ? `Enviar ${n} processo(s) para a esteira` : "Marque processos na lista";
  $("lblPrompt").hidden = $("selDestino").value === "pdf";
}
$("selDestino").onchange = atualizarEnvio;
const passo = (t, tipo) => { const d = document.createElement("div"); d.textContent = t; if (tipo) d.className = tipo; $("passos").appendChild(d); d.scrollIntoView({ block: "nearest" }); return d; };
async function aguardarCarga(tabId) {
  await new Promise((ok) => { const fim = () => { chrome.tabs.onUpdated.removeListener(f); ok(); }, f = (id, i) => { if (id === tabId && i.status === "complete") fim(); }; chrome.tabs.onUpdated.addListener(f); setTimeout(fim, 40000); chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") fim(); }).catch(() => {}); });
  await dorme(900);
}
async function capturarPedido(exportarUrl) {
  const aba = await chrome.tabs.create({ url: exportarUrl, active: false });
  try { await aguardarCarga(aba.id); const [r] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, world: "MAIN", func: capturarExportarSeeu }); return r && r.result; }
  finally { chrome.tabs.remove(aba.id).catch(() => {}); }
}
async function promptPadrao() {
  const { automacao = {} } = await chrome.storage.sync.get("automacao"), k = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s*-\s*go\s*$/, "");
  const ch = Object.keys(automacao).find((n) => k(n) === k(atualSeeu)) || Object.keys(automacao).find((n) => k(atualSeeu) && (k(n).includes(k(atualSeeu)) || k(atualSeeu).includes(k(n))));
  const salvo = (await chrome.storage.local.get("seeu_prompt_" + atualSeeu))["seeu_prompt_" + atualSeeu];
  return salvo || (ch && automacao[ch]?.prompt) || "";
}
async function enviarMarcados() {
  const marcados = lidos.filter((p) => p.marcado); if (!marcados.length || enviando) return;
  const destino = $("selDestino").value, prompt = $("txtPrompt").value.trim(), ehIa = destino.startsWith("ia:"), iaId = ehIa ? destino.slice(3) : "";
  if (destino !== "pdf" && !prompt) { msg("Escreva o nome do prompt do Studio que a esteira deve usar.", "erro"); $("txtPrompt").focus(); return; }
  if (ehIa) { let c; try { c = await import("./ia-externa-cliente.js"); } catch (e) { msg("✖ Não consegui carregar o módulo das IAs: " + e.message, "erro"); return; } if (!(await c.temPermissao(iaId))) { const ok = await c.pedirPermissao(iaId).catch(() => false); if (!ok) { msg("Sem a autorização do site dessa IA o Chrome não deixa a extensão usar a aba dela.", "erro"); return; } } }
  enviando = true; parar = false; atualizarEnvio(); $("btnParar").hidden = false; $("passos").innerHTML = ""; msg("");
  const serv = atualSeeu; if (prompt) await chrome.storage.local.set({ ["seeu_prompt_" + serv]: prompt });
  let feitos = 0, falhas = 0;
  for (const [i, p] of marcados.entries()) {
    if (parar) { passo("Parado a pedido. Os demais não foram enviados.", "erro"); break; }
    if (!igual(atualSeeu, serv)) { passo("Você trocou de serventia no SEEU: parei para não misturar os processos.", "erro"); break; }
    const tag = `(${i + 1}/${marcados.length}) ${p.numero}`; passo(`${tag}: procurando a tela de exportação…`);
    try {
      if (!p.analisarHref) throw new Error("a linha não tem o botão Analisar; leia a lista de novo");
      const ach = await lerNaAba(descobrirExportarSeeu, (x) => x && (x.ok || x.erro), [p.analisarHref]);
      if (!ach || !ach.ok) throw new Error((ach && ach.erro || "não consegui ler o SEEU") + (ach && ach.paginasVistas ? " Telas vistas: " + ach.paginasVistas.join(", ") : "") + (ach && ach.passos ? " [" + ach.passos.join("; ") + "]" : ""));
      passo(`${tag}: exportação encontrada; pedindo o PDF ao SEEU…`);
      const cap = await capturarPedido(ach.exportarUrl); if (!cap || cap.erro) throw new Error((cap && cap.erro) || "sem resposta da tela de exportação"); 
      const lote = `seeu_${Date.now()}_${i}`;
      const studio = { ativo: destino !== "pdf", modo: destino === "turbo" ? "turbo" : ehIa ? "ia" : "analise", iaId, docs: false, prompt, tipo: "", minuta: "", url: "", urlPre: "", serventia: serv };
      const r = await chrome.runtime.sendMessage({ acao: "gerar-pdf-interceptar", url: cap.url, corpo: new URLSearchParams(cap.campos).toString(), metodo: cap.metodo, origem: "seeu", nome: p.numero, pasta: "SEEU/" + hojeISO(), lote, studio });
      if (!r || r.erro) throw new Error((r && r.erro) || "a extensão não aceitou o pedido");
      passo(`${tag}: PDF pedido (${cap.via}); aguardando OCR e esteira…`);
      let fim = null; for (let t = 0; t < 800 && !fim; t++) { await dorme(3000); fim = (await chrome.storage.local.get("lote_fim_" + lote))["lote_fim_" + lote]; if (parar && !fim && t > 5) { /* segue esperando este */ } }
      if (!fim) throw new Error("o OCR não terminou em 40 minutos");
      if (!fim.ok) throw new Error(fim.erro || "falhou no OCR");
      feitos++; passo(`${tag}: pronto (${fim.paginas || "?"} páginas${fim.studio?.fila ? "; na esteira" : ""}).`, "ok");
    } catch (e) { falhas++; passo(`${tag}: ✖ ${e.message}`, "erro"); }
  }
  enviando = false; $("btnParar").hidden = true; atualizarEnvio();
  msg(`Terminei: ${feitos} enviado(s)${falhas ? `, ${falhas} com erro` : ""}.`, falhas ? "erro" : "ok");
}
$("btnEnviar").onclick = enviarMarcados; $("btnParar").onclick = () => { parar = true; $("btnParar").textContent = "Vai parar…"; };
(async () => { try { $("txtPrompt").value = await promptPadrao(); } catch { /* sem prompt padrão */ } })();
atualizar().catch((e) => msg("✖ " + e.message, "erro"));
