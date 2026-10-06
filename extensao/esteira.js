import { todos, atualizar, lerPdf, remover, enfileirar, ROTULO, ATIVOS } from "./esteira-banco.js";
import { analisarNoStudio, lerMinutaAtual } from "./studio-cliente.js";
import { criarDocumento, abrirLadoALado, lerDocumento, tipoDaMinuta, nomeDoc } from "./docs-api.js";
import { paragrafosDeHtml } from "./docs-core.js";
const BASE = "https://projudi.tjgo.jus.br/";
const absoluta = (u) => (u ? new URL(u, BASE).href : BASE);

const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let dono = false, ocupado = false;

// Com a minuta em mãos: cria o Google Docs e abre ao lado do PDF; o item passa a "conferindo".
async function entregar(it, bytes, minuta, mensagem, html = "") {
  if (it.modo === "lupa" || it.modo === "turbo" || !it.docs) return atualizar(it.id, { estado: it.modo === "lupa" || it.modo === "turbo" ? "concluido" : "conferindo", minuta: minuta || "", tipo: tipoDaMinuta(minuta), aviso: mensagem });
  if (!minuta) throw new Error("o Studio concluiu, mas não consegui ler a minuta gerada");
  const tipo = tipoDaMinuta(minuta), titulo = nomeDoc(it.processo, tipo), ps = html ? paragrafosDeHtml(html) : null, doc = await criarDocumento(titulo, minuta, ps && ps.length ? ps : null);
  const urlPdf = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig");
  await abrirLadoALado(doc.url, urlPdf, esteiraConfig.abrirEm || "abas");
  const aviso = doc.via === "colar" ? "Sem o login do Google configurado, a extensão cola a minuta no documento (sem a configuração de página de monografia). Se o documento ficar em branco, use o botão da barra azul." : "";
  chrome.notifications?.create({ type: "basic", iconUrl: "icone.png", title: "Minuta pronta para conferência", message: `${it.processo} — ${tipo}: Google Docs e PDF abertos.` });
  await atualizar(it.id, { estado: "conferindo", minuta, minutaHtml: html, tipo, titulo, docUrl: doc.url, via: doc.via, aviso, htmlColar: doc.html || "", colado: false, inserido: false });
}

async function analisar(it) {
  const rodada = Date.now() + Math.random();
  await atualizar(it.id, { estado: "analisando", erro: "", rodada });
  const valida = async () => (await todos()).find((x) => x.id === it.id)?.rodada === rodada;      // o usuário pode ter escolhido outro caminho no meio
  try {
    const bytes = await lerPdf(it.id);
    if (!bytes) throw new Error("o PDF deste processo não está mais guardado");
    const r = await analisarNoStudio(bytes, { nome: it.pdfNome, prompt: it.prompt, modo: it.modo, tipo: "", processo: it.processo, minuta: it.minutaAssessor });
    if (!(await valida())) return;
    await entregar(it, bytes, r.minuta, r.mensagem, r.minutaHtml || "");
  } catch (e) { if (await valida()) await atualizar(it.id, { estado: "erro", erro: e.message }); }
}

// A análise já tinha terminado no Studio (a extensão foi recarregada ou a tela travou): usa a minuta que está lá, sem analisar de novo.
async function usarMinutaDoStudio(it) {
  await atualizar(it.id, { estado: "analisando", erro: "", rodada: Date.now() + Math.random() });
  try { const m = await lerMinutaAtual(it.processo); await entregar(it, await lerPdf(it.id), m.texto, "", m.html); }
  catch (e) { await atualizar(it.id, { estado: "erro", erro: e.message }); }
}

async function cadastrar(it) {         // conferência terminada: pega o texto final (com negrito/itálico/citações) e leva ao Projudi
  let texto = it.minuta, html = it.minutaHtml || "", aviso = it.aviso || "";
  try {
    const lido = it.docUrl && it.via === "api" ? await lerDocumento(it.docUrl.match(/\/d\/([\w-]+)/)?.[1]) : null;
    if (lido) { texto = lido.texto; html = lido.html; aviso = ""; }
    else if (it.docUrl) aviso = "Sem o login do Google não dá para ler as suas correções do Docs: será usada a minuta original do Studio.";
  } catch (e) { aviso = "Não consegui ler o Google Docs (" + e.message + "): será usada a minuta original do Studio."; }
  const aba = await chrome.tabs.create({ url: absoluta(it.urlPre || it.url), active: true });
  await atualizar(it.id, { estado: "cadastrando", textoFinal: texto, htmlFinal: html, aviso, projudiTab: aba.id, inserido: false });
}

async function passo() {
  if (!dono || ocupado) return;
  ocupado = true;
  try {
    const lista = await todos();
    const rec = lista.find((i) => i.estado === "recebida");      // minuta enviada pelo botão da tela do Studio
    if (rec) { await atualizar(rec.id, { estado: "analisando", rodada: Date.now() + Math.random() }); try { await entregar(rec, await lerPdf(rec.id), rec.minutaRecebida, "", rec.htmlRecebido || ""); } catch (e) { await atualizar(rec.id, { estado: "erro", erro: e.message }); } return; }
    const conf = lista.find((i) => i.estado === "conferido");
    if (conf) { await cadastrar(conf); return; }
    if (lista.some((i) => ATIVOS.includes(i.estado))) return;          // só um por vez nesta esteira
    const prox = lista.find((i) => i.estado === "aguardando");
    if (prox) await analisar(prox);
  } finally { ocupado = false; desenhar(); }
}

async function desenhar() {
  const lista = await todos();
  $("linhas").innerHTML = lista.length ? lista.map((it, n) => {
    const b = [];
    if (it.estado === "aguardando") b.push(`<button data-a="pular" data-id="${it.id}">Pular</button>`);
    if (["aguardando", "pausado", "erro", "analisando"].includes(it.estado)) b.push(`<button data-a="usar" data-id="${it.id}" title="A extensão procura o número do processo no Histórico Local do Studio, carrega a minuta e a leva ao Google Docs, sem analisar de novo">Usar a minuta do Studio (busca no Histórico)</button>`);
    if (["pausado", "erro", "analisando"].includes(it.estado)) b.push(`<button data-a="repetir" data-id="${it.id}">${it.estado === "erro" ? "Tentar de novo" : "Analisar de novo"}</button>`);
    if (it.estado === "conferindo") { if (it.docUrl) b.push(`<a href="${esc(it.docUrl)}" target="_blank">Abrir Docs</a>`); b.push(`<button data-a="conferido" data-id="${it.id}">✔ Terminei a conferência — cadastrar no Projudi</button>`); }
    if (it.estado === "cadastrando") { b.push(`<button data-a="projudi" data-id="${it.id}">Abrir o processo</button>`, `<button data-a="concluir" data-id="${it.id}">✔ Lancei no Projudi — próximo processo</button>`); }
    return `<tr><td>${n + 1}</td><td>${esc(it.processo)}<br><small>${esc(it.tipo || "")}</small></td><td class="e-${it.estado}">${esc(ROTULO[it.estado] || it.estado)}${it.erro ? "<br>" + esc(it.erro) : ""}${it.aviso ? `<br><small>${esc(it.aviso)}</small>` : ""}</td><td>${b.join(" ")}</td></tr>`;
  }).join("") : '<tr><td colspan="4">Fila vazia.</td></tr>';
  $("status").textContent = dono ? "" : "Outra aba da esteira já está em execução; esta mostra apenas o andamento.";
}

$("linhas").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-a]"); if (!b) return;
  const id = b.dataset.id, a = b.dataset.a;
  if (a === "pular") await atualizar(id, { estado: "pulado" });
  if (a === "repetir") await atualizar(id, { estado: "aguardando", erro: "", rodada: 0 });
  if (a === "usar") { usarMinutaDoStudio((await todos()).find((x) => x.id === id)); return; }
  if (a === "conferido") await atualizar(id, { estado: "conferido" });
  if (a === "concluir") await atualizar(id, { estado: "concluido" });
  if (a === "projudi") { const it = (await todos()).find((x) => x.id === id); chrome.tabs.create({ url: absoluta(it.urlPre || it.url) }); }
  passo();
});
chrome.storage.sync.get("esteiraConfig").then(({ esteiraConfig = {} }) => { $("abrirEm").value = esteiraConfig.abrirEm || "abas"; });
$("abrirEm").onchange = async () => { const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig"); chrome.storage.sync.set({ esteiraConfig: { ...esteiraConfig, abrirEm: $("abrirEm").value } }); };
// Recuperação: coloca na fila PDFs "número-OCR.pdf" que já estão no computador (a fila foi perdida ou os PDFs vieram de fora).
chrome.storage.sync.get("automacao").then(({ automacao = {} }) => {
  const prompts = [...new Set(Object.values(automacao).map((a) => a.prompt).filter(Boolean))];
  $("impPrompts").innerHTML = prompts.map((x) => `<option value="${esc(x)}">`).join("");
  if (prompts.length === 1) $("impPrompt").value = prompts[0];
});
$("impArq").onchange = async () => {
  const prompt = $("impPrompt").value.trim(), docs = $("impDocs").checked, arqs = [...$("impArq").files];
  if (!prompt) { $("impMsg").textContent = "Preencha antes o prompt do Studio."; $("impArq").value = ""; return; }
  let n = 0; const ja = new Set((await todos()).map((i) => i.processo));
  for (const f of arqs) {
    const proc = (f.name.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0];
    if (!proc || ja.has(proc)) continue;
    const num = proc.replace(/\D/g, ""), url = `BuscaProcesso?PaginaAtual=2&TipoConsultaProcesso=24&ProcessoNumero=${num.slice(0, -13)}-${num.slice(-13)}`;
    await enfileirar({ processo: proc, url, urlPre: "", prompt, modo: "analise", docs, minutaAssessor: "", pdfNome: f.name, pdf: f.name }, new Uint8Array(await f.arrayBuffer()));
    ja.add(proc); n++;
  }
  $("impMsg").textContent = n ? `${n} processo(s) adicionados à fila.` : "Nenhum arquivo novo (o nome precisa conter o número do processo).";
  $("impArq").value = ""; passo();
};
$("limpar").onclick = async () => { await remover((await todos()).filter((i) => ["concluido", "pulado"].includes(i.estado)).map((i) => i.id)); desenhar(); };
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && Object.keys(c).some((k) => k.startsWith("esteira_"))) { desenhar(); passo(); } });
setInterval(passo, 3000);

navigator.locks.request("esteira-executor", { ifAvailable: true }, async (lock) => {
  if (!lock) { desenhar(); return; }
  dono = true;
  for (const it of await todos()) if (it.estado === "analisando") await atualizar(it.id, { estado: "pausado", rodada: 0 });     // a aba anterior foi fechada no meio da análise: o usuário escolhe (a minuta pode já estar no Studio)
  document.body.dataset.executor = "1";
  await desenhar(); passo();
  await new Promise(() => {});      // segura o bloqueio enquanto a aba existir
});
