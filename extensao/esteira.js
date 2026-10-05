import { todos, atualizar, lerPdf, remover, ROTULO, ATIVOS } from "./esteira-banco.js";
import { analisarNoStudio, lerMinutaAtual } from "./studio-cliente.js";
import { criarDocumento, abrirLadoALado, lerDocumento, tipoDaMinuta, nomeDoc } from "./docs-api.js";

const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let dono = false, ocupado = false;

// Com a minuta em mãos: cria o Google Docs e abre ao lado do PDF; o item passa a "conferindo".
async function entregar(it, bytes, minuta, mensagem) {
  if (it.modo === "lupa" || !it.docs) return atualizar(it.id, { estado: it.modo === "lupa" ? "concluido" : "conferindo", minuta: minuta || "", tipo: tipoDaMinuta(minuta), aviso: mensagem });
  if (!minuta) throw new Error("o Studio concluiu, mas não consegui ler a minuta gerada");
  const tipo = tipoDaMinuta(minuta), titulo = nomeDoc(it.processo, tipo), doc = await criarDocumento(titulo, minuta);
  const urlPdf = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  await abrirLadoALado(doc.url, urlPdf);
  const aviso = doc.via === "colar" ? "Sem o login do Google configurado, a extensão cola a minuta no documento (sem a configuração de página de monografia). Se o documento ficar em branco, use o botão da barra azul." : "";
  await atualizar(it.id, { estado: "conferindo", minuta, tipo, titulo, docUrl: doc.url, via: doc.via, aviso, htmlColar: doc.html || "", colado: false, inserido: false });
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
    await entregar(it, bytes, r.minuta, r.mensagem);
  } catch (e) { if (await valida()) await atualizar(it.id, { estado: "erro", erro: e.message }); }
}

// A análise já tinha terminado no Studio (a extensão foi recarregada ou a tela travou): usa a minuta que está lá, sem analisar de novo.
async function usarMinutaDoStudio(it) {
  await atualizar(it.id, { estado: "analisando", erro: "", rodada: Date.now() + Math.random() });
  try { await entregar(it, await lerPdf(it.id), await lerMinutaAtual(it.processo), ""); }
  catch (e) { await atualizar(it.id, { estado: "erro", erro: e.message }); }
}

async function cadastrar(it) {         // conferência terminada: pega o texto final e leva ao Projudi
  let texto = it.minuta, aviso = it.aviso || "";
  try { const lido = it.docUrl && it.via === "api" ? await lerDocumento(it.docUrl.match(/\/d\/([\w-]+)/)?.[1]) : null; if (lido) texto = lido; else if (it.docUrl) aviso = "Sem o login do Google não dá para ler as suas correções: será usada a minuta original do Studio."; }
  catch (e) { aviso = "Não consegui ler o Google Docs (" + e.message + "): será usada a minuta original do Studio."; }
  const aba = await chrome.tabs.create({ url: it.urlPre || it.url, active: true });
  await atualizar(it.id, { estado: "cadastrando", textoFinal: texto, aviso, projudiTab: aba.id, inserido: false });
}

async function passo() {
  if (!dono || ocupado) return;
  ocupado = true;
  try {
    const lista = await todos();
    const rec = lista.find((i) => i.estado === "recebida");      // minuta enviada pelo botão da tela do Studio
    if (rec) { await atualizar(rec.id, { estado: "analisando", rodada: Date.now() + Math.random() }); try { await entregar(rec, await lerPdf(rec.id), rec.minutaRecebida, ""); } catch (e) { await atualizar(rec.id, { estado: "erro", erro: e.message }); } return; }
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
  if (a === "projudi") { const it = (await todos()).find((x) => x.id === id); chrome.tabs.create({ url: it.urlPre || it.url }); }
  passo();
});
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
