// Fila (esteira) das minutas: Studio -> Google Docs -> cadastro no Projudi, um processo por vez.
// Os downloads não dependem dela. O PDF fica no IndexedDB (grande); o estado de cada item, no chrome.storage.local.
const BANCO = "projudi_esteira", K = (id) => "esteira_" + id;
export const ATIVOS = ["analisando", "conferindo", "conferido", "cadastrando"];

const abrir = () => new Promise((ok, erro) => { const r = indexedDB.open(BANCO, 1); r.onupgradeneeded = () => r.result.createObjectStore("pdf"); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
async function comBanco(modo, fn) {
  const db = await abrir();
  try { return await new Promise((ok, erro) => { const t = db.transaction("pdf", modo), r = fn(t.objectStore("pdf")); t.oncomplete = () => ok(r && r.result); t.onerror = () => erro(t.error); }); } finally { db.close(); }
}
export const guardarPdf = (id, bytes) => comBanco("readwrite", (s) => s.put(bytes, id));
export const lerPdf = (id) => comBanco("readonly", (s) => s.get(id));
export const apagarPdf = (id) => comBanco("readwrite", (s) => s.delete(id));

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
    const novo = { ...it, ...mudancas }; await chrome.storage.local.set({ [K(id)]: novo }); return novo;
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
export const ROTULO = { aguardando: "na fila", analisando: "analisando no Studio…", conferindo: "minuta no Google Docs — aguardando a sua conferência", conferido: "conferida — abrindo o Projudi…", cadastrando: "no Projudi — lance a minuta no editor", concluido: "concluído", erro: "erro", pulado: "pulado" };
