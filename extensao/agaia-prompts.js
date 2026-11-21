// Cópias de segurança dos prompts do Agaia (guardadas antes de cada troca feita pelo Studio): baixar e restaurar.
const $ = (id) => document.getElementById(id);
const fmt = (t) => new Date(t).toLocaleString("pt-BR");
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
async function desenhar() {
  const { agaia_prompt_backups = [] } = await chrome.storage.local.get("agaia_prompt_backups");
  $("lista").innerHTML = agaia_prompt_backups.length ? "" : '<p class="dica">Nenhuma cópia ainda.</p>';
  for (const b of agaia_prompt_backups) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `<b>${esc(b.tituloAgaia || b.titulo)}</b><small>${esc(fmt(b.em))} · ${(b.texto || "").length} caracteres${b.origem === "antes-de-restaurar" ? " · antes de restaurar" : ""}</small><div class="acoes"><button data-a="baixar">Baixar texto</button><button data-a="restaurar">Devolver ao Agaia</button><button data-a="apagar">Apagar esta cópia</button></div>`;
    el.querySelector('[data-a="baixar"]').onclick = () => {
      const u = URL.createObjectURL(new Blob([b.texto || ""], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a"); a.href = u; a.download = `agaia-prompt-${String(b.titulo).replace(/[^\w\-]+/g, "_").slice(0, 60)}-${new Date(b.em).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    };
    el.querySelector('[data-a="restaurar"]').onclick = async (ev) => {
      ev.target.disabled = true; $("status").className = ""; $("status").textContent = "Devolvendo ao Agaia… (não feche esta aba)";
      const r = await chrome.runtime.sendMessage({ acao: "agaia-prompt-restaurar", titulo: b.tituloAgaia || b.titulo, texto: b.texto }).catch((e) => ({ ok: false, erro: String(e?.message || e) }));
      $("status").className = r?.ok ? "" : "erro"; $("status").textContent = r?.ok ? "Pronto: o texto da cópia voltou para o prompt do Agaia (a cópia continua aqui; apague se não precisar mais)." : "Não consegui: " + (r?.erro || "erro desconhecido");
      ev.target.disabled = false; desenhar();
    };
    el.querySelector('[data-a="apagar"]').onclick = async (ev) => {
      if (ev.target.dataset.sim !== "1") { ev.target.dataset.sim = "1"; ev.target.textContent = "Clique de novo para apagar"; setTimeout(() => { ev.target.dataset.sim = ""; ev.target.textContent = "Apagar esta cópia"; }, 4000); return; }
      const { agaia_prompt_backups: l = [] } = await chrome.storage.local.get("agaia_prompt_backups");
      await chrome.storage.local.set({ agaia_prompt_backups: l.filter((x) => x.id !== b.id) }); desenhar();
    };
    $("lista").appendChild(el);
  }
}
desenhar();

$("diag").onclick = async () => {
  const t = $("diagtxt"); t.style.display = "block"; t.value = "Lendo…";
  try {
    const abas = await chrome.tabs.query({ url: "https://simplesefacil.tjgo.jus.br/agaia/*" });
    const aba = abas.find((a) => /\/prompts\/edit\//.test(a.url)) || abas[0];
    if (!aba) { t.value = "Abra o Agaia na tela de edição de um prompt e clique de novo."; return; }
    const r = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-diagnostico" });
    t.value = JSON.stringify(r, null, 1); t.select();
    try { await navigator.clipboard.writeText(t.value); $("status").textContent = "Diagnóstico copiado. Cole na conversa."; } catch (e) { $("status").textContent = "Selecione o texto da caixa, copie e cole na conversa."; }
  } catch (e) { t.value = "Não consegui: " + (e?.message || e) + " (recarregue a aba do Agaia e tente de novo)"; }
};
