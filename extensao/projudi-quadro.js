// O Projudi mostra as telas internas (listas, pré-análise, editor) dentro do quadro "Principal" de uma MOLDURA que traz o cabeçalho e os menus.
// Se a extensão mudar a URL da ABA, a tela abre sem a moldura e o usuário perde o menu (e o caminho de volta ao início). Por isso a extensão navega
// SEMPRE dentro do quadro e roda suas ações no quadro do conteúdo. Carregado como script comum (importScripts / import de efeito): define globalThis.ProjudiQuadro.
(function (g) {
  const BASE = "https://projudi.tjgo.jus.br/";
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  /** Roda `func` na aba: `alvo` = true (todos os quadros), false (só o de cima) ou o frameId de um quadro. Devolve [{frameId, result}] ([] se a tela estiver trocando). */
  const executar = (tabId, func, args = [], alvo = true) => chrome.scripting.executeScript({
    target: typeof alvo === "number" ? { tabId, frameIds: [alvo] } : { tabId, allFrames: !!alvo }, world: "MAIN", func, args,
  }).catch(() => []);
  const temMoldura = async (tabId) => (await executar(tabId, () => !!document.getElementById("Principal"), [], 0)).some((x) => x.result === true);
  /** frameId do quadro "Principal" (onde fica o conteúdo); 0 se a aba não tem moldura (tela solta). */
  async function frameDoConteudo(tabId) {
    const r = await executar(tabId, () => { try { return !!(window.frameElement && window.frameElement.id === "Principal"); } catch (e) { return false; } }, [], true);
    const q = r.find((x) => x.result === true);
    return q ? q.frameId : 0;
  }
  /** A aba está na moldura? Se estiver numa tela solta (sem menus), volta ao início do Projudi para recuperar a moldura. */
  async function garantirMoldura(tabId) {
    if (await temMoldura(tabId)) return true;
    await chrome.tabs.update(tabId, { url: BASE }).catch(() => {});
    for (let k = 0; k < 40; k++) { await dorme(500); if (await temMoldura(tabId)) return true; }
    return false;
  }
  /** Leva o QUADRO do Projudi (não a aba) para `url` e espera carregar. false se não houver moldura. */
  async function irPara(tabId, url) {
    if (!(await garantirMoldura(tabId))) return false;
    const r = await executar(tabId, (u) => new Promise((ok) => {
      const f = document.getElementById("Principal"), fim = setTimeout(() => ok(false), 30000);
      f.addEventListener("load", () => { clearTimeout(fim); setTimeout(() => ok(true), 500); }, { once: true });
      f.contentWindow.location.href = u;
    }), [url], 0);
    return r.some((x) => x.result === true);
  }
  g.ProjudiQuadro = { executar, temMoldura, frameDoConteudo, garantirMoldura, irPara };
})(globalThis);
