// Página da extensão que busca as leis do Planalto no navegador do Super Admin e as entrega ao app (Central de fontes oficiais).
import { ORIGENS_PLANALTO, MAX_BYTES, leisValidas, motivoDeRecusa, nomeDoArquivo } from "./leis-core.js";
import { reportarSaude, instalarSaude } from "./saude-fila.js";
instalarSaude("leis");
const $ = (id) => document.getElementById(id), dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const b64De = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

const { leisJob } = await chrome.storage.local.get("leisJob");
const leis = leisValidas(leisJob?.leis), tabId = leisJob?.tabId, pedidoId = leisJob?.pedidoId;
const linhas = new Map();
for (const l of leis) { const li = document.createElement("li"); li.innerHTML = `<span class="espera">•</span><span></span>`; li.lastChild.textContent = l.nome; $("lista").append(li); linhas.set(l.id, li); }
const marca = (id, classe, texto) => { const li = linhas.get(id); li.firstChild.className = classe; li.firstChild.textContent = classe === "ok" ? "✔" : classe === "erro" ? "✖" : "…"; li.lastChild.textContent = li.lastChild.textContent.split(" — ")[0] + (texto ? " — " + texto : ""); };
if (!leis.length || tabId == null) { $("resumo").textContent = "Nenhuma lei válida para buscar. Volte ao Studio e peça de novo."; $("iniciar").disabled = true; }
else $("permissao").textContent = `${leis.length} lei(s) serão buscadas, com uma pausa entre elas.`;

const enviar = (msg) => chrome.tabs.sendMessage(tabId, msg);

$("iniciar").onclick = async () => {
  $("iniciar").disabled = true;
  try {
    if (!(await chrome.permissions.contains({ origins: ORIGENS_PLANALTO })) && !(await chrome.permissions.request({ origins: ORIGENS_PLANALTO }))) { $("resumo").textContent = "Sem a permissão, não dá para buscar. Clique de novo e escolha “Permitir”."; $("iniciar").disabled = false; return; }
  } catch (e) { $("resumo").textContent = "Não consegui pedir a permissão: " + (e?.message || e); $("iniciar").disabled = false; return; }
  let feitas = 0, falhas = 0, bloqueios = 0, seguidosBloqueio = 0;
  for (const l of leis) {
    marca(l.id, "espera", "buscando…");
    let motivo = null, bytes = null;
    try {
      const r = await fetch(l.url, { credentials: "omit", cache: "no-store", redirect: "follow" });
      bytes = new Uint8Array(await r.arrayBuffer());
      motivo = motivoDeRecusa(r.status, bytes);
      if (!motivo && bytes.length > MAX_BYTES) motivo = "arquivo grande demais";
    } catch (e) { motivo = "falha de rede: " + (e?.message || e); }
    if (motivo) {
      falhas++; marca(l.id, "erro", motivo);
      if (/bloqueou/i.test(motivo)) { bloqueios++; seguidosBloqueio++; } else seguidosBloqueio = 0;
      if (seguidosBloqueio >= 3) { $("resumo").textContent = "O Planalto está bloqueando também o seu navegador. Parei para não insistir; use o envio dos arquivos salvos."; void reportarSaude("leis", "aviso", "Planalto bloqueou a busca pelo navegador (3 seguidas)"); break; }
    } else {
      try {
        const r = await enviar({ acao: "studio-lei-entrega", pedidoId, id: l.id, nome: nomeDoArquivo(l.url), b64: b64De(bytes) });
        if (!r?.ok) throw new Error(r?.erro || "o Studio não recebeu");
        feitas++; seguidosBloqueio = 0; marca(l.id, "ok", `entregue ao Studio (${Math.round(bytes.length / 1024)} KB)`);
      } catch (e) { falhas++; marca(l.id, "erro", "não consegui entregar ao Studio: " + (e?.message || e)); if (/Receiving end|Could not establish|No tab/i.test(String(e?.message || e))) { $("resumo").textContent = "A aba do Studio foi fechada. Abra o Studio e peça de novo."; break; } }
    }
    await dorme(1200);
  }
  if (!$("resumo").textContent) $("resumo").textContent = `Pronto: ${feitas} entregue(s) ao Studio, ${falhas} com problema.`;
  try { await enviar({ acao: "studio-leis-fim", pedidoId, feitas, falhas, bloqueios }); } catch (e) { /* aba fechada */ }
  await chrome.storage.local.remove("leisJob");
  if (feitas > 0 && falhas === 0) { try { await chrome.tabs.update(tabId, { active: true }); } catch (e) { /* ignora */ } setTimeout(() => window.close(), 3000); }
};
