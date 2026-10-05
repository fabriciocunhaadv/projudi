// Barra inferior da esteira de minutas: no Google Docs ("terminei a conferência") e na aba principal do Projudi ("lancei a minuta").
(() => {
  if (window.__projudiEsteiraBarra || window !== window.top) return;
  window.__projudiEsteiraBarra = true;
  const noDocs = /docs\.google\.com$/.test(location.hostname) || location.hostname === "127.0.0.1";
  const idDoc = (location.pathname.match(/\/d\/([\w-]+)/) || [])[1] || "";
  const host = document.createElement("div"); host.setAttribute("data-projudi-ext", "esteira");
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `<style>.b{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0b3d7a;color:#fff;font:12px system-ui,sans-serif;padding:6px 10px;display:none;gap:6px;align-items:center;flex-wrap:wrap;box-shadow:0 -2px 8px #0005}
    button{font:12px system-ui;padding:5px 9px;border:0;border-radius:4px;cursor:pointer;background:#fff;color:#0b3d7a;font-weight:600} .m{flex:1;min-width:200px} small{opacity:.85}</style><div class="b"></div>`;
  const barra = sh.querySelector(".b");
  document.documentElement.appendChild(host);

  const K = (id) => "esteira_" + id;
  let minhaAba = null;
  const oculta = (it) => { try { return sessionStorage.getItem("esteiraOculta:" + it.id + ":" + it.estado) === "1"; } catch (e) { return false; } };
  async function atual() {
    const { esteira_ordem = [] } = await chrome.storage.local.get("esteira_ordem");
    const d = await chrome.storage.local.get(esteira_ordem.map(K));
    const lista = esteira_ordem.map((i) => d[K(i)]).filter(Boolean);
    // No Docs: o documento criado pelo plano B só ganha o endereço /d/ID depois; então também casa pelo título "número – tipo".
    if (!noDocs && minhaAba === null) minhaAba = (await chrome.runtime.sendMessage({ acao: "minha-aba" }))?.tabId ?? -1;
    // No Projudi a barra só aparece na aba que a própria extensão abriu para lançar a minuta (nas demais abas não atrapalha a navegação).
    return noDocs ? lista.find((i) => i.estado === "conferindo" && ((i.docUrl && idDoc && i.docUrl.includes(idDoc)) || (i.processo && document.title.includes(i.processo)))) : lista.find((i) => i.estado === "cadastrando" && i.projudiTab === minhaAba);
  }
  async function mudar(id, estado) {
    await navigator.locks.request("esteira-item", async () => { const it = (await chrome.storage.local.get(K(id)))[K(id)]; if (it) await chrome.storage.local.set({ [K(id)]: { ...it, estado } }); });
  }
  const msg = (t) => { const m = barra.querySelector(".m small"); if (m) m.textContent = t; };

  const tentou = new Set();
  // Cola a minuta (HTML formatado) no editor do Google Docs simulando o evento de colar no campo de entrada dele.
  function colar(it) {
    const f = document.querySelector("iframe.docs-texteventtarget-iframe"), d = f && f.contentDocument;
    const el = d && (d.querySelector("[contenteditable=true]") || d.body);
    if (!el) return false;
    f.focus(); el.focus();
    const dt = new DataTransfer(); dt.setData("text/html", it.htmlColar || ""); dt.setData("text/plain", it.minuta || "");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  }
  async function tentarColar(it) {
    for (let i = 0; i < 20; i++) {      // espera o editor do Docs carregar
      if (colar(it)) { await navigator.locks.request("esteira-item", async () => { const x = (await chrome.storage.local.get(K(it.id)))[K(it.id)]; if (x) await chrome.storage.local.set({ [K(it.id)]: { ...x, colado: true } }); }); msg("Minuta inserida no documento. Confira e corrija."); return; }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  barra.addEventListener("click", (e) => {      // "×": esconde a barra até a próxima etapa deste processo
    if (!e.target.closest || !e.target.closest("#fechar")) return;
    try { const ass = barra.dataset.assin.split("|"); sessionStorage.setItem("esteiraOculta:" + ass[0] + ":" + ass[1], "1"); } catch (x) { /* sem sessionStorage */ }
    barra.style.display = "none"; barra.dataset.assin = "";
  });
  async function desenhar() {
    const it = await atual();
    if (!it || oculta(it)) { barra.style.display = "none"; barra.dataset.assin = ""; return; }
    if (!noDocs) automatico(it);
    const assin = [it.id, it.estado, it.via, it.inserido, it.colado].join("|");
    if (barra.dataset.assin === assin && barra.style.display === "flex") return;      // não redesenha à toa (apagaria as mensagens)
    barra.dataset.assin = assin; barra.style.display = "flex";
    if (noDocs) {
      barra.innerHTML = `<span class="m"><b>Esteira de minutas</b> — ${it.processo} · ${it.tipo || ""}<br><small>Corrija o texto abaixo; quando estiver pronto, clique no botão.${it.via === "colar" ? " (Se o documento estiver em branco, use “Inserir a minuta”.)" : ""}</small></span><button id="fechar" title="Esconder esta barra">×</button>${it.via === "colar" ? '<button id="ins">Inserir a minuta</button><button id="cop">Copiar minuta</button>' : ""}<button id="ok">✔ Concluir conferência e enviar ao Projudi</button>`;
      if (it.via === "colar") {
        barra.querySelector("#ins").onclick = () => { const r = colar(it); msg(r ? "Minuta inserida." : "Não achei o editor do documento; use “Copiar minuta” e Ctrl+V."); };
        barra.querySelector("#cop").onclick = async () => { try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([it.htmlColar], { type: "text/html" }), "text/plain": new Blob([it.minuta], { type: "text/plain" }) })]); msg("Copiado: clique no documento e use Ctrl+V."); } catch (e) { msg("Não consegui copiar: " + e.message); } };
        if (!it.colado && !tentou.has(it.id)) { tentou.add(it.id); tentarColar(it); }
      }
      barra.querySelector("#ok").onclick = async () => { await mudar(it.id, "conferido"); msg("Enviado: a extensão vai abrir o processo no Projudi."); };
    } else {
      barra.innerHTML = `<span class="m"><b>Esteira de minutas</b> — processo ${it.processo} · ${it.tipo || ""}<br><small>${it.aviso || "Abra o editor de texto da minuta deste processo e clique em “Inserir a minuta”."}</small></span>
        <button id="fechar" title="Esconder esta barra">×</button><button id="ins">Inserir a minuta no editor (formatada)</button><button id="ok">✔ Lancei no Projudi — próximo processo</button>`;
      barra.querySelector("#ins").onclick = async () => {
        const r = await chrome.runtime.sendMessage({ acao: "esteira-inserir", texto: it.textoFinal || it.minuta, html: it.htmlFinal || it.minutaHtml || "" });
        msg(r?.ok ? "Minuta inserida no editor, com a sua formatação. Confira, salve no Projudi e clique em “Lancei no Projudi”." : "Não achei o editor de texto aberto nesta aba. Abra a minuta/pré-análise do processo e tente de novo.");
      };
      barra.querySelector("#ok").onclick = async () => { await mudar(it.id, "concluido"); msg("Concluído. Próximo processo da fila segue para o Studio."); setTimeout(desenhar, 1500); };
    }
  }
  let travaAuto = false;
  // Na aba do Projudi aberta pela extensão: assim que o editor de texto da minuta aparecer, lança a minuta (uma vez).
  async function automatico(it) {
    if (travaAuto || it.inserido) return;
    if (it.projudiTab !== minhaAba) return;
    travaAuto = true;
    try {
      const r = await chrome.runtime.sendMessage({ acao: "esteira-inserir", texto: it.textoFinal || it.minuta, html: it.htmlFinal || it.minutaHtml || "" });
      if (r?.ok) {
        await navigator.locks.request("esteira-item", async () => { const x = (await chrome.storage.local.get(K(it.id)))[K(it.id)]; if (x) await chrome.storage.local.set({ [K(it.id)]: { ...x, inserido: true } }); });
        msg("Minuta lançada no editor com a sua formatação. Confira, salve no Projudi e clique em “Lancei no Projudi”.");
      }
    } finally { travaAuto = false; }
  }
  desenhar();
  setInterval(desenhar, 2500);
  chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && Object.keys(c).some((k) => k.startsWith("esteira_"))) desenhar(); });
})();
