// Sugere, pelo nome da serventia do Projudi, o prompt do Studio e o nome do arquivo de modelos na base de conhecimento.
(() => {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Ordem importa: os casos mais específicos primeiro.
  const AREAS = [
    [/juizado.*fazenda|fazenda.*juizado/, "Juizado Faz.Pub.", "Juizado da Fazenda Pública"],
    [/juizado.*criminal|criminal.*juizado/, "Juizado Especial Criminal", "Juizado Especial Criminal"],
    [/juizado.*civel|civel.*juizado/, "Juizado Especial Cível", "Juizado Especial Cível"],
    [/infracional/, "Infância e Juventude Infracional", "Infância e Juventude Infracional"],
    [/inf[aâ]ncia|infancia|juventude|inf\.? e juv/, "Infância e Juventude Cível", "Infância e Juventude Cível"],
    [/familia|sucess/, "Família e Sucessões", "Família"],
    [/fazenda/, "Fazenda Pública Comum", "Fazenda Pública"],
    [/eleitoral/, "Eleitoral", "Eleitoral"],
    [/criminal|penal/, "Criminal", "Criminal"],
    [/civel|civil/, "Cível", "Cível"],
  ];
  const area = (serv) => { const t = sem(serv); return AREAS.find((a) => a[0].test(t)); };
  globalThis.Sugestoes = {
    prompt: (serv) => { const a = area(serv); return a ? "Outros Área Judicial - " + a[1] : ""; },
    arquivo: (serv) => { const a = area(serv); return a ? a[2] + " - Decisões, Despachos e Sentenças" : ""; },
  };
})();
