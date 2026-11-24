// Painel do SEEU (início): permissão, verificação da aba e diagnóstico das telas (todos os frames).
const $ = (id) => document.getElementById(id);
const ORIGENS = ["https://seeu.pje.jus.br/*"];
const msg = (t, tipo) => { const m = $("msg"); m.textContent = t; m.className = tipo || ""; };
const temPermissao = () => chrome.permissions.contains({ origins: ORIGENS });
const abasSeeu = async () => (await chrome.tabs.query({ url: ORIGENS })).filter((t) => !!t.id);

async function atualizar() {
  const ok = await temPermissao();
  $("permEstado").textContent = ok ? "✔ Autorizado" : "Ainda não autorizado.";
  $("permEstado").className = ok ? "ok" : "";
  $("btnPerm").disabled = ok;
  const abas = ok ? await abasSeeu() : [];
  $("abaEstado").textContent = !ok ? "Autorize o SEEU primeiro." : abas.length ? `✔ ${abas.length} aba(s) do SEEU aberta(s).` : "Não achei nenhuma aba do SEEU aberta. Abra o SEEU e clique em “Verificar agora”.";
  $("abaEstado").className = abas.length ? "ok" : "";
  $("btnCopiar").disabled = $("btnBaixar").disabled = !abas.length;
}

async function diagnostico() {
  const abas = await abasSeeu(); if (!abas.length) throw new Error("Abra o SEEU em uma aba e tente de novo.");
  const aba = abas.find((t) => t.active) || abas[0];
  const rs = await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, func: coletarFrameSeeu });
  const quadros = rs.map((r) => r.result).filter(Boolean);
  const partes = quadros.map((q, i) => `===== QUADRO ${i + 1}${q.topo ? " (moldura externa)" : ""} — ${q.url}${q.titulo ? " — " + q.titulo : ""}${q.nome ? " — nome=" + q.nome : ""} =====\n${q.erro ? "ERRO: " + q.erro : q.html}`);
  return { texto: `DIAGNÓSTICO DO SEEU — ${quadros.length} quadro(s)\n\n` + partes.join("\n\n"), quadros: quadros.length };
}

$("btnPerm").onclick = async () => { try { const g = await chrome.permissions.request({ origins: ORIGENS }); msg(g ? "SEEU autorizado." : "Você não autorizou. Sem isso a extensão não consegue ver as telas do SEEU.", g ? "ok" : "erro"); } catch (e) { msg("✖ " + e.message, "erro"); } await atualizar(); };
$("btnVerificar").onclick = async () => { await atualizar(); msg("Verificado.", "ok"); };
$("btnCopiar").onclick = async () => { try { const d = await diagnostico(); await navigator.clipboard.writeText(d.texto); msg(`Diagnóstico copiado (${d.quadros} quadro(s), ${Math.round(d.texto.length / 1000)} mil caracteres). Cole na conversa.`, "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
$("btnBaixar").onclick = async () => { try { const d = await diagnostico(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([d.texto], { type: "text/plain;charset=utf-8" })); a.download = "diagnostico-seeu.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); msg("Arquivo baixado. Anexe na conversa.", "ok"); } catch (e) { msg("✖ " + e.message, "erro"); } };
atualizar().catch((e) => msg("✖ " + e.message, "erro"));
