// Abre a janela "Gerar PDF de Processo Completo" do Projudi a partir de uma aba do processo.
// O Chrome bloqueia pop-ups abertos sem clique do usuário; por isso a extensão captura o endereço que a página tentaria abrir
// (window.open) e abre ela mesma, como aba da extensão.
(function (g) {
  async function capturarGerar(tabId) {
    const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: () => {
      const alvo = [...document.querySelectorAll("a,button,input[type=button],input[type=submit],img[onclick],span[onclick],div[onclick]")]
        .find((e) => /gerar\s*pdf/i.test((e.value || e.textContent || e.title || e.alt || "") + " " + (e.getAttribute("onclick") || "") + " " + (e.getAttribute("href") || "")));
      if (!alvo) return { achou: false };
      let url = null;
      const original = window.open;
      window.open = (u) => { url = u ? new URL(u, location.href).href : url; return null; };
      try { alvo.click(); } finally { window.open = original; }
      if (!url) { const h = alvo.getAttribute && alvo.getAttribute("href"); if (h && !/^(javascript:|#)/i.test(h)) url = new URL(h, location.href).href; }
      return { achou: true, url };
    } }).catch(() => []);
    const ok = r.map((x) => x.result).filter((x) => x && x.achou);
    return ok.length ? { achou: true, url: (ok.find((x) => x.url) || {}).url || null } : { achou: false };
  }
  g.GerarUtil = { capturarGerar };
})(globalThis);
