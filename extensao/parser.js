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
    // serventia que a tela mostra ("Serventia: …"): a sessão do Projudi guarda UMA serventia por vez; se outra aba trocar, os números seriam de outra vara
    const mS = norm(d.body?.textContent || "").match(/Serventia:\s*(.+?)\s*(?:Serventia Cargo|Cargo:|E-?mail:|$)/i);
    const serventiaTela = mS ? mS[1].trim() : "";
    if (!t) return { logado: logado(d), linhas: null, serventiaTela };
    // Colunas pelo CABEÇALHO (a tela ganhou “Aguardando assinatura” antes de “Não analisadas”) e sem a linha “Total”.
    const todas = [...t.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("th,td")].map((c) => norm(c.textContent)));
    const cab = todas.find((r) => r.some((c) => /^n[ãa]o analisadas?$/i.test(c)));
    const col = (rx, padrao) => { const i = cab ? cab.findIndex((c) => rx.test(semAcento(c))) : -1; return i >= 0 ? { i, n: cab.length } : { i: padrao, n: 3 }; };
    const cNa = col(/^nao analisadas?/, 1), cPre = col(/^pre-?\s?analisadas?/, 2), cAg = cab ? col(/^aguardando/, -1) : { i: -1, n: 3 };
    // linha com menos células que o cabeçalho (rótulo com colspan): alinha pela direita
    const val = (r, c) => { if (c.i < 0) return 0; const j = r.length - (c.n - c.i); return j >= 1 ? paraInt(r[j]) : 0; };
    const linhas = todas
      .filter((r) => r.length >= 3 && r !== cab && !semAcento(r[0]).startsWith("tipo conclus") && !/^total\b/.test(semAcento(r[0])))
      .map((r) => ({ tipo: r[0], naoAnalisadas: val(r, cNa), preAnalisadas: val(r, cPre), ...(cAg.i >= 0 ? { aguardandoAssinatura: val(r, cAg) } : {}) }));
    return { logado: true, linhas, serventiaTela };
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
        urlPre: (() => { const a = [...tr.querySelectorAll("a[href]")].find((x) => /PreAnalis|Id_Pendencia/i.test(x.getAttribute("href") || "") && !/Id_Processo/i.test(x.getAttribute("href") || "")); return a ? a.getAttribute("href") : ""; })(),
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

  // Lista de audiências (Audiências > Pendentes / Para hoje / Filtro): colunas lidas pelo CABEÇALHO
  // (Data/Hora, Processo, Promovente, Promovido, Responsável, Status, Concluir). A faixa "Serventia: …" antecede as linhas.
  function parseAudiencias(html) {
    const d = doc(html);
    const t = [...d.querySelectorAll("table")].find((t) => !t.querySelector("table") && /data\/hora/i.test(t.textContent) && /promovente/i.test(t.textContent));
    const paginas = [...d.querySelectorAll("a[href]")].filter((a) => /^(\d+|primeira|ultima|última|proxima|próxima|anterior)$/i.test(norm(a.textContent)) && /PaginaAtual|Pagina/i.test(a.getAttribute("href") || "") && /Audiencia/i.test(a.getAttribute("href") || ""))
      .map((a) => ({ texto: norm(a.textContent), href: a.getAttribute("href") }));
    if (!t) return { logado: logado(d), linhas: null, paginas };
    let serventia = "", cab = null;
    const linhas = [];
    t.querySelectorAll("tr").forEach((tr) => {
      const cel = [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName));
      const txt = cel.map((c) => norm(c.textContent));
      if (!txt.length) return;
      if (txt.length <= 2 && /^serventia:/i.test(txt[0])) { serventia = txt[0].replace(/^serventia:\s*/i, ""); return; }
      if (txt.some((c) => /^data\/hora$/i.test(c))) { cab = txt.map(semAcento); return; }
      if (!cab || txt.length < cab.length - 1) return;
      const i = (rx, pad) => { const k = cab.findIndex((c) => rx.test(c)); return k >= 0 ? k : pad; };
      const dh = txt[i(/^data\/hora/, 0)] || "";
      const m = dh.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
      if (!m) return;
      const link = tr.querySelector("a[href*='Id_Processo'], a[href*='Processo']") || cel[i(/^processo/, 1)]?.querySelector("a");
      linhas.push({
        serventia, dataHora: dh, data: `${m[3]}-${m[2]}-${m[1]}`, hora: `${m[4].padStart(2, "0")}:${m[5]}`,
        processo: txt[i(/^processo/, 1)] || "", url: link ? link.getAttribute("href") : "",
        promovente: txt[i(/^promovente/, 2)] || "", promovido: txt[i(/^promovido/, 3)] || "",
        responsavel: txt[i(/^responsavel/, 4)] || "", status: txt[i(/^status/, 5)] || "",
      });
    });
    return { logado: logado(d), linhas, paginas };
  }

  // Movimentações do processo que interessam à pauta (intimação, citação, ofício, mandado, denúncia…): [{mov, data, texto, tipo}]
  // Leitura aproximada: linhas de tabela cuja 1ª célula é o número da movimentação. O resultado é sempre sugestão a conferir.
  function parseMovimentacoesPauta(html) {
    const d = doc(html);
    const out = [];
    d.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector("table")) return;
      const cel = [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => norm(c.textContent));
      if (cel.length < 3 || !/^\d{1,4}$/.test(cel[0])) return;
      const texto = cel.slice(1).join(" | ");
      const sa = semAcento(texto);
      const tipo = /intima/.test(sa) ? "intimacao" : /cita[cç]|citacao/.test(sa) ? "citacao" : /oficio/.test(sa) ? "oficio" : /mandado/.test(sa) ? "mandado" : /denuncia/.test(sa) ? "denuncia" : /audiencia/.test(sa) ? "audiencia" : "";
      if (!tipo) return;
      out.push({ mov: parseInt(cel[0], 10), data: (cel.join(" ").match(/\d{2}\/\d{2}\/\d{4}/) || [""])[0], tipo, texto: texto.slice(0, 220) });
    });
    return out;
  }

  g.ProjudiParser = { parseLista, parseConclusoes, parseProcessos, parseAudiencias, parseMovimentacoesPauta, semAcento };
})(globalThis);
