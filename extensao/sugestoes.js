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
    [/execucao fiscal.*estadual|estadual.*execucao fiscal/, "Execução Fiscal Estadual", "Execução Fiscal"],
    [/execucao fiscal|exec\.? fiscal/, "Execução Fiscal Municipal", "Execução Fiscal"],
    [/fazenda/, "Fazenda Pública Comum", "Fazenda Pública"],
    [/eleitoral/, "Eleitoral", "Eleitoral"],
    [/criminal|penal/, "Criminal", "Criminal"],
    [/civel|civil/, "Cível", "Cível"],
  ];
  // Só a parte do NOME DA UNIDADE conta: o nome da cidade confundia ("Fazenda Nova - Juizado Especial Cível" virava Fazenda Pública; "Itumbiara - Cível e Criminal" virava Criminal)
  const unidade = (serv) => { const partes = String(serv || "").split(/\s+-\s+/).map((x) => x.trim()).filter((x) => x && !/^[A-Z]{2}$/.test(x)); return partes.length > 1 ? partes.slice(1).join(" ") : partes[0] || ""; };
  const area = (serv) => { const t = sem(unidade(serv)); if (/juizado/.test(t) && /civel/.test(t) && /criminal/.test(t)) return AREAS.find((a) => a[1] === "Juizado Especial Cível"); return AREAS.find((a) => a[0].test(t)); };
  globalThis.Sugestoes = {
    prompt: (serv) => { const a = area(serv); return a ? "Outros Área Judicial - " + a[1] : ""; },
    arquivo: (serv) => { const a = area(serv); return a ? a[2] + " - Decisões, Despachos e Sentenças" : ""; },
  };
})();
