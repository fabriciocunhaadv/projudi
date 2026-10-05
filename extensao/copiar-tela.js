// Botão pequeno para copiar o HTML da tela (para diagnóstico). No Projudi o conteúdo fica DENTRO de um quadro e a janela de pesquisa
// (Localizar -> Consultar) fica na moldura; por isso o botão age no quadro em que está: na moldura copia a janela de pesquisa aberta,
// dentro do quadro copia a tela. Não copia scripts nem estilos.
(() => {
  if (window.__projudiCopiarTela || window.innerHeight < 150) return;
  window.__projudiCopiarTela = true;
  const topo = window.top === window;
  const editor = () => document.designMode === "on" || (document.body && document.body.isContentEditable);

  const limpo = (el) => {
    const c = el.cloneNode(true);
    (c.querySelectorAll ? c : { querySelectorAll: () => [] }).querySelectorAll("script,style,link,svg,noscript,[data-projudi-ext]").forEach((e) => e.remove());
    return (c.outerHTML || "").replace(/\s+/g, " ");
  };

  function coletar() {
    if (topo) {
      const m = document.getElementById("busca_padrao");
      const visivel = m && getComputedStyle(m).display !== "none" && m.querySelector("#CorpoTabela tr");
      if (!visivel) return { erro: "Abra antes a lista: Localizar (lupa) e Consultar. Depois clique de novo." };
      return { tela: "janela-de-pesquisa (moldura)", url: location.origin + location.pathname, html: limpo(m).slice(0, 250000) };
    }
    return { tela: "quadro", url: location.origin + location.pathname + location.search.replace(/(chave|token|usu)=[^&]*/g, "$1=…"), html: limpo(document.documentElement).slice(0, 250000) };
  }

  const host = document.createElement("div");
  host.setAttribute("data-projudi-ext", "copiar");
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `<style>button{position:fixed;left:6px;bottom:38px;z-index:2147483646;opacity:.35;font:11px system-ui,sans-serif;padding:3px 7px;border:1px solid #888;background:#fff;color:#444;border-radius:5px;cursor:pointer;opacity:.55}button:hover{opacity:1}</style><button></button>`;
  const b = sh.querySelector("button");
  const rotulo = topo ? "Copiar lista aberta (extensão)" : "Copiar esta tela (extensão)";
  b.textContent = rotulo;
  b.addEventListener("click", async () => {
    const r = coletar();
    try {
      if (r.erro) throw new Error(r.erro);
      await navigator.clipboard.writeText(JSON.stringify(r));
      b.textContent = "Copiado! Cole no chat";
    } catch (e) { b.textContent = e.message.length < 60 ? e.message : "Não consegui copiar"; if (r.erro) alert(r.erro); }
    setTimeout(() => (b.textContent = rotulo), 4000);
  });
  const por = () => { if (!editor() && document.body && !host.isConnected) document.documentElement.appendChild(host); };
  por(); setInterval(por, 2500);
})();
