// Fila (esteira) das minutas: Studio -> Google Docs -> cadastro no Projudi, um processo por vez.
// Os downloads não dependem dela. O PDF fica no IndexedDB (grande); o estado de cada item, no chrome.storage.local.
import { reportarSaude } from "./saude-fila.js";
import { contarUso } from "./uso-ext.js";
const BANCO = "projudi_esteira", K = (id) => "esteira_" + id;
export const ATIVOS = ["analisando", "recebida", "pausado", "conferindo", "conferido", "cadastrando", "gigante"];

const abrir = () => new Promise((ok, erro) => { const r = indexedDB.open(BANCO, 1); r.onupgradeneeded = () => r.result.createObjectStore("pdf"); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
async function comBanco(modo, fn) {
  const db = await abrir();
  try { return await new Promise((ok, erro) => { const t = db.transaction("pdf", modo), r = fn(t.objectStore("pdf")); t.oncomplete = () => ok(r && r.result); t.onerror = () => erro(t.error); }); } finally { db.close(); }
}
export const guardarPdf = (id, bytes) => comBanco("readwrite", (s) => s.put(bytes, id));
export const lerPdf = (id) => comBanco("readonly", (s) => s.get(id));
export const apagarPdf = (id) => comBanco("readwrite", (s) => s.delete(id));

// vídeos/áudios da audiência (modo "video"): ficam no mesmo banco do navegador, por processo (só dígitos) e número
export const guardarMidia = (chave, i, bytes) => comBanco("readwrite", (s) => s.put(bytes, `midia:${chave}:${i}`));
export const lerMidia = (chave, i) => comBanco("readonly", (s) => s.get(`midia:${chave}:${i}`));
// PDF (com OCR) do processo com vídeo, guardado junto das mídias para "Refazer a sentença" sem baixar nada de novo
export const guardarPdfDoVideo = (chave, bytes) => comBanco("readwrite", (s) => s.put(bytes, `pdfvideo:${chave}`));
export const lerPdfDoVideo = (chave) => comBanco("readonly", (s) => s.get(`pdfvideo:${chave}`));
export async function apagarGuardadosDoVideo(chave) { await apagarMidias(chave); await comBanco("readwrite", (s) => s.delete(`pdfvideo:${chave}`)).catch(() => {}); await chrome.storage.local.remove("degr_" + chave); }
/** Apaga o que foi guardado há mais de 7 dias (vídeos são grandes). */
export async function limparGuardadosAntigos(dias = 7) {
  const todos = await chrome.storage.local.get(null), limite = Date.now() - dias * 86400000;
  for (const [k, v] of Object.entries(todos)) if (k.startsWith("midias_") && (v?.em || 0) < limite) await apagarGuardadosDoVideo(k.slice(7)).catch(() => {});
}
export async function apagarMidias(chave) {
  const { ["midias_" + chave]: m } = await chrome.storage.local.get("midias_" + chave);
  for (let i = 0; i < Math.max(12, (m?.meta || []).length); i++) await comBanco("readwrite", (s) => s.delete(`midia:${chave}:${i}`)).catch(() => {});
  await chrome.storage.local.remove("midias_" + chave);
}
export async function enfileirar(item, bytes) {
  const id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await guardarPdf(id, bytes);
  await navigator.locks.request("esteira-ordem", async () => {
    const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
    esteira_ordem.push(id);
    await chrome.storage.local.set({ [K(id)]: { ...item, id, estado: "aguardando", criadoEm: Date.now() }, esteira_ordem });
  });
  return id;
}
export async function todos() {
  const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
  const dados = await chrome.storage.local.get(esteira_ordem.map(K));
  return esteira_ordem.map((id) => dados[K(id)]).filter(Boolean);
}
export const ler = async (id) => (await chrome.storage.local.get(K(id)))[K(id)];
export function atualizar(id, mudancas) {
  return navigator.locks.request("esteira-item", async () => {
    const it = await ler(id); if (!it) return null;
    const contar = mudancas.estado === "concluido" && it.estado !== "concluido" && !it.usoContado;      // processo concluído na esteira: uma contagem por processo
    const novo = { ...it, ...mudancas, ...(contar ? { usoContado: true } : {}) }; await chrome.storage.local.set({ [K(id)]: novo });
    if (contar) void contarUso("esteira_" + (["analise", "turbo", "lupa", "mesa", "ia", "agaia", "video"].includes(it.modo) ? it.modo : "outro"));
    if (mudancas.estado === "erro" && mudancas.erro) void reportarSaude(/^Agaia/i.test(mudancas.erro) ? "agaia" : "esteira", "erro", mudancas.erro, { modo: it.modo });      // painel Saúde do sistema
    return novo;
  });
}
export async function remover(ids) {
  await navigator.locks.request("esteira-ordem", async () => {
    const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
    await chrome.storage.local.remove(ids.map(K));
    await chrome.storage.local.set({ esteira_ordem: esteira_ordem.filter((x) => !ids.includes(x)) });
  });
  for (const id of ids) await apagarPdf(id).catch(() => {});
}
export const ROTULO = { aguardando: "na fila", analisando: "analisando no Studio…", gigante: "processo gigante: o Studio lê em lotes, em segundo plano…", pausado: "interrompido — escolha abaixo", recebida: "minuta recebida do Studio…", conferindo: "minuta pronta — aguardando a sua conferência", conferido: "conferida — abrindo o Projudi…", cadastrando: "no Projudi — lance a minuta no editor", concluido: "concluído", erro: "erro", pulado: "pulado" };
