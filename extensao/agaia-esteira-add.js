// Studio → esteira (modo Agaia): coloca UM processo na fila da esteira para o Agaia analisar e devolver a minuta ao Histórico do Studio.
// Roda numa aba escondida da extensão (precisa do banco da esteira); devolve o resultado pelo storage ("agaiaest_res_<id>") e fecha sozinha.
import { enfileirar, todos } from "./esteira-banco.js";
import { numeroAgaia, listarPromptsAgaia } from "./agaia-cliente.js";
const id = new URLSearchParams(location.search).get("id") || "";
const ATIVOS = ["aguardando", "analisando", "pausado"];
(async () => {
  const chave = "agaiaest_req_" + id;
  const req = (await chrome.storage.local.get(chave))[chave];
  let res;
  try {
    if (!req) throw new Error("pedido não encontrado");
    const processo = String(req.processo || "").trim();
    if (req.fase === "opcoes") { const r = await listarPromptsAgaia(processo); res = r?.ok ? { ok: true, opcoes: r.opcoes || [] } : { ok: false, erro: r?.erro || "não consegui ler a lista de prompts do Agaia" }; await chrome.storage.local.set({ ["agaiaest_res_" + id]: { ...res, em: Date.now() } }); await chrome.storage.local.remove(chave); try { await chrome.runtime.sendMessage({ acao: "fechar-minha-aba" }); } catch { /* fica aberta */ } return; }
    if (!numeroAgaia(processo)) throw new Error(`O número ${processo || "(vazio)"} não tem o ano; o Agaia só abre o processo com o número completo (ex.: 5285460-70.2025.8.09.0166).`);
    const k = processo.replace(/\D/g, "").slice(0, 13);
    const jaNaFila = (await todos()).some((i) => i.modo === "agaia" && ATIVOS.includes(i.estado) && String(i.processo).replace(/\D/g, "").slice(0, 13) === k);
    if (jaNaFila) res = { ok: true, jaNaFila: true };
    else {
      await enfileirar({ processo, url: "", urlPre: "", serventia: String(req.serventia || ""), serventiaUrl: String(req.serventiaUrl || ""), prompt: String(req.prompt || ""), modo: "agaia", pdfNome: "(Agaia — sem PDF)", classificador: "Studio", origemStudio: true }, new Uint8Array([0]));
      try { await chrome.runtime.sendMessage({ acao: "esteira-abrir" }); } catch { /* a esteira abre pelo link */ }
      res = { ok: true, jaNaFila: false };
    }
  } catch (e) { res = { ok: false, erro: String(e?.message || e) }; }
  await chrome.storage.local.set({ ["agaiaest_res_" + id]: { ...res, em: Date.now() } });
  await chrome.storage.local.remove(chave);
  try { await chrome.runtime.sendMessage({ acao: "fechar-minha-aba" }); } catch { /* fica aberta, sem problema */ }
})();
