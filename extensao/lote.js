// Fila: para cada processo selecionado, abre o processo, pede o PDF completo ao Projudi e deixa a página de OCR salvar PDF + texto.
const BASE = "https://projudi.tjgo.jus.br/";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
let cancelado = false;

function carregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.tabs.onUpdated.removeListener(ou); ok(false); }, ms);
    const ou = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ou); ok(true); } };
    chrome.tabs.onUpdated.addListener(ou);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") ou(tabId, { status: "complete" }); }).catch(() => {});
  });
}

function esperarFim(chave, ms) {
  return new Promise((ok) => {
    const fim = setTimeout(() => { chrome.storage.onChanged.removeListener(ou); ok({ ok: false, erro: "tempo esgotado" }); }, ms);
    const ou = (c, area) => { if (area === "local" && c[chave] && c[chave].newValue) { clearTimeout(fim); chrome.storage.onChanged.removeListener(ou); ok(c[chave].newValue); } };
    chrome.storage.onChanged.addListener(ou);
    chrome.storage.local.get(chave).then((o) => { if (o[chave]) ou({ [chave]: { newValue: o[chave] } }, "local"); });
  });
}

async function processar(item, chave, pasta) {
  const url = new URL(item.url, BASE).href;
  const tab = await chrome.tabs.create({ url, active: false });
  let popup = null;
  try {
    await carregou(tab.id); await dorme(1500);
    await chrome.storage.local.remove(["lote_fim_" + chave, "gerarpdf_pedido"]);
    await chrome.storage.local.set({ gerarpdf_pedido: { todos: true, processo: item.processo, pasta, lote: chave, ts: Date.now() } });
    let r = await GerarUtil.capturarGerar(tab.id);
    if (!r.achou) {   // o botão fica na aba "Navegação de Arquivos"
      await chrome.tabs.update(tab.id, { url: BASE + "BuscaProcesso?PaginaAtual=98&PassoBusca=4" });
      await carregou(tab.id); await dorme(1500);
      for (let k = 0; k < 8 && !r.achou; k++) { r = await GerarUtil.capturarGerar(tab.id); if (!r.achou) await dorme(1000); }
    }
    if (!r.achou) throw new Error("não achei o botão “Gerar PDF” no processo");
    if (r.url) popup = await chrome.tabs.create({ url: r.url, active: false });
    // a janela Gerar PDF consome o pedido; se ele continuar lá depois de 90 s, ela não abriu
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      if (!(await chrome.storage.local.get("gerarpdf_pedido")).gerarpdf_pedido) break;
      await dorme(1000);
    }
    if ((await chrome.storage.local.get("gerarpdf_pedido")).gerarpdf_pedido) throw new Error("a janela “Gerar PDF” não abriu ou não carregou");
    if (popup) { chrome.tabs.remove(popup.id).catch(() => {}); popup = null; }
    const fim = await esperarFim("lote_fim_" + chave, 40 * 60000);   // o OCR de um processo grande pode levar vários minutos
    if (!fim.ok) throw new Error(fim.erro || "falhou");
    return fim;
  } finally {
    if (popup) chrome.tabs.remove(popup.id).catch(() => {});
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

(async () => {
  const id = new URLSearchParams(location.search).get("lote");
  const job = id ? (await chrome.storage.local.get("lote_" + id))["lote_" + id] : null;
  if (!job) { $("status").textContent = "Selecione os processos no painel da extensão e use “Baixar PDFs dos selecionados”."; $("barra").hidden = true; return; }
  const itens = job.itens, pasta = job.pasta || "Projudi";
  $("lista").innerHTML = itens.map((p, i) => `<li data-i="${i}" class="fila">${esc(p.processo)} <small>${esc(p.classificador || "")}</small> — na fila</li>`).join("");
  $("barra").max = itens.length;
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando depois do processo atual…"; };
  const marca = (i, html, cls) => { const li = document.querySelector(`li[data-i="${i}"]`); li.className = cls; li.innerHTML = html; };
  let feitos = 0, erros = 0;
  for (let i = 0; i < itens.length && !cancelado; i++) {
    const p = itens[i];
    $("status").textContent = `Processo ${i + 1} de ${itens.length}: ${p.processo}`;
    marca(i, `⏳ ${esc(p.processo)} — baixando…`, "");
    try {
      const r = await processar(p, id + ":" + i, p.pasta || pasta);
      feitos++; marca(i, `✔ ${esc(p.processo)} — ${r.paginas} páginas (${r.ocr} com OCR) — salvo`, "ok");
    } catch (e) {
      erros++; marca(i, `✖ ${esc(p.processo)} — ${esc(e.message)}`, "erro");
    }
    $("barra").value = i + 1;
  }
  const resumo = `${cancelado ? "Cancelado. " : ""}${feitos} de ${itens.length} processo(s) baixado(s)${erros ? `, ${erros} com erro` : ""}.`;
  $("status").textContent = resumo; $("cancelar").disabled = true;
  document.body.dataset.pronto = "1"; document.body.dataset.resumo = JSON.stringify({ feitos, erros });
  chrome.notifications.create({ type: "basic", iconUrl: "icone.png", title: "PDFs dos processos", message: resumo });
})();
