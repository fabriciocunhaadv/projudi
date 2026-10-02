// Ordem de trabalho do assessor: prioridade e, dentro dela, do mais antigo para o mais recente.
(function (g) {
  const MODOS = {
    "prio-maior": "Prioridade (maior número primeiro) + mais antigo",
    "prio-menor": "Prioridade (menor número primeiro) + mais antigo",
    "data": "Só a data (mais antigo primeiro)",
  };
  // "01/10/2026 15:06:10" -> milissegundos (sem data = vai para o fim)
  const ms = (s) => {
    const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : Infinity;
  };
  const dataBase = (p) => p.dataInicio || p.dataPreAnalise;
  function comparador(modo = "prio-maior") {
    return (a, b) => {
      if (modo !== "data") {
        const vazio = modo === "prio-menor" ? 1e9 : -1;
        const pa = a.prioridade ?? vazio, pb = b.prioridade ?? vazio;
        if (pa !== pb) return modo === "prio-maior" ? pb - pa : pa - pb;
      }
      const d = ms(dataBase(a)) - ms(dataBase(b));
      return d || String(a.processo).localeCompare(String(b.processo));
    };
  }
  g.Ordenar = { MODOS, ms, comparador };
})(globalThis);
