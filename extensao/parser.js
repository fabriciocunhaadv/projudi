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
  const CAMPOS = [ // início do cabeçalho (sem acento) -> campo
    ["data inicio", "dataInicio"], ["data/hora", "dataInicio"], ["data pre", "dataPreAnalise"],
    ["usuario", "usuarioPreAnalise"], ["tipo de movimento", "tipoMovimento"], ["tipo da acao", "tipoAcao"]];

  // Textos das células já alinhados com o cabeçalho (uma célula com colspan=3 ocupa 3 posições).
  function expandir(els) {
    const out = [];
    els.forEach((c) => {
      out.push(norm(c.textContent));
      for (let k = 1; k < (parseInt(c.getAttribute("colspan"), 10) || 1); k++) out.push("");
    });
    return out;
  }

  // Lista de processos (Pendentes / Pré-Análises). A tabela traz faixas de título:
  //   "Concluso - Despacho"  e  "Emilly - minutando - (Prioridade: 0)"  (= classificador)
  // seguidas das linhas dos processos. Cada processo tem ainda uma urgência própria
  // (ícone cor_prioridade_1/2/3 com title: "Maior de 80 Anos", "Normal"...).
  function parseProcessos(html) {
    const d = doc(html);
    const processos = [];
    let tipoConclusao = "", classificador = "", prioridade = null, colunas = {}, viuCabecalho = false;
    d.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector("table")) return;
      const els = [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName));
      const cel = expandir(els);
      const cheias = cel.filter(Boolean);
      if (!els.length) return;
      if (!cheias.length) { // faixa em branco = "sem classificador"
        if (els.length === 1 && (parseInt(els[0].getAttribute("colspan"), 10) || 1) > 1) { classificador = ""; prioridade = null; }
        return;
      }
      if (cel.some((c) => semAcento(c) === "processo")) { // linha de cabeçalho
        colunas = {}; viuCabecalho = true;
        cel.forEach((c, i) => CAMPOS.forEach(([k, campo]) => { if (semAcento(c).startsWith(k) && !(campo in colunas)) colunas[campo] = i; }));
        return;
      }
      if (cheias.length === 1) { // faixa de título (só vale depois do cabeçalho da tabela)
        const t = cheias[0], cls = els[0].className || "";
        const comPrioridade = /\(\s*prioridade/i.test(t);
        // Classes do Projudi: linhaDestaqueTitulo = tipo da conclusão; linhaDestaqueSubTitulo = classificador.
        // Sem classe, vale o texto: "(Prioridade: N)" => classificador; "Concluso - ..." => tipo.
        const ehTipo = /DestaqueTitulo/i.test(cls) || (!/SubTitulo/i.test(cls) && !comPrioridade && /^concluso\b/i.test(t));
        if (ehTipo) { tipoConclusao = t; classificador = ""; prioridade = null; }
        else if (comPrioridade) {
          classificador = t.replace(/\s*-?\s*\(\s*prioridade.*$/i, "").trim();
          const n = parseInt((t.match(/prioridade\s*:?\s*(\d+)/i) || [])[1], 10);
          prioridade = Number.isNaN(n) ? null : n;
        } else if (/SubTitulo/i.test(cls) || (viuCabecalho && !/nenhum|n[aã]o (h[aá]|foram|existem)|total|p[aá]gina|^\d+$/i.test(t))) { classificador = t; prioridade = null; }
        return;
      }
      const i = cel.findIndex((c) => RE_PROC.test(c));
      if (i < 0) return;
      const completo = (tr.querySelector("[onclick*='copiarNumeroProcessoFormatado']")?.getAttribute("onclick") || "").match(/'([\d.\-]+)'/);
      const nivel = (tr.querySelector("[class*='cor_prioridade_']")?.className.match(/cor_prioridade_(\d+)/) || [])[1];
      const icone = tr.querySelector("[class*='cor_prioridade_']");
      const urgenciaTexto = norm(icone?.getAttribute("title") || icone?.getAttribute("alt"));
      const p = {
        processo: completo ? completo[1] : cel[i].match(RE_PROC)[0],
        url: els[i].querySelector("a[href*='Id_Processo']")?.getAttribute("href") || "",
        idPendencia: tr.querySelector("input[name='pendencias']")?.value || "",
        classificador, prioridade, tipoConclusao,
        urgencia: nivel ? parseInt(nivel, 10) : null, urgenciaTexto,
        marcadores: urgenciaTexto && !/^normal$/i.test(urgenciaTexto) ? [urgenciaTexto] : [],
      };
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
