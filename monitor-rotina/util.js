// Funções comuns (service worker e páginas). Nada aqui guarda conteúdo de processo: só "tipos de página" e rótulos curtos de botões.
(function (g) {
  const MANTER = ["PaginaAtual", "fluxo", "tipo", "menu", "TipoConsultaProcesso"];        // parâmetros de URL que identificam a TELA (não o processo)
  const normalizar = (u) => {
    try {
      const x = new URL(u);
      const segs = x.pathname.split("/").map((s) => (/^\d+$/.test(s) || /^[0-9a-f-]{16,}$/i.test(s) || /^\d{7}-\d{2}/.test(s) ? "{n}" : s)).join("/");
      const q = MANTER.filter((k) => x.searchParams.has(k)).map((k) => k + "=" + String(x.searchParams.get(k)).replace(/\d{5,}/g, "{n}")).join("&");
      return { host: x.hostname, pg: x.hostname + segs + (q ? "?" + q : "") };
    } catch (e) { return { host: "", pg: "" }; }
  };
  const rotulo = (t) => String(t || "").replace(/\s+/g, " ").trim().replace(/\d+/g, "#").slice(0, 40);      // números viram "#": nenhum número de processo vaza
  const casaHost = (padrao, host) => {
    const m = String(padrao).match(/^[^:]+:\/\/([^/]+)/); if (!m) return false;
    const h = m[1]; if (h === "*") return true;
    return h.startsWith("*.") ? host === h.slice(2) || host.endsWith(h.slice(1)) : host === h;
  };
  g.MonUtil = { normalizar, rotulo, casaHost };
})(globalThis);
