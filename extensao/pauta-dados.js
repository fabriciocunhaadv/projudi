// Dados da pauta do dia, lidos das ABAS da Mesa de Audiência do Studio: 1. Briefing, 2. Roteiro, 3. Deliberações, 4. Sentença, 5. Ata.
// A pauta é só de EVENTOS ESPECÍFICOS (intimações, advogados, testemunhas, datas, denúncia, requerimentos). Nada é inventado: cada linha é um trecho
// que já está escrito no Studio (encurtado, com a movimentação); o que não for achado fica em branco. Não usa a ata preliminar.
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAX_EVENTOS = 8, MAX_CHARS = 200;

// remove os rótulos de tela do app (menus, botões) que aparecem junto do texto das abas
const RUIDO = /^(copiar|copiar perguntas|adicionar ponto|salvar ficha|reanalisar com ia|abrir ata preliminar|ata preliminar|selecionar pdf\(s\) dos autos|ver \/ editar texto bruto dos autos|pe[çc]as analisadas:?|carregar pdf dos autos|resumo f[áa]tico da lide|fatos e provas do autor|fatos e contraprovas do r[ée]u|pedido contraposto \/ reconven[çc][ãa]o|diagn[óo]stico probat[óo]rio.*|n[úu]cleo f[áa]tico.*|matriz de pontos.*|alertas & armadilhas.*|rol de depoentes.*|perguntas sugeridas.*)$/i;

const ABREV = /\b(Mov|Movs|Arq|Arqs|P[áa]g|P[áa]gs|art|arts|Dr|Dra|OAB|n|nº|fls|Sr|Sra|Exmo|Exma|c\/c|inc|par|ass|obs|ex)\./gi;
function frases(texto) {
  return String(texto || "").split(/\n+/).map((l) => l.trim()).filter((l) => l && !RUIDO.test(l))
    .map((l) => l.replace(ABREV, (m) => m.slice(0, -1) + "\u2024"))      // "Mov. 66" não termina frase
    .flatMap((l) => l.split(/(?<=[.;!?])\s+(?=[A-ZÁÂÃÉÊÍÓÔÕÚÇ"“(\d])/)).map((f) => f.replace(/\u2024/g, ".").replace(/\s+/g, " ").trim()).filter((f) => f.length > 12);
}
const movs = (f) => {      // "(Mov. 142, Arq. 1, Pág. 2)" -> "mov. 142"; "mov. 95 e 99" fica
  const out = []; for (const m of f.matchAll(/\bMov(?:imenta[cç][aã]o|\.)?\s*(\d+(?:\s*(?:,|e)\s*\d+)*)/gi)) out.push(m[1].replace(/\s*e\s*/g, " e ").replace(/\s*,\s*/g, ", "));
  return [...new Set(out)];
};
function curta(f) {
  let t = f.replace(/\(\s*Mov(?:imenta[cç][aã]o|\.)?\s*\d+[^)]*\)/gi, (m) => { const v = movs(m).join(" e "); return v ? `(mov. ${v})` : ""; })
    .replace(/,?\s*Arq\.?\s*\d+(?:\s*(?:,|e)\s*Arq\.?\s*\d+)*/gi, "").replace(/,?\s*P[áa]gs?\.?\s*\d+(?:\s*(?:a|e|,)\s*\d+)*/gi, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim();
  if (t.length > MAX_CHARS) { t = t.slice(0, MAX_CHARS); t = t.slice(0, Math.max(t.lastIndexOf(" "), 60)).replace(/[,;:\s]+$/, "") + "…"; }
  return t;
}
const EV_INTIM = /\b(intimad|n[ãa]o intimad|citad|n[ãa]o citad|carta (?:de )?(?:intima|cita)|aviso de recebimento|mandado|of[ií]cio|edital|diligencia negativa|sem (?:intima|cita)|endereco)/;
const EV_PEDIDO = /\b(redesign|adiament|retirada de pauta|dispens|requer(?:eu|imento)|pedido de|n[ãa]o compareceu|ausen|transa[cç]|suspeic|prejudicial|sem decis|pendente de decis|videoconferencia|justificou)/;

export function dadosPautaMesa(lido, extra = {}) {
  const abas = lido?.abas || {};
  const tudo = [abas.briefing, abas.roteiro, abas.deliberacoes, abas.sentenca, abas.ata].filter(Boolean).join("\n");
  const out = { processo: "", natureza: "", artigo: "", criminal: false, advogados: [], eventos: [], testemunhas: [], fatos: {}, resumo: "", vazio: false };
  out.processo = (String(lido?.cabecalho?.processo || "").match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [])[0] || "";
  out.natureza = String(lido?.cabecalho?.assunto || "").trim();
  const art = tudo.match(/\bart(?:igo|s?\.)?\s*(\d+[-A-Z]?)(?:\s*,?\s*(caput|§\s*\d+[º°]?))?[^\n]{0,60}?C[óo]digo\s+Penal/i);
  if (art) out.artigo = `art. ${art[1]}${art[2] ? ", " + art[2] : ""} do Código Penal`;
  const fato = tudo.match(/data\s+do\s+fato\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (fato) out.fatos.dataFato = fato[1];
  const nasc = tudo.match(/data\s+de\s+nascimento[^\n:]{0,20}:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (nasc) out.fatos.nascimento = nasc[1];
  const den = tudo.match(/den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (den) out.fatos.denunciaMov = +den[1];
  const rec = tudo.match(/(?:receb\w+|recebimento)[^\n]{0,40}den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (rec) out.fatos.recebimentoMov = +rec[1];
  out.criminal = !!out.artigo || /\bden[úu]ncia\b.*\bmov/i.test(tudo) || /C[óo]digo Penal/i.test(tudo);
  const resumo = (abas.briefing || "").match(/Resumo F[áa]tico da Lide[\s\S]{0,40}?\n+([\s\S]{40,600}?)\n\s*\n/i); if (resumo) out.resumo = resumo[1].replace(/\s+/g, " ").trim();

  // advogados citados no texto das abas (Dr./Dra. + OAB)
  const vistos = new Set();
  for (const m of tudo.matchAll(/\b(Dr\.?|Dra\.?)\s+([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\p{L}'.-]+(?:\s+(?:d[aeo]s?|e|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\p{L}'.-]+)){1,5})[\s,–\-(]*(OAB[^\n,;)]{0,28})?/gu)) {
    const nome = m[2].trim(), k = sa(nome); if (vistos.has(k)) continue; vistos.add(k);
    out.advogados.push(`${m[1].replace(/\.?$/, ".")} ${nome}${m[3] ? " – " + m[3].trim().replace(/[\s.]+$/, "") : ""}`);
    if (out.advogados.length >= 4) break;
  }

  // testemunhas do Roteiro: o card mostra o NOME e, ao lado, o papel (TESTEMUNHA AUTOR / TESTEMUNHA REU / INFORMANTE / PERITO…)
  const linhas = String(abas.roteiro || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const PAPEL = /^(testemunha (?:autor|reu|réu)|informante|perito|assistente t[ée]cnico|vitima|vítima)$/i;
  const pessoas = new Map();
  const juntar = (nome, papel) => { const k = sa(nome).replace(/[^a-z ]/g, "").trim(); if (k.length < 6 || pessoas.has(k) || /roteiro|depoentes|impress/.test(k)) return; pessoas.set(k, { nome: nome.trim(), papel: /v[ií]tima/i.test(papel) ? "vitima" : "testemunha", lado: /autor/i.test(papel) ? "autor" : /r[ée]u/i.test(papel) ? "réu" : "", situacao: "", alerta: false }); };
  let atual = null;
  linhas.forEach((l, i) => {
    const antes = pessoas.size;
    if (PAPEL.test(l) && i > 0 && !PAPEL.test(linhas[i - 1]) && linhas[i - 1].length < 80) juntar(linhas[i - 1], l);
    const m = l.match(/^(.{6,80}?)\s*(TESTEMUNHA (?:AUTOR|REU|RÉU)|INFORMANTE|PERITO|V[ÍI]TIMA)\b/); if (m) juntar(m[1], m[2]);
    if (pessoas.size > antes) atual = [...pessoas.values()].pop();
    else if (atual && !PAPEL.test(l) && !/^objeto da oitiva/i.test(l)) atual.extra = (atual.extra || "") + " " + l;      // linhas do card da testemunha (intimação, ofício…)
  });
  const todasFrases = frases(tudo);
  for (const p of pessoas.values()) {
    const tok = sa(p.nome).split(/\s+/).filter((t) => t.length > 3 && !/^(dos|das|de|da|do)$/.test(t)); const alvo = [tok[0], tok[tok.length - 1]].filter(Boolean);
    const f = frases(p.extra || "").find((s) => EV_INTIM.test(sa(s)) || /\bmov/.test(sa(s))) || todasFrases.find((s) => alvo.length && alvo.every((t) => sa(s).includes(t)) && (EV_INTIM.test(sa(s)) || /\bmov/.test(sa(s))) && !/^(testemunha|informante)/i.test(s));
    if (f) {
      const x = sa(f), mv = movs(f)[0], suf = mv ? ` mov. ${mv}` : "", fem = /^[^ ]+a$/.test(tok[0] || "");
      if (/n[ãa]o intimad|nao foi intimad|n[ãa]o localizad|endereco inexistente|sem intimac|diligencia negativa/.test(x)) { p.situacao = `Não intimad${fem ? "a" : "o"}${suf}`; p.alerta = true; }
      else if (/of[ií]cio/.test(x)) p.situacao = `Ofício expedido${suf}`;
      else if (/intimad/.test(x)) p.situacao = `Intimad${fem ? "a" : "o"}${suf}`;
      else if (/oitiva|ouvid/.test(x)) p.situacao = `Oitiva${suf}`;
      else p.situacao = curta(f);
    }
  }
  out.testemunhas = [...pessoas.values()].map(({ extra, ...p }) => p);

  // eventos específicos: intimações/citações/ofícios e requerimentos/ocorrências, sempre com a movimentação, uma linha curta cada
  const nomesTest = out.testemunhas.map((t) => sa(t.nome));
  const doCard = new Set([...pessoas.values()].flatMap((p) => frases(p.extra || "").map((f) => sa(f))));
  const ev = [], usado = new Set();
  const adiciona = (texto, alerta) => { const c = curta(texto), k = sa(c).slice(0, 60); if (!c || usado.has(k) || ev.length >= MAX_EVENTOS) return; usado.add(k); ev.push({ texto: c, alerta: !!alerta }); };
  // 1) "Alertas & Armadilhas Processuais" do Briefing: só os que tratam da AUDIÊNCIA em si (redesignação, videoconferência, intimações, testemunhas, ofícios…)
  const brief = String(abas.briefing || ""), iAl = brief.search(/Alertas\s*&\s*Armadilhas[^\n]*\n/i);
  const KEY_ALERTA = /(audi[êe]ncia|redesign|videoconfer|zoom|intim|cita[cç]|testemunh|of[ií]cio|mandado|adiament|ausen|compare|dilig|per[ií]cia|carta precat|dispensa)/i;
  if (iAl >= 0) for (const l of brief.slice(iAl).split("\n").slice(1).map((t) => t.trim())) {
    if (l.length < 25 || /^nenhum alerta/i.test(l) || !KEY_ALERTA.test(l)) continue;
    adiciona(l.replace(/\(?\s*link:?\s*https?:\/\/\S+\)?/gi, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim(), /n[ãa]o (?:foi )?(?:intimad|citad|localizad)|sem intima|ausen/i.test(l));
  }
  // 2) pedido contraposto / reconvenção, se houver
  const iPc = brief.search(/Pedido Contraposto \/ Reconven[çc][ãa]o\s*\n/i);
  if (iPc >= 0) { const pc = brief.slice(iPc).split("\n").slice(1).map((t) => t.trim()).find((t) => t && !RUIDO.test(t)); if (pc && !/^(n[ãa]o h[áa]|nenhum|inexist|sem )/i.test(pc) && pc.length > 15) adiciona("Pedido contraposto/reconvenção: " + pc, true); }
  for (const f of todasFrases) {
    const x = sa(f); if (!/\bmov/.test(x) || doCard.has(x)) continue;
    if (nomesTest.some((n) => { const t = n.split(" ").filter((w) => w.length > 3); return t.length && t.every((w) => x.includes(w)) && x.length < 400 && !/\bparte\b/.test(x); })) continue;      // já está na linha da testemunha
    if (!(EV_INTIM.test(x) || EV_PEDIDO.test(x))) continue;
    adiciona(f, /n[ãa]o intimad|sem intima|endereco inexistente|negativ|n[ãa]o compareceu|sem decis|pendente/.test(x));
    if (ev.length >= MAX_EVENTOS) break;
  }
  out.eventos = ev;
  out.vazio = !ev.length && !out.testemunhas.length && !out.advogados.length && !Object.keys(out.fatos).length;
  return out;
}
