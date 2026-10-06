const $ = (id) => document.getElementById(id);
const PADRAO = { filtro: "Montes Claros", notificar: true };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function listaProcessos(titulo, procs, tipo, aberto) {
  if (!procs?.length) return "";
  return `<details ${aberto ? "open" : ""}><summary>${titulo} <span class="zero">(${procs.length})</span></summary>${RenderProjudi.tabela(procs, { tipo })}</details>`;
}

function desenhar(estado) {
  const el = $("conteudo");
  $("quando").textContent = estado?.quando ? "Atualizado " + new Date(estado.quando).toLocaleTimeString("pt-BR") : "";
  if (!estado) { el.innerHTML = '<div class="msg">Ainda sem dados.</div>'; return; }
  if (estado.status === "verificando") { el.innerHTML = '<div class="msg">Verificando…</div>'; return; }
  if (estado.status === "deslogado") {
    el.innerHTML = '<div class="msg">Você não está logado no Projudi. <a href="https://projudi.tjgo.jus.br/" target="_blank">Entrar</a> e clique em “Verificar agora”.</div>'; return;
  }
  if (estado.status === "erro") { el.innerHTML = `<div class="msg erro">Erro: ${esc(estado.mensagem)}</div>`; return; }
  let h = "", total = 0;
  for (const s of estado.serventias) {
    h += `<h2><a href="${esc(s.url)}" target="_blank">${esc(s.serventia)}</a> — ${esc(s.perfil)}</h2>`;
    if (s.erro) { h += `<div class="erro">${esc(s.erro)}</div>`; continue; }
    (s.avisos || []).forEach((a) => { h += `<div class="zero">⚠ ${a.tipo === "naoAnalisadas" ? "não analisadas" : "pré-analisadas"}: contagem ${a.esperado}, lidas ${a.lido}</div>`; });
    h += "<table><tr><th>Tipo</th><th>Não analis.</th><th>Pré-analis.</th></tr>";
    for (const l of s.linhas) {
      total += l.naoAnalisadas;
      const c = (n) => `<td class="n ${n ? "alerta" : "zero"}">${n}</td>`;
      h += `<tr><td>${esc(l.tipo)}</td>${c(l.naoAnalisadas)}${c(l.preAnalisadas)}</tr>`;
    }
    h += "</table>" + listaProcessos("Não analisadas", s.processos?.naoAnalisadas, "naoAnalisadas", true) + listaProcessos("Pré-analisadas", s.processos?.preAnalisadas, "preAnalisadas", true);
  }
  el.innerHTML = `<p><b>${total}</b> não analisadas no total</p>` + h;
}

(async () => {
  RenderProjudi.ligarCopiar($("conteudo"));
  const cfg = { ...PADRAO, ...(await chrome.storage.sync.get(PADRAO)) };
  $("filtro").value = cfg.filtro; $("notificar").checked = cfg.notificar;
  const salvar = () => chrome.storage.sync.set({
    filtro: $("filtro").value, notificar: $("notificar").checked });
  ["filtro", "notificar"].forEach((i) => $(i).addEventListener("change", salvar));
  $("diagnostico").onclick = async () => {
    const { debug = {}, estado } = await chrome.storage.local.get(["debug", "estado"]);
    const txt = JSON.stringify({ debug, resumo: estado?.serventias?.map((s) => ({ s: s.serventia, erro: s.erro, linhas: s.linhas,
      n: s.processos && [s.processos.naoAnalisadas.length, s.processos.preAnalisadas.length] })) }, null, 1);
    await navigator.clipboard.writeText(txt);
    $("diagnostico").textContent = "Copiado! Cole no chat";
  };
  $("capturar").onclick = async () => {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.runtime.sendMessage({ acao: "capturar", tabId: aba.id });
    if (r?.erro || !Array.isArray(r)) { $("capturar").textContent = "Erro: " + (r?.erro || "sem resposta"); return; }
    const txt = r.map((f, i) => `===== FRAME ${i} | ${f.url} | ${f.titulo} =====\n${f.html}`).join("\n\n");
    await navigator.clipboard.writeText(txt);
    $("capturar").textContent = `Copiado (${Math.round(txt.length / 1000)} mil caracteres, ${r.length} frame(s))`;
  };
  $("ferramentas").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ferramentas.html") });
  $("ocr").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ocr.html") });
  $("painel").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("painel.html") });
  $("atualizar").onclick = async () => { await salvar(); chrome.runtime.sendMessage({ acao: "verificar" }); };
  desenhar((await chrome.storage.local.get("estado")).estado);
  chrome.storage.onChanged.addListener((c, area) => area === "local" && c.estado && desenhar(c.estado.newValue));
})();
