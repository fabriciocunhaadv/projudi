// Prompt "parecido": o juiz nem sempre tem cadastrado o prompt exato da serventia (ex.: tem “Execução Fiscal Municipal” e não “Execução Fiscal Estadual”).
// Sem opção exata, escolhe a mais próxima pela MATÉRIA (área) do nome do prompt e, se faltar, pela matéria da serventia/classe (dicas).
// Nunca troca de área (Cível ↔ Criminal, Fazenda ↔ Execução Fiscal…): só aceita quem tem a mesma matéria.
(() => {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\boutr[oa]s?\b/g, "outros").replace(/\bcivil\b/g, "civel");
  const RUIDO = new Set(["outros", "area", "judicial", "de", "da", "do", "das", "dos", "e", "em", "a", "o", "vara", "unica", "comum", "nucleo", "justica", "goias", "goiania", "comarca", "juizo", "go"]);
  // matéria: grupos de palavras; duas opções são da mesma matéria se tiverem o mesmo conjunto de grupos
  const MATERIAS = [
    ["execfiscal", /execu[cç][aã]o fiscal|exec\.? fiscal|execucao fiscal|\bfiscal\b/], ["juizado", /juizado/], ["fazenda", /fazenda/], ["familia", /familia|sucess/],
    ["infancia", /infancia|juventude|infracional/], ["criminal", /criminal|penal|jecrim/], ["civel", /\bcivel\b/], ["eleitoral", /eleitoral/], ["trabalho", /trabalh/], ["previdenciario", /previdenci/],
  ];
  const materias = (t) => new Set(MATERIAS.filter(([, rx]) => rx.test(sem(t))).map(([k]) => k));
  const palavras = (t) => new Set(sem(t).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !RUIDO.has(w)));
  const mesmo = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const jaccard = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i || 1); };
  // opcoes: [{ texto, ref }]; alvo: nome do prompt desejado; dicas: texto da serventia/classe. Devolve { ref, texto, aproximado } ou null.
  function melhor(opcoes, alvo, dicas) {
    const lista = (opcoes || []).filter((o) => o && o.texto);
    const ach = (t) => lista.map((o) => ({ o, mat: materias(o.texto), pal: palavras(o.texto) })).filter((x) => x.mat.size && mesmo(x.mat, materias(t)));
    const escolher = (t) => { const w = palavras(t); return ach(t).map((x) => ({ ...x, s: jaccard(x.pal, w) })).sort((a, b) => b.s - a.s || a.o.texto.length - b.o.texto.length)[0]; };
    for (const t of [alvo, dicas]) { if (!t || !materias(t).size) continue; const r = escolher(t); if (r) return { ref: r.o.ref, texto: r.o.texto, aproximado: true, porDicas: t === dicas && t !== alvo }; }
    return null;
  }
  globalThis.PromptSimilar = { melhor, materias };
})();
