// Ordem de trabalho do assessor: prioridade e, dentro dela, do mais antigo para o mais recente.
(function (g) {
  const MODOS = {
    "trabalho": "Ordem do Projudi: urgência do processo → prioridade do classificador → mais antigo",
    "urgencia-data": "Urgência do processo → mais antigo",
    "data": "Só a data (mais antigo primeiro)",
  };
  // "01/10/2026 15:06:10" -> milissegundos (sem data = vai para o fim)
  const ms = (s) => {
    const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : Infinity;
  };
  const dataBase = (p) => p.dataInicio || p.dataPreAnalise;
  // urgência: 1 = mais urgente (ex.: maior de 80 anos), 3 = normal. Prioridade do classificador: maior número primeiro.
  function comparador(modo = "trabalho") {
    return (a, b) => {
      if (modo !== "data") {
        const ua = a.urgencia ?? 3, ub = b.urgencia ?? 3;
        if (ua !== ub) return ua - ub;
      }
      if (modo === "trabalho") {
        const pa = a.prioridade ?? -1, pb = b.prioridade ?? -1;
        if (pa !== pb) return pb - pa;
      }
      const d = ms(dataBase(a)) - ms(dataBase(b));
      return d || String(a.processo).localeCompare(String(b.processo));
    };
  }
  g.Ordenar = { MODOS, ms, comparador };
})(globalThis);
