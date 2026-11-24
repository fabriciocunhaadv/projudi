// “Refazer a minuta com alguns eventos”: parte do Studio (botão na minuta) e volta ao Studio.
// A extensão entra na serventia, abre o processo e a janela “Gerar PDF” (as caixinhas das movimentações) SOZINHA; o assessor só marca o que quer e aperta o botão verde (gerarpdf.js).
// Esta página só prepara a tela: o download dos marcados, o OCR e a nova análise seguem pelo mesmo caminho da esteira (ocr.js → esteira → Studio).
import { chaveProc } from "./proc-chave.js";
import { todos } from "./esteira-banco.js";
import { abrirAbaProjudi, soltarAbaProjudi, pegarTravaDaAba } from "./projudi-aba.js";
const BASE = "https://projudi.tjgo.jus.br/";
const $ = (id) => document.getElementById(id);
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
const limite = (promessa, ms, msg) => Promise.race([promessa, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
const carregou = (tabId, ms = 60000) => new Promise((ok) => {
  const fim = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ou); ok(false); }, ms);
  const ou = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ou); ok(true); } };
  chrome.tabs.onUpdated.addListener(ou);
  chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") ou(tabId, { status: "complete" }); }).catch(() => {});
});
const irPara = async (tabId, url) => { await chrome.tabs.update(tabId, { url }); await dorme(600); await carregou(tabId); };

const id = new URLSearchParams(location.search).get("id");

async function paginaInvalida(tabId) {      // o link guardado do processo expira: “Código inválido, não foi possível validar o ID”
  try { const r = await limite(chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => /C[oó]digo inv[aá]lido|n[aã]o foi poss[ií]vel validar o ID/i.test(document.body?.innerText || "") }), 20000, "a página não respondeu"); return r.some((x) => x.result); } catch (e) { return false; }
}

// Procura o link NOVO do processo nas listas da serventia ativa (pré-analisadas e não analisadas).
async function linkNaLista(tabId, dig) {
  for (const lista of ["PreAnalisarConclusao?PaginaAtual=6&tipo=todas", "PreAnalisarConclusao?PaginaAtual=2&tipo=todas"]) {
    await chrome.tabs.update(tabId, { url: BASE + lista }); await dorme(600); await carregou(tabId); await dorme(1500);
    for (let k = 0; k < 14; k++) {
      const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, args: [dig], func: (d) => {
        const chave = (s) => { const t = String(s || ""), m = t.match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/); return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : t.replace(/\D/g, "").slice(0, 9); };
        const a = [...document.querySelectorAll("a[href*='Id_Processo']")].find((x) => chave(x.textContent) === d);
        return a ? a.href : "";
      } }).catch(() => []);
      const h = r.map((x) => x.result).find(Boolean); if (h) return h;
      if (k === 5) await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => document.getElementById("formLocalizarBotao")?.click() }).catch(() => {});      // a lista pode vir vazia até apertar “Consultar”
      await dorme(1000);
    }
  }
  return "";
}

(async () => {
  const job = id ? (await chrome.storage.local.get("refazer_" + id))["refazer_" + id] : null;
  const falar = (texto) => { $("status").textContent = texto; if (job?.abaStudio != null) chrome.tabs.sendMessage(job.abaStudio, { acao: "refazer-progresso", reqId: job.reqId, texto }).catch(() => {}); };
  const terminar = async (r) => {
    $("status").textContent = r.ok ? r.texto : "✖ " + r.erro; $("status").className = r.ok ? "" : "erro";
    await chrome.storage.local.set({ ["refazer_fim_" + id]: { ...r, ts: Date.now() } });
    if (job?.abaStudio != null) chrome.tabs.sendMessage(job.abaStudio, { acao: "refazer-fim", reqId: job.reqId, ...r }).catch(() => {});
    if (r.ok) setTimeout(() => window.close(), 4000);
    else if (r.precisaServentia) await mostrarSeletor();
  };
  // Quando não se sabe a serventia (ou o processo não está nela): mostra a lista das serventias do usuário aqui mesmo; ao escolher, guarda e recomeça.
  const mostrarSeletor = async () => {
    const caixa = $("seletor"), sel = $("selServentia"), btn = $("btnServentia");
    caixa.hidden = false;
    let lista = [], sugerida = "";
    try { const l = await chrome.runtime.sendMessage({ acao: "lancar-serventias", processo: job?.processo || "" }); lista = Array.isArray(l?.serventias) ? l.serventias : []; sugerida = l?.sugerida || ""; } catch (e) { /* sem lista */ }
    sel.textContent = "";
    sel.add(new Option(lista.length ? "Escolha a serventia…" : "Nenhuma serventia conhecida: abra o painel da extensão e faça a verificação", ""));
    for (const x of lista) sel.add(new Option(x.serventia + (x.perfil ? " — " + x.perfil : ""), x.url));
    if (sugerida && lista.some((x) => x.url === sugerida)) sel.value = sugerida;
    btn.disabled = !sel.value; sel.onchange = () => { btn.disabled = !sel.value; };
    btn.onclick = async () => { if (!sel.value) return; btn.disabled = true; await chrome.storage.local.set({ ["refazer_" + id]: { ...job, serventiaUrl: sel.value } }); location.reload(); };
  };
  if (!job) { $("status").textContent = "Peça “Refazer só com alguns eventos” na minuta do Studio."; return; }
  const dig = chaveProc(job.processo);
  const item = (await todos().catch(() => [])).filter((i) => chaveProc(i.processo) === dig).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))[0] || null;      // a esteira guardou a serventia e o link do processo
  const serventiaUrl = job.serventiaUrl || item?.serventiaUrl || "";
  if (!serventiaUrl) return terminar({ ok: false, precisaServentia: true, erro: "Não sei em qual serventia do Projudi está este processo. Escolha a serventia." });
  const liberar = await pegarTravaDaAba(); let ref = null;
  try {
    falar("Entrando na serventia no Projudi…");
    ref = await limite(abrirAbaProjudi(BASE), 60000, "não consegui pegar a aba do Projudi (feche abas do Projudi paradas e tente de novo)");
    const tab = { id: ref.id }; await carregou(tab.id);
    await irPara(tab.id, new URL(serventiaUrl, BASE).href); await dorme(1200);
    falar("Abrindo o processo " + job.processo + "…");
    let url = item?.url ? new URL(item.url, BASE).href : "";
    if (url) { await irPara(tab.id, url); await dorme(1500); if (await paginaInvalida(tab.id)) url = ""; }
    if (!url) {
      falar("Procurando o processo na lista da serventia…");
      url = await linkNaLista(tab.id, dig);
      if (!url) return terminar({ ok: false, precisaServentia: !job.serventiaUrl, erro: `Não achei o processo ${job.processo} nas listas desta serventia do Projudi.` + (job.serventiaUrl ? " Confira se escolheu a serventia certa." : " Escolha a serventia onde ele está.") });
      await irPara(tab.id, url); await dorme(1500);
      if (await paginaInvalida(tab.id)) return terminar({ ok: false, erro: "O Projudi recusou o link do processo (“Código inválido”). Tente de novo." });
    }
    falar("Abrindo a janela “Gerar PDF”…");
    let r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a página do processo não respondeu (pode haver um aviso do Projudi aberto nela)");
    if (!r.achou) {      // o botão fica na aba “Navegação de Arquivos”
      await irPara(tab.id, BASE + "BuscaProcesso?PaginaAtual=98&PassoBusca=4"); await dorme(1500);
      for (let k = 0; k < 8 && !r.achou; k++) { r = await limite(GerarUtil.capturarGerar(tab.id), 45000, "a aba “Navegação de Arquivos” não respondeu"); if (!r.achou) await dorme(1000); }
    }
    if (!r.achou) return terminar({ ok: false, erro: "Não achei o botão “Gerar PDF” no processo." });
    // o pedido fica guardado ANTES de a janela abrir: ela mostra o botão verde “Devolver ao Studio” só quando ele existe (e vale 1 hora)
    await chrome.storage.local.set({ refazer_pedido: { id, processo: job.processo, de: job.de || "", prompt: item?.prompt || job.prompt || "", url: item?.url || url, serventiaUrl, serventia: item?.serventia || job.serventia || "", ts: Date.now() } });
    if (r.url) await chrome.tabs.create({ url: r.url, active: true });
    return terminar({ ok: true, texto: "A janela “Gerar PDF” do Projudi está aberta: marque as movimentações e aperte o botão verde “Devolver ao Studio”." });
  } catch (e) {
    return terminar({ ok: false, erro: String(e?.message || e) });
  } finally { if (ref) await soltarAbaProjudi(ref); liberar?.(); }
})();
