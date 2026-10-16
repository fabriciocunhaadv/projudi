import { todos, atualizar, lerPdf, remover, enfileirar, ROTULO, ATIVOS } from "./esteira-banco.js";
import { analisarNoStudio, lerMinutaAtual } from "./studio-cliente.js";
import { criarDocumento, abrirLadoALado, lerDocumento, tipoDaMinuta, nomeDoc } from "./docs-api.js";
import { paragrafosDeHtml } from "./docs-core.js";
import { textoDoPdf } from "./pdf-texto.js";
import { vigiarAcordado, conferirAcordado } from "./acordado.js";
import { lerMinutaPre } from "./minuta-pre.js";
import { chaveProc } from "./proc-chave.js";
const BASE = "https://projudi.tjgo.jus.br/";
const absoluta = (u) => (u ? new URL(u, BASE).href : BASE);

const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let dono = false, ocupado = false, pausaAte = 0, pausaTurboAte = 0;

// Esteira automática: com a 1ª etapa concluída no Studio o processo está "concluído" para a fila (a minuta fica no histórico do app) e o próximo já é enviado.
// O Projudi só mostra o processo na serventia escolhida na sessão: entra nela antes de abrir (mesmo clique de “Serventias Disponíveis”).
async function abrirNoProjudi(it, url, active = true) {
  // navega dentro de uma aba do Projudi que já esteja aberta (sem abrir aba nova); só cria uma se não houver nenhuma
  const abertas = await chrome.tabs.query({ url: new URL(BASE).origin + "/*" }).catch(() => []);
  const antiga = abertas.find((t) => t.id === it.abas?.projudi) || abertas.find((t) => !t.pinned) || abertas[0];
  const ir = async (alvo) => { await chrome.tabs.update(aba.id, { url: alvo, active }); await new Promise((ok) => setTimeout(ok, 600)); await new Promise((ok) => { const f = (id, i) => { if (id === aba.id && i.status === "complete") { chrome.tabs.onUpdated.removeListener(f); ok(); } }; chrome.tabs.onUpdated.addListener(f); setTimeout(() => { chrome.tabs.onUpdated.removeListener(f); ok(); }, 30000); }); };
  const aba = antiga || await chrome.tabs.create({ url: it.serventiaUrl ? absoluta(it.serventiaUrl) : url, active });
  if (antiga) { if (it.serventiaUrl) { await ir(absoluta(it.serventiaUrl)); await new Promise((ok) => setTimeout(ok, 1200)); } await ir(url); if (active) chrome.windows.update(aba.windowId, { focused: true }).catch(() => {}); }
  else if (it.serventiaUrl) { await new Promise((ok) => setTimeout(ok, 3000)); await chrome.tabs.update(aba.id, { url }); }
  return aba;
}

async function entregar(it, bytes, minuta, mensagem, html = "", injecao = null, aproximado = "") {
  const aviso = (it.modo === "analise" ? "1ª etapa concluída no Studio; a minuta está no histórico do app (use “Prosseguir para 2ª Etapa” lá para a revisão)." : mensagem) + (aproximado && !String(mensagem).includes(aproximado) ? " ⚠ " + aproximado : (it.modo === "analise" && aproximado ? " ⚠ " + aproximado : ""));
  return atualizar(it.id, { estado: "concluido", minuta: minuta || "", minutaHtml: html, tipo: tipoDaMinuta(minuta), aviso, injecao });
}

async function analisar(it) {
  const intervaloTurbo = () => { if (it.modo === "turbo") pausaTurboAte = Date.now() + 60000; };      // janela de 1 minuto da cota gratuita: o próximo Turbo espera 60 s
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
    const comAta = it.modo === "mesa" ? !!(await chrome.storage.local.get("pauta_mesa_ata")).pauta_mesa_ata : false;
    const r = await analisarNoStudio(bytes, { retomar: !!it.cotaVezes, comAta, nome: it.pdfNome, prompt: it.prompt, modo: it.modo, tipo: "", processo: it.processo, minuta: it.minutaAssessor, motivoMinuta: it.motivoMinuta, dicas: it.serventia || "", texto, ate1: it.modo === "analise" });
    if (!(await valida())) return;
    intervaloTurbo();
    await entregar(it, bytes, r.minuta, r.mensagem, r.minutaHtml || "", r.injecao || null, r.aproximado || "");
  } catch (e) {
    intervaloTurbo();
    if (await valida()) {      // esteira automática: uma nova tentativa sozinha antes de dar erro (o app pode ter estado ocupado)
      const cur = (await todos()).find((x) => x.id === it.id) || it;
      const cota = /cota|quota|429|rate limit|\b503\b|alta demanda|pico tempor|resposta do servidor incompleta|formato inv[áa]lido|reiniciando/i.test(e.message || "");
      if (cota && !e.opcoes?.length) {      // cota gratuita da IA esgotada: espera (a janela renova) e tenta o MESMO processo de novo; depois, não trava a fila
        const n = (cur.cotaVezes || 0) + 1;
        pausaAte = Date.now() + 3 * 60000;
        if (n <= 2) await atualizar(it.id, { estado: "aguardando", erro: "", cotaVezes: n, aviso: `IA indisponível (cota ou sobrecarga do Google): a fila espera 3 minutos e tenta de novo (${n}/2).` });
        else await atualizar(it.id, { estado: "erro", erro: it.modo === "turbo" ? "O PDF/texto extraído é grande demais para o Módulo Turbo (ou a cota da IA esgotou). Use a “análise normal” para este processo." : "A IA não respondeu (cota gratuita esgotada ou sobrecarga do Google) mesmo após esperar. Tente de novo mais tarde ou peça a liberação da Chave Nativa.", grande: it.modo === "turbo", aviso: "A fila segue para o próximo processo depois de 3 minutos." });
      } else if (e.semRetry) await atualizar(it.id, { estado: "erro", erro: e.message, grande: !!e.grande });      // autos grandes demais para o Turbo / Mesa travada: não repete e a fila segue
      else if (e.opcoes?.length) await atualizar(it.id, { estado: "erro", erro: e.message, promptOpcoes: e.opcoes, promptEscolhido: "" });      // sem prompt da matéria: o usuário escolhe na lista do Studio
      else if ((cur.tentativas || 0) < 1) await atualizar(it.id, { estado: "aguardando", erro: "", tentativas: (cur.tentativas || 0) + 1, aviso: "nova tentativa automática após: " + e.message });
      else await atualizar(it.id, { estado: "erro", erro: e.message });
    }
  }
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
  const aba = await abrirNoProjudi(it, absoluta(it.urlPre || it.url), true);
  await atualizar(it.id, { estado: "cadastrando", textoFinal: texto, htmlFinal: html, aviso, projudiTab: aba.id, inserido: false });
}

async function passo() {
  if (!dono || ocupado) return;
  if (Date.now() < pausaAte) return;      // espera combinada (cota da IA esgotada)
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
    const bloqueiam = ["analisando", "recebida", "pausado"];      // só bloqueia enquanto o Studio trabalha (ou o usuário precisa escolher); conferência/Projudi não seguram a fila
    if (lista.some((i) => bloqueiam.includes(i.estado))) return;
    const prox = lista.find((i) => i.estado === "aguardando");
    if (prox && prox.modo === "turbo" && Date.now() < pausaTurboAte) return;      // janela de 1 minuto da cota gratuita entre dois Turbo
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
    if (it.estado === "erro" && it.promptOpcoes?.length) b.push(`<br><select data-a-sel="${it.id}" title="Prompts que existem no seu Studio"><option value="">— escolha o prompt —</option>${it.promptOpcoes.map((o) => `<option value="${esc(o)}"${o === it.promptEscolhido ? " selected" : ""}>${esc(o)}</option>`).join("")}</select> <button data-a="usarprompt" data-id="${it.id}">Usar este prompt e analisar</button>`);
    if (it.estado === "erro" && it.grande) b.push(`<button data-a="normal" data-id="${it.id}" title="Refaz este processo na análise normal do Studio (PDF/texto completo, sem o Módulo Turbo)">Usar a análise normal</button>`);
    b.push(`<button data-a="excluir" data-id="${it.id}" title="Tira este processo da fila e apaga o PDF guardado (não mexe no Projudi nem nos arquivos já baixados)">🗑 Excluir</button>`);
    return `<tr><td>${n + 1}</td><td>${esc(it.processo)}<br><small>${esc(it.tipo || "")}</small></td><td class="e-${it.estado}">${esc(ROTULO[it.estado] || it.estado)}${it.erro ? "<br>" + esc(it.erro) : ""}${it.aviso ? `<br><small>${esc(it.aviso)}</small>` : ""}${it.injecao ? (it.injecao.estado === "vermelha" ? `<br><small class="inj-v">🚨 Prompt injection nos autos: ${esc(it.injecao.texto || "confira a tarja vermelha no app")}</small>` : `<br><small class="inj-ok">✅ Prompt injection: nada encontrado</small>`) : ""}</td><td>${b.join(" ")}</td></tr>`;
  }).join("") : '<tr><td colspan="4">Fila vazia.</td></tr>';
  $("status").textContent = dono ? "" : "Outra aba da esteira já está em execução; esta mostra apenas o andamento.";
}

$("linhas").addEventListener("change", async (ev) => { const s = ev.target.closest("select[data-a-sel]"); if (s) await atualizar(s.dataset.aSel, { promptEscolhido: s.value }); });
$("linhas").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-a]"); if (!b) return;
  const id = b.dataset.id, a = b.dataset.a;
  if (a === "excluir") {
    if (!confirm("Excluir este processo da esteira? O PDF guardado pela extensão será apagado (o arquivo baixado no computador e o Projudi não são afetados).")) return;
    await fecharAbas((await todos()).find((x) => x.id === id));
    await atualizar(id, { rodada: 0 });      // se estiver analisando, o resultado que chegar depois é descartado
    await remover([id]); desenhar(); passo(); return;
  }
  if (a === "usarprompt") {
    const it = (await todos()).find((x) => x.id === id), v = document.querySelector(`select[data-a-sel="${id}"]`)?.value || it?.promptEscolhido || "";
    if (!v) { alert("Escolha um prompt da lista."); return; }
    await atualizar(id, { prompt: v, promptOpcoes: null, promptEscolhido: "", estado: "aguardando", erro: "", rodada: 0, tentativas: 0 });
  }
  if (a === "pular") { await fecharAbas((await todos()).find((x) => x.id === id)); await atualizar(id, { estado: "pulado" }); }
  if (a === "repetir") await atualizar(id, { estado: "aguardando", erro: "", rodada: 0 });
  if (a === "normal") await atualizar(id, { modo: "analise", estado: "aguardando", erro: "", grande: false, cotaVezes: 0, tentativas: 0, rodada: 0, aviso: "refeito na análise normal" });
  if (a === "usar") { usarMinutaDoStudio((await todos()).find((x) => x.id === id)); return; }
  if (a === "conferido") await atualizar(id, { estado: "conferido" });
  if (a === "concluir") { await fecharAbas((await todos()).find((x) => x.id === id)); await atualizar(id, { estado: "concluido" }); }
  if (a === "projudi") { const it = (await todos()).find((x) => x.id === id), t = await abrirNoProjudi(it, absoluta(it.urlPre || it.url), true); await atualizar(id, { abas: { ...(it.abas || {}), projudi: t.id } }); }
  passo();
});
chrome.storage.sync.get("esteiraConfig").then(({ esteiraConfig = {} }) => { $("entrada").value = esteiraConfig.entrada || "pdf"; });
$("entrada").onchange = async () => { const { esteiraConfig = {} } = await chrome.storage.sync.get("esteiraConfig"); chrome.storage.sync.set({ esteiraConfig: { ...esteiraConfig, entrada: $("entrada").value } }); };
// Recuperação: coloca na fila PDFs "número-OCR.pdf" que já estão no computador (a fila foi perdida ou os PDFs vieram de fora).
chrome.storage.sync.get("automacao").then(({ automacao = {} }) => {
  const prompts = [...new Set(Object.values(automacao).map((a) => a.prompt).filter(Boolean))];
  $("impPrompts").innerHTML = prompts.map((x) => `<option value="${esc(x)}">`).join("");
  if (prompts.length === 1) $("impPrompt").value = prompts[0];
});
$("impArq").onchange = async () => {
  const modo = $("impModo").value, promptDigitado = $("impPrompt").value.trim(), docs = false, arqs = [...$("impArq").files];
  const { estado } = await chrome.storage.local.get("estado"), { automacao = {} } = await chrome.storage.sync.get("automacao");
  const k = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*-\s*go\s*$/, "").trim();
  // procura o processo (pelos 9 primeiros dígitos) entre os que o painel já conhece: traz serventia, links e prompt cadastrado
  const achar = (dig) => {
    for (const sv of estado?.serventias || []) for (const grupo of ["naoAnalisadas", "preAnalisadas"]) for (const p of sv.processos?.[grupo] || [])
      if (chaveProc(p.processo) === dig) return { ...p, serventia: sv.serventia, serventiaUrl: sv.url || "", situacao: grupo };
    return null;
  };
  const msgs = []; let n = 0; const ja = new Set((await todos()).map((i) => i.processo));
  for (const f of arqs) {
    const cnj = (f.name.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0], curto = (f.name.match(/(\d{3,7})[-.](\d{2})(?!\d)/) || []);
    const dig = cnj ? chaveProc(cnj) : curto[1] ? curto[1].padStart(7, "0") + curto[2] : "";
    if (!dig) { msgs.push(`${f.name}: sem número de processo no nome`); continue; }
    const conhecido = achar(dig), proc = conhecido?.processo || cnj || `${curto[1].padStart(7, "0")}.${curto[2]}`;
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
    await enfileirar({ processo: proc, url, urlPre: conhecido?.urlPre || "", prompt, modo, docs, minutaAssessor, motivoMinuta, pdfNome: f.name, pdf: f.name, serventia: conhecido?.serventia || "", serventiaUrl: conhecido?.serventiaUrl || "" }, new Uint8Array(await f.arrayBuffer()));
    ja.add(proc); n++;
    if (modo === "lupa" && !minutaAssessor) msgs.push(`${proc}: entrou na fila, mas sem a minuta do assessor (${motivoMinuta})`);
  }
  $("impMsg").textContent = (n ? `${n} processo(s) adicionados à fila (${{ analise: "Análise", lupa: "Lupa do Magistrado", turbo: "Análise Turbo", mesa: "Mesa de Audiência" }[modo]}). ` : "Nenhum arquivo novo. ") + msgs.join(" | ");
  $("impArq").value = ""; passo();
};
$("limpar").onclick = async () => { await remover((await todos()).filter((i) => ["concluido", "pulado"].includes(i.estado)).map((i) => i.id)); desenhar(); };
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && Object.keys(c).some((k) => k.startsWith("esteira_"))) { desenhar(); passo(); } });
setInterval(passo, 3000);

// Só uma aba executa a fila. A dona avisa que está viva (pulso); se o pulso some (aba antiga/travada ou extensão recarregada), esta aba assume.
async function assumir(lock) {
  if (!lock) return;
  dono = true;
  for (const it of await todos()) if (it.estado === "analisando" || it.estado === "pausado") await atualizar(it.id, { estado: "aguardando", rodada: 0, erro: "" });     // a aba anterior foi fechada no meio da análise: a fila retoma de onde parou (o processo interrompido volta ao início da fila)
  document.body.dataset.executor = "1";
  const pulsar = () => chrome.storage.local.set({ pulso_esteira: Date.now() }).catch(() => {});
  pulsar(); setInterval(pulsar, 4000);
  await desenhar(); passo();
  await new Promise(() => {});      // segura o bloqueio enquanto a aba existir
}
// Uma única aba da esteira: se já existe uma viva (pulso recente), esta se fecha e a existente vem à frente; abas antigas sem sinal de vida são fechadas.
async function umaSoAba() {
  try {
    const eu = await chrome.tabs.getCurrent(); if (!eu) return false;
    const url = chrome.runtime.getURL("esteira.html");      // (tabs.query por URL não enxerga páginas da própria extensão sem a permissão "tabs": usa getContexts)
    const outras = (await chrome.runtime.getContexts({ contextTypes: ["TAB"] })).filter((c) => (c.documentUrl || "").startsWith(url) && c.tabId !== eu.id).map((c) => ({ id: c.tabId, windowId: c.windowId }));
    if (!outras.length) return false;
    const { pulso_esteira = 0 } = await chrome.storage.local.get("pulso_esteira");
    if (Date.now() - pulso_esteira < 25000) {
      await chrome.tabs.update(outras[0].id, { active: true }).catch(() => {}); chrome.windows.update(outras[0].windowId, { focused: true }).catch(() => {});
      await chrome.tabs.remove(eu.id); return true;
    }
    for (const x of outras.filter((o) => o.id < eu.id)) await chrome.tabs.remove(x.id).catch(() => {});      // abas antigas/travadas
  } catch (e) { /* segue como aba normal */ }
  return false;
}
umaSoAba().then((fechou) => { if (fechou) return;
  navigator.locks.request("esteira-executor", { ifAvailable: true }, async (lock) => { if (!lock) desenhar(); return assumir(lock); }).catch(() => { dono = false; });
});
setInterval(async () => {
  if (dono) return;
  const { pulso_esteira = 0 } = await chrome.storage.local.get("pulso_esteira").catch(() => ({}));
  if (Date.now() - pulso_esteira < 25000) return;      // a aba dona está viva
  navigator.locks.request("esteira-executor", { steal: true }, assumir).catch(() => { dono = false; });
}, 6000);

// O computador não entra em espera enquanto houver processo na fila ou em análise (só a aba dona da fila dá o sinal).
vigiarAcordado("esteira", async () => dono && (await todos()).some((i) => ["aguardando", "analisando", "recebida"].includes(i.estado)));
setInterval(conferirAcordado, 60000);
