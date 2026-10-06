// Análise local dos eventos (sem rede, sem IA): tempo por site, telas, cliques e sequências que se repetem.
(function (g) {
  const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min` : `${m}min`; };
  const conta = (lista) => { const m = new Map(); for (const k of lista) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

  function sequencias(tokens, { minRep = 3, nMin = 3, nMax = 8, limite = 8 } = {}) {
    const t = tokens.filter((x, i) => i === 0 || x !== tokens[i - 1]);        // some repetição imediata
    const cand = [];
    for (let n = nMin; n <= nMax; n++) {
      const m = new Map();
      for (let i = 0; i + n <= t.length; i++) { const fatia = t.slice(i, i + n); if (new Set(fatia).size < 2) continue; const k = fatia.join("\u0001"); m.set(k, (m.get(k) || 0) + 1); }
      for (const [k, c] of m) if (c >= minRep) cand.push({ passos: k.split("\u0001"), vezes: c, score: (n - 1) * c });
    }
    cand.sort((a, b) => b.score - a.score);
    const esc = [];
    for (const c of cand) {
      const s = c.passos.join("\u0001");
      if (esc.some((e) => e.passos.join("\u0001").includes(s) && c.vezes <= e.vezes * 1.5)) continue;       // já coberta por uma sequência maior
      esc.push(c); if (esc.length >= limite) break;
    }
    return esc;
  }

  function analisar(eventos, { desde = 0 } = {}) {
    const ev = eventos.filter((e) => e.t >= desde).sort((a, b) => a.t - b.t);
    const tempo = {}, dias = {};
    for (const e of ev) if (e.tipo === "tempo") { tempo[e.site] = (tempo[e.site] || 0) + e.ms; const d = new Date(e.t).toISOString().slice(0, 10); dias[d] = (dias[d] || 0) + (e.site === "(outros)" ? 0 : e.ms); }
    const navs = ev.filter((e) => e.tipo === "nav"), cl = ev.filter((e) => e.tipo === "clique");
    const tokens = ev.filter((e) => e.tipo !== "tempo").map((e) => (e.tipo === "nav" ? `abrir ${e.pg}` : `clicar “${e.rot}” em ${e.pg}`));
    return {
      periodoInicio: ev.length ? ev[0].t : null, periodoFim: ev.length ? ev[ev.length - 1].t : null,
      tempo: Object.entries(tempo).sort((a, b) => b[1] - a[1]), dias,
      paginas: conta(navs.map((e) => e.pg)).slice(0, 15), cliques: conta(cl.map((e) => `“${e.rot}” em ${e.pg}`)).slice(0, 20),
      sequencias: sequencias(tokens), totalEventos: ev.length,
    };
  }

  function texto(a, tarefas = []) {
    const L = ["# Relatório do Monitor de Rotina (anônimo)", ""];
    if (a.periodoInicio) L.push(`Período: ${new Date(a.periodoInicio).toLocaleDateString("pt-BR")} a ${new Date(a.periodoFim).toLocaleDateString("pt-BR")} — ${a.totalEventos} eventos`, "");
    L.push("## Tempo ativo por site", ...a.tempo.map(([s, ms]) => `- ${s}: ${dur(ms)}`), "");
    const d = Object.entries(a.dias).sort(); if (d.length) L.push("## Tempo por dia (sites monitorados)", ...d.map(([k, ms]) => `- ${k}: ${dur(ms)}`), "");
    L.push("## Telas mais abertas", ...a.paginas.map(([p, n]) => `- ${n}× ${p}`), "");
    L.push("## Botões/links mais clicados", ...a.cliques.map(([p, n]) => `- ${n}× ${p}`), "");
    L.push("## Sequências que se repetem (candidatas a automação)", ...a.sequencias.map((s, i) => `${i + 1}. (${s.vezes}×) ${s.passos.join("  →  ")}`), "");
    if (tarefas.length) L.push("## Tarefas já gravadas", ...tarefas.map((t) => `- ${t.nome} (${t.passos.length} passos)`), "");
    L.push("Observação: números foram trocados por “#”; nenhum texto digitado nem conteúdo de página é registrado.");
    return L.join("\n");
  }
  g.MonAnalise = { analisar, texto, sequencias, dur };
})(globalThis);
