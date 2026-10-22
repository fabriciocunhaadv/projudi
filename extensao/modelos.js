import { montarPdf, TIPOS, tipoCanonico, nomePadrao, semBarra } from "./modelos-pdf.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const quando = (t) => (t ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

let listaProjudi = [];            // modelos listados do Projudi (ainda sem texto)
let escolhidos = new Set();       // ids marcados para capturar
let cadastrados = null;           // o que já está guardado na extensão

// ---------- passo 2: escolha ----------
const jaCadastrado = (id) => Object.values(cadastrados?.serventias || {}).some((s) => s.modelos.some((m) => m.id === id && !m.erro));
function visiveis() {
  const q = sem($("filtro").value), minhas = $("soMinhas").checked;
  return listaProjudi.filter((m) => (!minhas || m.minha) && (!q || sem(`${m.nome} ${m.serventia} ${m.tipo}`).includes(q)));
}
function desenharEscolha() {
  const vis = visiveis(), grupos = new Map();
  for (const m of vis) (grupos.get(m.serventia) || grupos.set(m.serventia, []).get(m.serventia)).push(m);
  $("escolha").innerHTML = [...grupos].sort((a, b) => a[0].localeCompare(b[0])).map(([serv, ms], gi) => {
    const marc = ms.filter((m) => escolhidos.has(m.id)).length;
    return `<details class="serv" ${grupos.size <= 3 || ms.some((m) => m.minha) ? "open" : ""}><summary><label class="chk" data-stop><input type="checkbox" data-grupo="${gi}" ${marc === ms.length ? "checked" : ""}></label> ${esc(serv)} <span class="qtd">— ${marc}/${ms.length} marcado(s)</span></summary>` +
      ms.map((m) => `<label class="linha-modelo"><input type="checkbox" data-id="${esc(m.id)}" ${escolhidos.has(m.id) ? "checked" : ""}> <span class="nome">${esc(m.nome)}</span><span class="tag tag-${esc(tipoCanonico(m.tipo) || "x")}">${esc(m.tipo)}</span>${jaCadastrado(m.id) ? '<span class="tag tag-ok">✓ já cadastrado</span>' : ""}</label>`).join("") + `</details>`;
  }).join("") || '<p class="dica">Nenhum modelo com esse filtro.</p>';
  const n = escolhidos.size;
  $("contagem").textContent = `${n} modelo(s) escolhido(s) · ${vis.length} visível(is) de ${listaProjudi.length}`;
  $("capturar").disabled = n === 0; $("capturar").textContent = n ? `Capturar ${n} modelo(s) escolhido(s)` : "Capturar os modelos escolhidos";
  const grupos2 = [...grupos].sort((a, b) => a[0].localeCompare(b[0]));
  $("escolha").querySelectorAll("input[data-grupo]").forEach((c) => { c.dataset.ids = JSON.stringify(grupos2[+c.dataset.grupo][1].map((m) => m.id)); });
}
$("escolha").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.id) { t.checked ? escolhidos.add(t.dataset.id) : escolhidos.delete(t.dataset.id); desenharEscolha(); }
  else if (t.dataset.grupo !== undefined) { for (const id of JSON.parse(t.dataset.ids || "[]")) t.checked ? escolhidos.add(id) : escolhidos.delete(id); desenharEscolha(); }
});
$("escolha").addEventListener("click", (e) => { if (e.target.closest("[data-stop]")) e.stopPropagation(); }, true);
$("filtro").oninput = desenharEscolha; $("soMinhas").onchange = desenharEscolha;
$("marcarTodos").onclick = () => { visiveis().forEach((m) => escolhidos.add(m.id)); desenharEscolha(); };
$("limparSel").onclick = () => { escolhidos.clear(); desenharEscolha(); };

// ---------- modelos cadastrados na extensão ----------
async function gerarPdf(serv, dados) {
  const bytes = await montarPdf({ serventia: serv, modelos: dados.modelos.map((m) => ({ ...m, serventia: serv })) });
  return { nome: semBarra(nomePadrao(serv)) + ".pdf", bytes };
}
async function desenhar() {
  const { modelos } = await chrome.storage.local.get("modelos");
  cadastrados = modelos || null;
  const servs = Object.entries(modelos?.serventias || {});
  $("vazio").hidden = servs.length > 0;
  $("lista").innerHTML = servs.map(([nome, d], i) => {
    const cont = TIPOS.map((t) => `${t}: ${d.modelos.filter((m) => tipoCanonico(m.tipo) === t).length}`).join(" · ");
    return `<details class="serv" ${servs.length <= 2 ? "open" : ""}><summary><b>${esc(nome)}</b> <span class="qtd">— ${d.modelos.length} modelo(s) — ${cont}</span></summary>` +
      d.modelos.map((m, k) => `<div class="modelo-cad"><div class="cab"><span class="nome">${esc(m.nome)}</span><span class="tag">${esc(m.tipo)}</span><span class="dica">${m.erro ? "⚠ " + esc(m.erro) : `${(m.texto || "").length.toLocaleString("pt-BR")} caracteres · lido em ${quando(m.lidoEm || modelos.atualizadoEm)}`}</span>` +
        `<span class="acoes"><button data-a="ver" data-i="${i}" data-k="${k}">Ver texto</button><button data-a="copiar" data-i="${i}" data-k="${k}">Copiar</button><button data-a="remover" data-i="${i}" data-k="${k}" class="perigo">Remover</button></span></div><pre class="texto" id="t-${i}-${k}" hidden></pre></div>`).join("") +
      `<div class="rodape-acao"><button data-a="baixar" data-i="${i}">Baixar PDF desta serventia</button><button data-a="removerserv" data-i="${i}" class="perigo">Remover a serventia</button><span class="msg" id="m-${i}"></span></div></details>`;
  }).join("");
  $("lista").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const i = +b.dataset.i, [nome, dados] = servs[i], k = b.dataset.k !== undefined ? +b.dataset.k : -1, msg = $(`m-${i}`);
    if (b.dataset.a === "ver") { const p = $(`t-${i}-${k}`); p.hidden = !p.hidden; if (!p.hidden) p.textContent = dados.modelos[k].texto || "(sem texto)"; b.textContent = p.hidden ? "Ver texto" : "Ocultar"; return; }
    if (b.dataset.a === "copiar") { try { await navigator.clipboard.writeText(dados.modelos[k].texto || ""); b.textContent = "✔ Copiado"; } catch { b.textContent = "Não consegui copiar"; } setTimeout(() => (b.textContent = "Copiar"), 2000); return; }
    if (b.dataset.a === "remover" || b.dataset.a === "removerserv") {
      if (!confirm(b.dataset.a === "remover" ? `Remover o modelo “${dados.modelos[k].nome}” da extensão?` : `Remover todos os modelos de ${nome} da extensão?`)) return;
      const { modelos: atual } = await chrome.storage.local.get("modelos"), sv = atual.serventias[nome];
      if (b.dataset.a === "remover") sv.modelos = sv.modelos.filter((x) => x.id !== dados.modelos[k].id); else delete atual.serventias[nome];
      if (sv && !sv.modelos.length) delete atual.serventias[nome];
      await chrome.storage.local.set({ modelos: atual }); await desenhar(); if (listaProjudi.length) desenharEscolha(); return;
    }
    b.disabled = true; msg.className = "msg"; msg.textContent = "Montando o PDF…";
    try {
      const { nome: arq, bytes } = await gerarPdf(nome, dados);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      await chrome.downloads.download({ url, filename: arq, saveAs: false, conflictAction: "uniquify" });
      msg.className = "msg ok"; msg.textContent = "PDF salvo em Downloads.";
    } catch (err) { msg.className = "msg erro"; msg.textContent = err.message; document.body.dataset.erro = err.message; }
    b.disabled = false;
  };
  document.body.dataset.pronto = "1";
}

// ---------- conversa com o Projudi ----------
async function abaProjudi() {
  const padroes = chrome.runtime.getManifest().content_scripts.find((c) => c.js.includes("modelos-projudi.js")).matches;
  const abas = await chrome.tabs.query({ url: padroes });
  for (const a of abas) { try { if ((await chrome.tabs.sendMessage(a.id, { acao: "modelos-ping" }, { frameId: 0 }))?.ok) return a; } catch (e) { /* aba sem a extensão */ } }
  throw new Error("abra o Projudi (e entre com a sua conta) numa aba e tente de novo");
}
chrome.runtime.onMessage.addListener((m) => {
  if (m?.acao !== "modelos-progresso") return;
  $("progresso").className = "msg"; $("progresso").textContent = m.txt + (m.total ? ` (${m.feitos}/${m.total})` : "");
});
const ocupado = (v) => { $("listar").disabled = v; $("capturar").disabled = v || escolhidos.size === 0; $("cancelarCap").hidden = !v; };

$("listar").onclick = async () => {
  ocupado(true); $("mudancas").textContent = "";
  try {
    const aba = await abaProjudi();
    $("cancelarCap").onclick = () => chrome.tabs.sendMessage(aba.id, { acao: "modelos-cancelar" }, { frameId: 0 });
    const r = await chrome.tabs.sendMessage(aba.id, { acao: "modelos-listar" }, { frameId: 0 });
    if (!r?.ok) throw new Error(r?.erro || "a listagem não terminou");
    listaProjudi = r.modelos;
    escolhidos = new Set(listaProjudi.filter((m) => m.minha && !jaCadastrado(m.id)).map((m) => m.id));      // sugestão: os das suas serventias que ainda não estão cadastrados (o usuário ajusta)
    if (!listaProjudi.some((m) => m.minha)) $("soMinhas").checked = false;
    $("passo2").hidden = false; desenharEscolha();
    $("progresso").className = "msg ok"; $("progresso").textContent = `${listaProjudi.length} modelo(s) de decisão, despacho e sentença encontrados (de ${r.total} na lista do Projudi). Escolha abaixo quais capturar.`;
    document.body.dataset.listado = JSON.stringify(r);
  } catch (e) { $("progresso").className = "msg erro"; $("progresso").textContent = e.message; document.body.dataset.erro = e.message; }
  ocupado(false); desenharEscolha();
};

$("capturar").onclick = async () => {
  ocupado(true); $("mudancas").textContent = "";
  try {
    const aba = await abaProjudi();
    $("cancelarCap").onclick = () => chrome.tabs.sendMessage(aba.id, { acao: "modelos-cancelar" }, { frameId: 0 });
    const itens = listaProjudi.filter((m) => escolhidos.has(m.id)).map(({ id, nome, serventia, tipo }) => ({ id, nome, serventia, tipo }));
    const r = await chrome.tabs.sendMessage(aba.id, { acao: "modelos-capturar", itens }, { frameId: 0 });
    if (!r?.ok) throw new Error(r?.erro || "a captura não terminou");
    $("progresso").className = "msg ok"; $("progresso").textContent = `Pronto: ${r.total} modelo(s) lidos${r.falhas ? `, ${r.falhas} com falha` : ""} e cadastrados na extensão.`;
    $("mudancas").innerHTML = `Novos: <b>${r.diff.novos.length}</b> · alterados desde a captura anterior: <b>${r.diff.alterados.length}</b>.`;
    document.body.dataset.capturado = JSON.stringify(r);
    await desenhar(); desenharEscolha();
  } catch (e) { $("progresso").className = "msg erro"; $("progresso").textContent = e.message; document.body.dataset.erro = e.message; }
  ocupado(false); desenharEscolha();
};
desenhar();
