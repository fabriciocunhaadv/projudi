// No app "Assessor Judicial" (Google AI Studio): só oferece um botão que copia um diagnóstico da tela (estrutura, campos, botões, nomes dos
// armazenamentos do histórico), para a extensão poder ser ligada a esse app. Não lê nem copia o conteúdo do histórico.
(() => {
  if (window.__projudiStudioDiag || window.top !== window) return;
  window.__projudiStudioDiag = true;

  const visivel = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rot = (e) => (e.getAttribute("aria-label") || e.title || e.innerText || e.value || e.placeholder || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const seletor = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + ([...e.classList].slice(0, 3).map((c) => "." + c).join(""));

  async function coletar() {
    const doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll("script,style,link,svg,noscript,[data-projudi-ext]").forEach((e) => e.remove());
    doc.querySelectorAll("input[type=password]").forEach((e) => e.removeAttribute("value"));
    let bancos = [];
    try { bancos = ((await indexedDB.databases?.()) || []).map((d) => d.name); } catch (e) { /* sem acesso */ }
    return {
      url: location.origin + location.pathname,
      titulo: document.title,
      botoes: [...document.querySelectorAll("button,[role=button],a")].filter(visivel).map((e) => ({ s: seletor(e), t: rot(e) })).slice(0, 80),
      campos: [...document.querySelectorAll("input,textarea,select")].map((e) => ({ s: seletor(e), tipo: e.tagName === "SELECT" ? "select" : e.type || e.tagName.toLowerCase(), nome: e.name || "", oculto: !visivel(e), ph: e.placeholder || "", rotulo: rot(e),
        opcoes: e.tagName === "SELECT" ? [...e.options].map((o) => o.text.trim()).slice(0, 40) : undefined, accept: e.accept || undefined })).slice(0, 60),
      armazenamento: { localStorage: Object.keys(localStorage).slice(0, 60), indexedDB: bancos },
      iframes: [...document.querySelectorAll("iframe")].map((f) => f.src.replace(/[?#].*/, "")),
      html: doc.outerHTML.replace(/\s+/g, " ").slice(0, 120000),
    };
  }

  const host = document.createElement("div");
  host.setAttribute("data-projudi-ext", "studio");
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `<style>button{position:fixed;left:6px;bottom:70px;z-index:2147483647;font:12px system-ui,sans-serif;padding:5px 9px;border:1px solid #1a56a0;background:#fff;color:#1a56a0;border-radius:5px;cursor:pointer;opacity:.8}button:hover{opacity:1}</style><button>Diagnóstico da tela (extensão)</button>`;
  sh.querySelector("button").addEventListener("click", async (ev) => {
    const b = ev.target;
    try { await navigator.clipboard.writeText(JSON.stringify(await coletar(), null, 1)); b.textContent = "Copiado! Cole no chat"; }
    catch (e) { b.textContent = "Não consegui copiar"; }
    setTimeout(() => (b.textContent = "Diagnóstico da tela (extensão)"), 4000);
  });
  const por = () => { if (!host.isConnected && document.body) document.documentElement.appendChild(host); };
  por(); setInterval(por, 2000);
})();
