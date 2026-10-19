// Dados da pauta lidos da Mesa de Audiência do Studio (abas 1 a 5 + ata preliminar). Nada é inventado: só entra o que o Studio mostra;
// o que faltar fica em branco e a pauta avisa. Roda em página com DOM (usa DOMParser).
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tx = (e) => (e?.textContent || "").replace(/\s+/g, " ").trim();
const movDe = (t) => { const m = String(t || "").match(/Mov\.?\s*(\d+(?:\s*(?:,|e|a)\s*\d+)*)/i); return m ? m[1].replace(/\s*e\s*/g, " e ").replace(/\s*,\s*/g, ", ") : ""; };
const NOME_PAPEL = /\s*\((?:autor|reu|réu|ativo|passivo|mp|ministerio publico|ministério público|requerente|requerido|[a-zçãé ]{2,30})\)\s*$/i;
const limpaNome = (s) => String(s || "").replace(NOME_PAPEL, "").replace(/\s+—.*$/, "").trim();
const chaveNome = (s) => sa(limpaNome(s)).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const masc = (nome) => !/^[^ ]+a\b/i.test(sa(String(nome).trim().split(" ")[0]));      // "Maria", "Joana": feminino (sugestão; a pauta é editável)

function situacaoDe(ato, resultado, onde, nome) {
  const a = sa(ato), r = sa(resultado), m = movDe(onde), g = masc(nome) ? "o" : "a", at = /cita/.test(a) ? "Citad" : "Intimad";
  const sufixo = m ? ` mov. ${m}` : "";
  if (/negativ|nao (?:foi )?(?:intimad|citad|localizad)|diligencia negativa/.test(r)) return { texto: `Não ${at.toLowerCase()}${g}${sufixo}`, alerta: true };
  if (/positiv|intimad|citad|cumprid/.test(r)) return { texto: `${at}${g}${sufixo}`, alerta: false };
  if (/aguard|pendente|nao consta|sem /.test(r) || !r) return { texto: `${at === "Citad" ? "Citação" : "Intimação"} sem resultado${sufixo}`, alerta: true };
  return { texto: `${ato} ${resultado}${sufixo}`.trim(), alerta: false };
}

export function dadosPautaMesa(lido, extra = {}) {
  const abas = lido?.abas || {};
  const tudo = Object.values(abas).join("\n");
  const out = { processo: "", natureza: "", artigo: "", criminal: false, partes: [], testemunhas: [], observacoes: [], alertas: [], semAta: !lido?.ataHtml, fatos: {}, resumo: "" };
  out.processo = (String(lido?.cabecalho?.processo || "").match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0] || "";
  // 1) texto das abas (Briefing, Roteiro, Deliberações, Sentença, Ata)
  const art = tudo.match(/\bart(?:igo|s?\.)?\s*(\d+[-A-Z]?)(?:\s*,?\s*(caput|§\s*\d+[º°]?))?[^\n]{0,60}?C[óo]digo\s+Penal/i);
  if (art) out.artigo = `art. ${art[1]}${art[2] ? ", " + art[2] : ""} do Código Penal`;
  const fato = tudo.match(/data\s+do\s+fato\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (fato) out.fatos.dataFato = fato[1];
  const nasc = tudo.match(/data\s+de\s+nascimento[^\n:]{0,20}:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (nasc) out.fatos.nascimento = nasc[1];
  const den = tudo.match(/den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (den) out.fatos.denunciaMov = +den[1];
  const rec = tudo.match(/(?:receb\w+|recebimento)[^\n]{0,40}den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (rec) out.fatos.recebimentoMov = +rec[1];
  const resumo = (abas.briefing || "").match(/Resumo F[áa]tico da Lide[\s\S]{0,40}?\n+([\s\S]{40,700}?)\n\s*\n/i); if (resumo) out.resumo = resumo[1].replace(/\s+/g, " ").trim();

  // 2) ata preliminar (HTML do documento): partes, advogados, testemunhas, citações/intimações, pedidos e pontos de atenção
  if (lido?.ataHtml && typeof DOMParser !== "undefined") {
    const d = new DOMParser().parseFromString(`<div id="r">${lido.ataHtml}</div>`, "text/html");
    let atual = null;
    d.querySelectorAll(".meta").forEach((m) => {
      const rot = tx(m.querySelector(".rot")).replace(/:$/, ""), val = tx(m.querySelector("b")) || tx(m).replace(/^[^:]*:\s*/, "");
      if (/^data$/i.test(rot)) return;
      if (/^n[úu]mero do processo$/i.test(rot)) { const c = (val.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0]; if (c) out.processo = c; return; }
      if (/^natureza$/i.test(rot)) { out.natureza = val; return; }
      if (/^valor/i.test(rot)) return;
      if (/^(advogad|promotor)/i.test(rot)) { if (atual) atual.advogados.push(val.replace(/\s*\[conferir\]\s*$/i, "")); return; }
      atual = { rot, nome: val.replace(/\s*\[conferir\]\s*$/i, ""), advogados: [], situacao: "", alerta: false };
      out.partes.push(atual);
    });
    const secao = (rx) => [...d.querySelectorAll(".secao")].find((s) => rx.test(sa(tx(s))));
    const tabelaApos = (rx) => { const s = secao(rx); if (!s) return null; let n = s.nextElementSibling; while (n && !n.matches("table, .secao")) n = n.nextElementSibling; return n && n.matches("table") ? n : null; };
    const linhas = (t) => (t ? [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map(tx)) : []);
    // citações e intimações das PARTES
    for (const c of linhas(tabelaApos(/citac\w+ e intimac/))) {
      const alvo = chaveNome(c[0]); const p = out.partes.find((x) => chaveNome(x.nome) === alvo);
      const s = situacaoDe(c[1], c[2], c[4], limpaNome(c[0]));
      if (p) { p.situacao = p.situacao ? p.situacao + "; " + s.texto : s.texto; p.alerta = p.alerta || s.alerta; }
      else out.alertas.push({ texto: `${limpaNome(c[0])}: ${s.texto}`, alto: s.alerta });
    }
    // testemunhas (e vítima, quando o Studio a lista com essa qualificação)
    for (const c of linhas(tabelaApos(/testemunhas indicadas/))) {
      const nomeBruto = c[0] || "", vit = /—\s*v[ií]tima/i.test(nomeBruto) || /^v[ií]tima/i.test(sa(nomeBruto)), nome = limpaNome(nomeBruto);
      const intim = sa(c[3] || ""), onde = movDe(c[4]) || movDe(c[3]);
      let sit = "", alerta = false;
      if (/negativ|nao intimad|nao localizad/.test(intim)) { sit = `Não intimad${masc(nome) ? "o" : "a"}${onde ? " mov. " + onde : ""}`; alerta = true; }
      else if (/intimad/.test(intim)) sit = `Intimad${masc(nome) ? "o" : "a"}${onde ? " mov. " + onde : ""}`;
      else if (/oficio/.test(intim)) sit = `Ofício expedido${onde ? " mov. " + onde : ""}`;
      else if (/aguard|nao consta|pendente/.test(intim) || !intim) { sit = `Sem intimação confirmada${onde ? " (mov. " + onde + ")" : ""}`; alerta = true; }
      else sit = c[3];
      out.testemunhas.push({ nome, papel: vit ? "vitima" : "testemunha", indicadaPor: c[1] || "", situacao: sit, alerta, conferir: /conferir/i.test(c.join(" ")) });
    }
    // pedidos relacionados à audiência
    for (const c of linhas(tabelaApos(/pedidos relacionados/))) {
      const m = movDe(c[4]); out.observacoes.push(`${c[0]}${c[1] ? " (" + c[1] + ")" : ""}${c[2] ? ": " + c[2] : ""} — ${/sem decis/.test(sa(c[3] || "")) || !c[3] ? "sem decisão" : c[3]}${m ? " (mov. " + m + ")" : ""}`);
    }
    // pontos de atenção
    const sa2 = secao(/pontos de atencao/);
    if (sa2) { let n = sa2.nextElementSibling; while (n && !n.matches(".secao")) { n.querySelectorAll?.("li").forEach((li) => { const t = tx(li); if (t && !/nenhum ponto/i.test(t)) out.alertas.push({ texto: t.replace(/^\[(?:ALTO|MÉDIO|MEDIO)\]\s*/i, ""), alto: /alto/.test(li.className) || /^\[ALTO\]/i.test(t) }); }); n = n.nextElementSibling; } }
    d.querySelectorAll(".quadro li.alto").forEach((li) => { const t = tx(li); if (t && !out.alertas.some((a) => a.texto === t)) out.alertas.push({ texto: t, alto: true }); });
    // o resumo da ata, se o Briefing não trouxe
    if (!out.resumo) { const s = secao(/resumo do processo/); const p = s?.nextElementSibling; if (p && p.matches(".corpo")) out.resumo = tx(p).slice(0, 700); }
  } else if (abas.roteiro) {
    // sem ata: testemunhas a partir do Roteiro (a aba mostra o nome e a parte); a pauta marca "conferir"
    for (const l of String(abas.roteiro).split("\n")) { const m = l.match(/^\s*(?:[•\-–]\s*)?([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\p{L}'.]+(?:\s+(?:d[aeo]s?|e|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\p{L}'.]+)){1,6})\s+TESTEMUNHA/iu); if (m) out.testemunhas.push({ nome: m[1], papel: "testemunha", indicadaPor: "", situacao: "", alerta: false, conferir: true }); }
  }
  if (!out.artigo) { const a2 = out.natureza.match(/\bart(?:igo|s?\.)?\s*\d+[^)]*Código Penal/i); if (a2) out.artigo = a2[0].replace(/^\s*\(/, ""); }
  out.criminal = !!out.artigo || out.partes.some((p) => /minist[eé]rio p[uú]blico|promotor/i.test(p.rot + " " + p.nome)) || /C[óo]digo Penal|den[úu]ncia/i.test(out.natureza);
  if (extra.autor && !out.partes.length) out.partes.push({ rot: "Autor", nome: extra.autor, advogados: [], situacao: "", alerta: false });
  return out;
}
