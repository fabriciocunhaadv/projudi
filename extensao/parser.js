// Funções de leitura do HTML do Projudi. Usadas pelo offscreen.js (DOM) e pelos testes.
(function (g) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const semAcento = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const paraInt = (s) => parseInt((s || "").replace(/\D/g, ""), 10) || 0;
  const doc = (html) => new DOMParser().parseFromString(html, "text/html");
  const logado = (d) => !!d.body && d.body.hasAttribute("data-usuario-id");

  // Tela "Serventias Disponíveis" -> [{serventia, perfil, href}]
  function parseLista(html) {
    const d = doc(html);
    const itens = [];
    d.querySelectorAll("fieldset").forEach((fs) => {
      const serventia = norm(fs.querySelector("legend")?.textContent);
      fs.querySelectorAll('a[href*="PaginaAtual=7"]').forEach((a) =>
        itens.push({ serventia, perfil: norm(a.textContent), href: a.getAttribute("href") }));
    });
    return { logado: logado(d), itens };
  }

  // Tela da serventia -> tabela CONCLUSÕES
  function parseConclusoes(html) {
    const d = doc(html);
    const t = [...d.querySelectorAll("table")].find((t) =>
      /tipo\s+conclus/i.test(t.textContent) && /n[ãa]o\s+analisadas/i.test(t.textContent) &&
      !t.querySelector("table"));
    if (!t) return { logado: logado(d), linhas: null };
    const linhas = [...t.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("th,td")].map((c) => norm(c.textContent)))
      .filter((r) => r.length >= 3 && !semAcento(r[0]).startsWith("tipo conclus"))
      .map((r) => ({ tipo: r[0], naoAnalisadas: paraInt(r[1]), preAnalisadas: paraInt(r[2]) }));
    return { logado: true, linhas };
  }

  const RE_PROC = /\d{5,7}[.\-]\d{2}(?:\.\d{4}\.\d\.\d{2}\.\d{4})?/;
  const CAMPOS = [ // cabeçalho (sem acento) -> campo
    ["data inicio", "dataInicio"], ["data pre", "dataPreAnalise"],
    ["usuario", "usuarioPreAnalise"], ["tipo de movimento", "tipoMovimento"]];

  // Lista de processos (Pendentes / Pré-Análises). A tabela traz faixas de título:
  //   "Concluso - Despacho"  e  "Emilly - minutando - (Prioridade: 0)"  (= classificador)
  // seguidas das linhas dos processos.
  function parseProcessos(html) {
    const d = doc(html);
    const processos = [];
    let tipoConclusao = "", classificador = "", colunas = {};
    d.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector("table")) return;
      const cel = [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => norm(c.textContent));
      const cheias = cel.filter(Boolean);
      if (!cheias.length) return;
      if (cel.some((c) => semAcento(c) === "processo")) { // linha de cabeçalho
        colunas = {};
        cel.forEach((c, i) => CAMPOS.forEach(([k, campo]) => { if (semAcento(c).startsWith(k)) colunas[campo] = i; }));
        return;
      }
      if (cheias.length === 1) { // faixa de título
        const t = cheias[0];
        if (/\(\s*prioridade/i.test(t)) classificador = t.replace(/\s*-?\s*\(\s*prioridade.*$/i, "").trim();
        else if (/^concluso/i.test(t)) tipoConclusao = t;
        return;
      }
      const i = cel.findIndex((c) => RE_PROC.test(c));
      if (i < 0) return;
      const p = { processo: cel[i].match(RE_PROC)[0], classificador, tipoConclusao };
      Object.entries(colunas).forEach(([campo, idx]) => { p[campo] = cel[idx] || ""; });
      processos.push(p);
    });
    // formulário "Consultar" (a lista pode só aparecer depois de enviá-lo)
    let formulario = null;
    for (const f of d.querySelectorAll("form")) {
      const botao = [...f.querySelectorAll("input,button")].find((b) =>
        /consultar|pesquisar|buscar/i.test(b.value || b.textContent || "") && /submit|button/i.test(b.type || "submit"));
      if (!botao) continue;
      const campos = [];
      f.querySelectorAll("input,select,textarea").forEach((el) => {
        if (!el.name || el.disabled) return;
        const t = (el.type || "").toLowerCase();
        if (["button", "file", "reset", "image"].includes(t)) return;
        if (t === "submit" && el !== botao) return;
        if (["checkbox", "radio"].includes(t) && !el.checked) return;
        campos.push([el.name, el.value || ""]);
      });
      formulario = { action: f.getAttribute("action") || "", method: (f.getAttribute("method") || "get").toLowerCase(), campos };
      break;
    }
    return { processos, formulario };
  }

  g.ProjudiParser = { parseLista, parseConclusoes, parseProcessos, semAcento };
})(globalThis);
