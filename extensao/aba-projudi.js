// Uma única aba de trabalho do Projudi: em vez de abrir uma aba nova a cada passo (o que atrapalha a sessão do usuário),
// reaproveita uma aba do Projudi que já está aberta (de preferência uma que o usuário não está olhando) e navega nela.
// Só cria uma aba se não houver nenhuma; essa, e só ela, é fechada no fim.
export async function abaProjudi(url) {
  const alvo = new URL(url, location.href).href, origem = new URL(alvo).origin;
  const { aba_projudi } = await chrome.storage.local.get("aba_projudi");
  let tab = null, nossa = false;
  if (aba_projudi?.id) { tab = await chrome.tabs.get(aba_projudi.id).catch(() => null); if (tab && tab.url && !tab.url.startsWith(origem)) tab = null; nossa = !!(tab && aba_projudi.nossa); }
  if (!tab) {
    const abas = await chrome.tabs.query({ url: origem + "/*" }).catch(() => []);
    abas.sort((a, b) => (a.active - b.active) || ((a.lastAccessed || 0) - (b.lastAccessed || 0)));      // 1º: as que o usuário não está vendo; depois a menos usada
    tab = abas[0] || null;
  }
  if (tab) await chrome.tabs.update(tab.id, { url: alvo });
  else { tab = await chrome.tabs.create({ url: alvo, active: false }); nossa = true; }
  await chrome.storage.local.set({ aba_projudi: { id: tab.id, nossa } });
  return tab;
}
// Fim do trabalho: fecha a aba só se foi a extensão que a criou; a do usuário fica onde estiver.
export async function liberarAbaProjudi() {
  const { aba_projudi } = await chrome.storage.local.get("aba_projudi");
  if (aba_projudi?.nossa) await chrome.tabs.remove(aba_projudi.id).catch(() => {});
  await chrome.storage.local.remove("aba_projudi");
}
