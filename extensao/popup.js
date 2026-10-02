const $ = (id) => document.getElementById(id);
const PADRAO = { filtro: "Montes Claros", intervalo: 30, notificar: true };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function listaProcessos(titulo, procs) {
  if (!procs?.length) return "";
  const grupos = new Map();
  procs.forEach((p) => { const k = p.classificador || "(sem classificador)"; (grupos.get(k) || grupos.set(k, []).get(k)).push(p); });
  let h = `<h3>${titulo} (${procs.length})</h3>`;
  for (const [cls, ps] of grupos) {
    h += `<div class="cls">${esc(cls)} <span class="zero">(${ps.length})</span></div><ul>`;
    for (const p of ps) {
      const extra = [p.tipoConclusao, p.dataPreAnalise && "pré-análise " + p.dataPreAnalise, p.usuarioPreAnalise, p.tipoMovimento].filter(Boolean).join(" · ");
      h += `<li><b>${esc(p.processo)}</b>${extra ? `<br><small>${esc(extra)}</small>` : ""}</li>`;
    }
    h += "</ul>";
  }
  return h;
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
    h += "<table><tr><th>Tipo</th><th>Não analis.</th><th>Pré-analis.</th></tr>";
    for (const l of s.linhas) {
      total += l.naoAnalisadas;
      const c = (n) => `<td class="n ${n ? "alerta" : "zero"}">${n}</td>`;
      h += `<tr><td>${esc(l.tipo)}</td>${c(l.naoAnalisadas)}${c(l.preAnalisadas)}</tr>`;
    }
    h += "</table>" + listaProcessos("Não analisadas", s.processos?.naoAnalisadas) + listaProcessos("Pré-analisadas", s.processos?.preAnalisadas);
  }
  el.innerHTML = `<p><b>${total}</b> não analisadas no total</p>` + h;
}

(async () => {
  const cfg = { ...PADRAO, ...(await chrome.storage.sync.get(PADRAO)) };
  $("filtro").value = cfg.filtro; $("intervalo").value = String(cfg.intervalo); $("notificar").checked = cfg.notificar;
  const salvar = () => chrome.storage.sync.set({
    filtro: $("filtro").value, intervalo: +$("intervalo").value, notificar: $("notificar").checked });
  ["filtro", "intervalo", "notificar"].forEach((i) => $(i).addEventListener("change", salvar));
  $("diagnostico").onclick = async () => {
    const { debug = {}, estado } = await chrome.storage.local.get(["debug", "estado"]);
    const txt = JSON.stringify({ debug, resumo: estado?.serventias?.map((s) => ({ s: s.serventia, erro: s.erro, linhas: s.linhas,
      n: s.processos && [s.processos.naoAnalisadas.length, s.processos.preAnalisadas.length] })) }, null, 1);
    await navigator.clipboard.writeText(txt);
    $("diagnostico").textContent = "Copiado! Cole no chat";
  };
  $("painel").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("painel.html") });
  $("atualizar").onclick = async () => { await salvar(); chrome.runtime.sendMessage({ acao: "verificar" }); };
  desenhar((await chrome.storage.local.get("estado")).estado);
  chrome.storage.onChanged.addListener((c, area) => area === "local" && c.estado && desenhar(c.estado.newValue));
})();
