import { todos, atualizar, lerPdf, remover, enfileirar, ROTULO, ATIVOS } from "./esteira-banco.js";
import { analisarNoStudio, lerMinutaAtual } from "./studio-cliente.js";
import { criarDocumento, abrirLadoALado, lerDocumento, tipoDaMinuta, nomeDoc } from "./docs-api.js";
import { paragrafosDeHtml } from "./docs-core.js";
import { textoDoPdf } from "./pdf-texto.js";
import { lerMinutaPre } from "./minuta-pre.js";
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
  const abas = await abrirLadoALado(doc.url, urlPdf, esteiraConfig.abrirEm || "abas");
  const aviso = doc.via === "colar" ? "Sem o login do Google configurado, a extensão cola a minuta no documento (sem a configuração de página de monografia). Se o documento ficar em branco, use o botão da barra azul." : "";
  chrome.notifications?.create({ type: "basic", iconUrl: "icone.png", title: "Minuta pronta para conferência", message: `${it.processo} — ${tipo}: Google Docs e PDF abertos.` });
  await atualizar(it.id, { estado: "conferindo", minuta, minutaHtml: html, tipo, titulo, docUrl: doc.url, via: doc.via, abas: { ...abas, janelas: (esteiraConfig.abrirEm || "abas") === "janelas" }, aviso, htmlColar: doc.html || "", colado: false, inserido: false });
}

async function analisar(it) {
  const rodada = Date.now() + Math.random();
  await atualizar(it.id, { estado: "analisando", erro: "", rodada });
  const valida = async () => (await todos()).find((x) => x.id === it.id)?.rodada === rodada;      // o usuário pode ter escolhido outro caminho no meio
  try {
    const bytes = await lerPdf(it.id);
    if (!bytes) throw new Error("o PDF deste processo não está mais guardado");
    const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig");
    const comTexto = it.modo === "turbo" || ((it.modo === "analise" || (it.modo === "lupa" && it.minutaAssessor)) && esteiraConfig.entrada === "txt");      // Turbo: sempre texto; esteira principal: conforme a escolha do usuário (txt ou PDF)
    const texto = comTexto ? await textoDoPdf(bytes) : "";
    if (comTexto && texto.replace(/\[Página \d+\]|\s/g, "").length < 200) throw new Error("não consegui extrair texto do PDF (o OCR pode não ter funcionado)");
    const r = await analisarNoStudio(bytes, { nome: it.pdfNome, prompt: it.prompt, modo: it.modo, tipo: "", processo: it.processo, minuta: it.minutaAssessor, motivoMinuta: it.motivoMinuta, texto });
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
    // Um por vez NO STUDIO. No modo contínuo (padrão) o próximo começa assim que o Studio devolve a conclusão; a conferência/lançamento no Projudi
    // do anterior segue em paralelo. Com o modo contínuo desligado, espera o processo anterior ser concluído.
    const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig");
    const bloqueiam = esteiraConfig.continuo === false ? ATIVOS : ["analisando", "recebida", "pausado"];
    if (lista.some((i) => bloqueiam.includes(i.estado))) return;
    const prox = lista.find((i) => i.estado === "aguardando");
    if (prox) await analisar(prox);
  } finally { ocupado = false; desenhar(); }
}

// Fecha as abas (ou janelas) que a esteira abriu para este processo: Google Docs, PDF e Projudi.
async function fecharAbas(it) {
  const a = it?.abas; if (!a) return;
  for (const id of [a.doc, a.pdf, a.projudi].filter(Boolean)) await (a.janelas && id !== a.projudi ? chrome.windows.remove(id) : chrome.tabs.remove(id)).catch(() => {});
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
    b.push(`<button data-a="excluir" data-id="${it.id}" title="Tira este processo da fila e apaga o PDF guardado (não mexe no Projudi nem nos arquivos já baixados)">🗑 Excluir</button>`);
    return `<tr><td>${n + 1}</td><td>${esc(it.processo)}<br><small>${esc(it.tipo || "")}</small></td><td class="e-${it.estado}">${esc(ROTULO[it.estado] || it.estado)}${it.erro ? "<br>" + esc(it.erro) : ""}${it.aviso ? `<br><small>${esc(it.aviso)}</small>` : ""}</td><td>${b.join(" ")}</td></tr>`;
  }).join("") : '<tr><td colspan="4">Fila vazia.</td></tr>';
  $("status").textContent = dono ? "" : "Outra aba da esteira já está em execução; esta mostra apenas o andamento.";
}

$("linhas").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-a]"); if (!b) return;
  const id = b.dataset.id, a = b.dataset.a;
  if (a === "excluir") {
    if (!confirm("Excluir este processo da esteira? O PDF guardado pela extensão será apagado (o arquivo baixado no computador e o Projudi não são afetados).")) return;
    await fecharAbas((await todos()).find((x) => x.id === id));
    await atualizar(id, { rodada: 0 });      // se estiver analisando, o resultado que chegar depois é descartado
    await remover([id]); desenhar(); passo(); return;
  }
  if (a === "pular") { await fecharAbas((await todos()).find((x) => x.id === id)); await atualizar(id, { estado: "pulado" }); }
  if (a === "repetir") await atualizar(id, { estado: "aguardando", erro: "", rodada: 0 });
  if (a === "usar") { usarMinutaDoStudio((await todos()).find((x) => x.id === id)); return; }
  if (a === "conferido") await atualizar(id, { estado: "conferido" });
  if (a === "concluir") { await fecharAbas((await todos()).find((x) => x.id === id)); await atualizar(id, { estado: "concluido" }); }
  if (a === "projudi") { const it = (await todos()).find((x) => x.id === id), t = await chrome.tabs.create({ url: absoluta(it.urlPre || it.url) }); await atualizar(id, { abas: { ...(it.abas || {}), projudi: t.id } }); }
  passo();
});
chrome.storage.sync.get("esteiraConfig").then(({ esteiraConfig = {} }) => { $("abrirEm").value = esteiraConfig.abrirEm || "abas"; $("entrada").value = esteiraConfig.entrada || "pdf"; $("continuo").checked = esteiraConfig.continuo !== false; });
$("continuo").onchange = async () => { const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig"); chrome.storage.sync.set({ esteiraConfig: { ...esteiraConfig, continuo: $("continuo").checked } }); passo(); };
$("entrada").onchange = async () => { const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig"); chrome.storage.sync.set({ esteiraConfig: { ...esteiraConfig, entrada: $("entrada").value } }); };
$("abrirEm").onchange = async () => { const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig"); chrome.storage.sync.set({ esteiraConfig: { ...esteiraConfig, abrirEm: $("abrirEm").value } }); };
// Recuperação: coloca na fila PDFs "número-OCR.pdf" que já estão no computador (a fila foi perdida ou os PDFs vieram de fora).
chrome.storage.sync.get("automacao").then(({ automacao = {} }) => {
  const prompts = [...new Set(Object.values(automacao).map((a) => a.prompt).filter(Boolean))];
  $("impPrompts").innerHTML = prompts.map((x) => `<option value="${esc(x)}">`).join("");
  if (prompts.length === 1) $("impPrompt").value = prompts[0];
});
$("impArq").onchange = async () => {
  const modo = $("impModo").value, promptDigitado = $("impPrompt").value.trim(), docs = $("impDocs").checked && modo === "analise", arqs = [...$("impArq").files];
  const { estado } = await chrome.storage.local.get("estado"), { automacao = {} } = await chrome.storage.sync.get("automacao");
  const k = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*-\s*go\s*$/, "").trim();
  // procura o processo (pelos 9 primeiros dígitos) entre os que o painel já conhece: traz serventia, links e prompt cadastrado
  const achar = (dig) => {
    for (const sv of estado?.serventias || []) for (const grupo of ["naoAnalisadas", "preAnalisadas"]) for (const p of sv.processos?.[grupo] || [])
      if (String(p.processo).replace(/\D/g, "").slice(0, 9) === dig) return { ...p, serventia: sv.serventia, serventiaUrl: sv.url || "", situacao: grupo };
    return null;
  };
  const msgs = []; let n = 0; const ja = new Set((await todos()).map((i) => i.processo));
  for (const f of arqs) {
    const cnj = (f.name.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0], curto = (f.name.match(/(\d{7})[-.](\d{2})(?!\d)/) || []);
    const dig = cnj ? cnj.replace(/\D/g, "").slice(0, 9) : curto[1] ? curto[1] + curto[2] : "";
    if (!dig) { msgs.push(`${f.name}: sem número de processo no nome`); continue; }
    const conhecido = achar(dig), proc = conhecido?.processo || cnj || `${curto[1]}.${curto[2]}`;
    if (ja.has(proc)) { msgs.push(`${proc}: já está na fila`); continue; }
    const chaveServ = conhecido && Object.keys(automacao).find((x) => k(x) === k(conhecido.serventia));
    const prompt = promptDigitado || (chaveServ && automacao[chaveServ]?.prompt) || (conhecido && globalThis.Sugestoes ? Sugestoes.prompt(conhecido.serventia) : "");
    if (modo !== "turbo" && !prompt) { msgs.push(`${proc}: sem prompt (preencha o campo ou marque a serventia no painel)`); continue; }
    let minutaAssessor = "", motivoMinuta = "";
    if (modo === "lupa") {
      if (!conhecido || conhecido.situacao !== "preAnalisadas") motivoMinuta = "o processo não está entre as pré-analisadas do painel (clique em “Verificar agora” no painel)";
      else { $("impMsg").textContent = `Lendo a minuta do assessor de ${proc}…`; const r = await lerMinutaPre({ processo: proc, serventiaUrl: conhecido.serventiaUrl }).catch((e) => ({ texto: "", motivo: e.message })); minutaAssessor = r.texto; motivoMinuta = r.motivo; }
    }
    const num = proc.replace(/\D/g, ""), url = conhecido?.url || (cnj ? `BuscaProcesso?PaginaAtual=2&TipoConsultaProcesso=24&ProcessoNumero=${num.slice(0, -13)}-${num.slice(-13)}` : "");
    await enfileirar({ processo: proc, url, urlPre: conhecido?.urlPre || "", prompt, modo, docs, minutaAssessor, motivoMinuta, pdfNome: f.name, pdf: f.name }, new Uint8Array(await f.arrayBuffer()));
    ja.add(proc); n++;
    if (modo === "lupa" && !minutaAssessor) msgs.push(`${proc}: entrou na fila, mas sem a minuta do assessor (${motivoMinuta})`);
  }
  $("impMsg").textContent = (n ? `${n} processo(s) adicionados à fila (${{ analise: "Análise", lupa: "Lupa do Magistrado", turbo: "Análise Turbo" }[modo]}). ` : "Nenhum arquivo novo. ") + msgs.join(" | ");
  $("impArq").value = ""; passo();
};
$("diarioLupa").onclick = async () => { const { lupa_diario = [] } = await chrome.storage.local.get("lupa_diario"); await navigator.clipboard.writeText(JSON.stringify(lupa_diario, null, 1)); $("diarioLupa").textContent = `Copiado (${lupa_diario.length} registros)! Cole no chat`; setTimeout(() => ($("diarioLupa").textContent = "Copiar diário da Lupa"), 4000); };
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
