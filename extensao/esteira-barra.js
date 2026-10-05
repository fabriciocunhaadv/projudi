// Barra inferior da esteira de minutas: no Google Docs ("terminei a conferência") e na aba principal do Projudi ("lancei a minuta").
(() => {
  if (window.__projudiEsteiraBarra || window !== window.top) return;
  window.__projudiEsteiraBarra = true;
  const noDocs = /docs\.google\.com$/.test(location.hostname) || location.hostname === "127.0.0.1";
  const idDoc = (location.pathname.match(/\/d\/([\w-]+)/) || [])[1] || "";
  const host = document.createElement("div"); host.setAttribute("data-projudi-ext", "esteira");
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `<style>.b{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0b3d7a;color:#fff;font:14px system-ui,sans-serif;padding:8px 16px;display:none;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 -2px 8px #0005}
    button{font:14px system-ui;padding:6px 14px;border:0;border-radius:4px;cursor:pointer;background:#fff;color:#0b3d7a;font-weight:600} .m{flex:1;min-width:200px} small{opacity:.85}</style><div class="b"></div>`;
  const barra = sh.querySelector(".b");
  document.documentElement.appendChild(host);

  const K = (id) => "esteira_" + id;
  async function atual() {
    const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
    const d = await chrome.storage.local.get(esteira_ordem.map(K));
    const lista = esteira_ordem.map((i) => d[K(i)]).filter(Boolean);
    return noDocs ? lista.find((i) => i.estado === "conferindo" && i.docUrl && idDoc && i.docUrl.includes(idDoc)) : lista.find((i) => i.estado === "cadastrando");
  }
  async function mudar(id, estado) {
    await navigator.locks.request("esteira-item", async () => { const it = (await chrome.storage.local.get(K(id)))[K(id)]; if (it) await chrome.storage.local.set({ [K(id)]: { ...it, estado } }); });
  }
  const msg = (t) => { const m = barra.querySelector(".m small"); if (m) m.textContent = t; };

  async function desenhar() {
    const it = await atual();
    if (!it) { barra.style.display = "none"; return; }
    barra.style.display = "flex";
    if (noDocs) {
      barra.innerHTML = `<span class="m"><b>Esteira de minutas</b> — ${it.processo} · ${it.tipo || ""}<br><small>Corrija o texto abaixo; quando estiver pronto, clique no botão.</small></span><button id="ok">✔ Terminei a conferência — cadastrar no Projudi</button>`;
      barra.querySelector("#ok").onclick = async () => { await mudar(it.id, "conferido"); msg("Enviado: a extensão vai abrir o processo no Projudi."); };
    } else {
      barra.innerHTML = `<span class="m"><b>Esteira de minutas</b> — processo ${it.processo} · ${it.tipo || ""}<br><small>${it.aviso || "Abra o editor de texto da minuta deste processo e clique em “Inserir a minuta”."}</small></span>
        <button id="ins">Inserir a minuta no editor (formatada)</button><button id="ok">✔ Lancei no Projudi — próximo processo</button>`;
      barra.querySelector("#ins").onclick = async () => {
        const r = await chrome.runtime.sendMessage({ acao: "esteira-inserir", texto: it.textoFinal || it.minuta });
        msg(r?.ok ? "Minuta inserida no editor, com a sua formatação. Confira, salve no Projudi e clique em “Lancei no Projudi”." : "Não achei o editor de texto aberto nesta aba. Abra a minuta/pré-análise do processo e tente de novo.");
      };
      barra.querySelector("#ok").onclick = async () => { await mudar(it.id, "concluido"); msg("Concluído. Próximo processo da fila segue para o Studio."); setTimeout(desenhar, 1500); };
    }
  }
  desenhar();
  chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && Object.keys(c).some((k) => k.startsWith("esteira_"))) desenhar(); });
})();
