const $ = (id) => document.getElementById(id);
const PADRAO = { filtro: "Montes Claros", intervalo: 30, notificar: true };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
    h += "</table>";
  }
  el.innerHTML = `<p><b>${total}</b> não analisadas no total</p>` + h;
}

(async () => {
  const cfg = { ...PADRAO, ...(await chrome.storage.sync.get(PADRAO)) };
  $("filtro").value = cfg.filtro; $("intervalo").value = String(cfg.intervalo); $("notificar").checked = cfg.notificar;
  const salvar = () => chrome.storage.sync.set({
    filtro: $("filtro").value, intervalo: +$("intervalo").value, notificar: $("notificar").checked });
  ["filtro", "intervalo", "notificar"].forEach((i) => $(i).addEventListener("change", salvar));
  $("atualizar").onclick = async () => { await salvar(); chrome.runtime.sendMessage({ acao: "verificar" }); };
  desenhar((await chrome.storage.local.get("estado")).estado);
  chrome.storage.onChanged.addListener((c, area) => area === "local" && c.estado && desenhar(c.estado.newValue));
})();
