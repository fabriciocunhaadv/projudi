// O Chrome recusa mexer em abas ("Tabs cannot be edited right now (user may be dragging a tab)") enquanto o usuário arrasta uma aba.
// Aqui create/update/remove/move/reload são repetidos por até ~30 s nesse caso (e só nesse).
(() => {
  if (!globalThis.chrome || !chrome.tabs || chrome.tabs.__retry) return;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const ocupado = (e) => /cannot be edited right now|user may be dragging/i.test(String(e && e.message || e));
  for (const nome of ["create", "update", "remove", "move", "reload"]) {
    const orig = chrome.tabs[nome]; if (typeof orig !== "function") continue;
    chrome.tabs[nome] = async function (...args) {
      for (let t = 0; ; t++) {
        try { return await orig.apply(chrome.tabs, args); }
        catch (e) { if (!ocupado(e) || t >= 60) throw e; await dorme(500); }
      }
    };
  }
  chrome.tabs.__retry = true;
})();
