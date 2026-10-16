// Extrai do TEXTO do processo (PDF completo, já com OCR) os dados que o juiz usa na pauta de audiências.
// Tudo é sugestão: o texto vem do PDF, e a pauta marca "conferir". Nada é inventado: o que não for achado fica vazio.
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RE_CARIMBO = /Movimenta[cç][aã]o\s*(\d+)\s*:/gi;

export function extrairPauta(texto) {
  const t = String(texto || "");
  const n = sa(t);                                   // mesmo tamanho de t na maioria dos casos; usado só para localizar
  const selo = [...t.matchAll(RE_CARIMBO)].map((m) => ({ i: m.index, mov: +m[1] }));
  // movimentação de uma posição: o carimbo mais próximo ANTES; sem carimbo antes, o primeiro depois
  const movEm = (i) => { let r = null; for (const s of selo) { if (s.i <= i) r = s.mov; else break; } return r ?? selo[0]?.mov ?? null; };
  const nm = (m) => (m == null ? "" : ` mov. ${m}`);

  const out = { artigo: "", dataFato: "", nascimentoReu: "", denunciaMov: null, recebimentoMov: null, pessoas: [], mandadoNaoDevolvido: null, observacoes: [] };

  const art = t.match(/\bart(?:igo|s?\.)?\s*(\d+[-A-Z]?)(?:\s*,?\s*(caput|§\s*\d+[º°]?))?[^\n]{0,60}?C[óo]digo\s+Penal/i);
  if (art) out.artigo = `art. ${art[1]}${art[2] ? ", " + art[2] : ""} do Código Penal`;
  const fato = t.match(/(?:data\s+do\s+fato|no\s+dia|em)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (fato) out.dataFato = fato[1];
  const nasc = t.match(/data\s+de\s+nascimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (nasc) out.nascimentoReu = nasc[1];

  const iDen = n.search(/oferece\s+(?:a\s+presente\s+)?denuncia|denuncia\s*\n|\bdenuncia\b[^\n]{0,40}\bmp\b|ministerio publico[^\n]{0,80}denuncia/);
  if (iDen >= 0) out.denunciaMov = movEm(iDen);
  const iRec = n.search(/recebo\s+a\s+denuncia|recebimento\s+da\s+denuncia|denuncia\s+recebida/);
  if (iRec >= 0) out.recebimentoMov = movEm(iRec);
  if (/mandado[^\n]{0,80}n[ãa]o\s+(?:foi\s+)?devolvid/i.test(t)) out.mandadoNaoDevolvido = true;

  // pessoas: rol de testemunhas e vítima, a partir da denúncia
  const pessoas = new Map();
  const add = (nome, papel) => { const k = sa(nome).trim(); if (k.length < 6 || pessoas.has(k)) return; pessoas.set(k, { nome: nome.trim(), papel }); };
  const NOME = "[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\\p{L}'.]+(?:[ \\t]+(?:d[aeo]s?|e|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\\p{L}'.]+)){1,6}";
  const reVit = new RegExp(`[Vv][íi]tima\\s*:?\\s*(${NOME})`, "gu");
  for (const m of t.matchAll(reVit)) add(m[1], "vitima");
  const iRol = t.search(/rol\s+de\s+testemunhas|testemunhas\s*:/i);
  if (iRol >= 0) {
    const bloco = t.slice(iRol, iRol + 1500).split(/\n\s*\n|Termos em que|Nestes termos|Pede deferimento/i)[0];
    for (const l of bloco.split("\n").slice(1)) { const m = l.replace(/^[\s\d.\-–•)]+/, "").match(new RegExp(`^(${NOME})`, "u")); if (m) add(m[1], "testemunha"); }
  }
  for (const p of pessoas.values()) {
    const alvo = sa(p.nome); const achados = [];
    let pos = 0; while ((pos = n.indexOf(alvo, pos)) >= 0 && achados.length < 60) { achados.push(pos); pos += alvo.length; }
    const por = { intimado: null, nao_intimado: null, oficio: null, oitiva: null }; let obs = "";
    for (const i of achados) {
      // contexto = a linha do nome + a seguinte (se não for outro carimbo de movimentação), para uma certidão não "contaminar" outra pessoa
      const ini = n.lastIndexOf("\n", i) + 1; let fim = n.indexOf("\n", i + alvo.length); if (fim < 0) fim = n.length;
      let fim2 = n.indexOf("\n", fim + 1); if (fim2 < 0) fim2 = n.length;
      const prox = n.slice(fim + 1, fim2), ctx = n.slice(ini, fim) + (/movimentacao\s*\d+\s*:/.test(prox) ? "" : " " + prox), mov = movEm(i);
      if (/endereco inexistente|nao\s+(?:foi\s+)?(?:localizad|encontrad|possivel intimar)|diligencia negativa|nao reside|mudou-se/.test(ctx)) { por.nao_intimado = mov; if (/endereco inexistente/.test(ctx)) obs = "endereço inexistente"; }
      else if (/intimad[oa]|certifico[^\n]{0,80}intim|cumpr\w+ (?:o )?mandado/.test(ctx)) por.intimado = mov;
      if (/oficio/.test(ctx)) por.oficio = mov;
      if (/termo de (?:audiencia|depoimento)|oitiva|foi ouvid/.test(ctx)) por.oitiva = mov;
    }
    p.situacao = por.nao_intimado != null ? `Não intimado${nm(por.nao_intimado)}${obs ? " – " + obs : ""}` : por.intimado != null ? `Intimad${/^[^ ]+a\b/.test(p.nome.split(" ")[0]) ? "a" : "o"}${nm(por.intimado)}` : por.oficio != null ? `Ofício expedido${nm(por.oficio)}` : por.oitiva != null ? `oitiva${nm(por.oitiva)}` : "";
    out.pessoas.push(p);
  }
  return out;
}
if (typeof globalThis !== "undefined") globalThis.PautaExtrator = { extrairPauta };

// Monta os dados da pauta a partir do que foi LIDO na Mesa de Audiência do Studio (abas 1–5 e ata preliminar). Roda na página da pauta (tem DOM).
export function dadosDaMesa(lido) {
  const out = { artigo: "", dataFato: "", nascimentoReu: "", denunciaMov: null, recebimentoMov: null, pessoas: [], mandadoNaoDevolvido: null, alertas: [], resumo: "", fonte: "mesa" };
  const abas = lido?.abas || {};
  const tudo = Object.values(abas).join("\n");
  const art = tudo.match(/\bart(?:igo|s?\.)?\s*(\d+[-A-Z]?)(?:\s*,?\s*(caput|§\s*\d+[º°]?))?[^\n]{0,60}?C[óo]digo\s+Penal/i);
  if (art) out.artigo = `art. ${art[1]}${art[2] ? ", " + art[2] : ""} do Código Penal`;
  const fato = tudo.match(/(?:data\s+do\s+fato|no\s+dia|em)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (fato) out.dataFato = fato[1];
  const nasc = tudo.match(/data\s+de\s+nascimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (nasc) out.nascimentoReu = nasc[1];
  const den = tudo.match(/den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (den) out.denunciaMov = +den[1];
  const rec = tudo.match(/(?:receb\w+|recebimento)[^\n]{0,40}den[úu]ncia[^\n]{0,40}?mov(?:imenta[cç][aã]o|\.)?\s*(\d+)/i); if (rec) out.recebimentoMov = +rec[1];
  const resumo = (abas.briefing || "").match(/Resumo F[áa]tico da Lide[\s\S]{0,40}?\n+([\s\S]{40,700}?)\n\s*\n/i); if (resumo) out.resumo = resumo[1].replace(/\s+/g, " ").trim();
  if (lido?.ataHtml && typeof DOMParser !== "undefined") {
    const d = new DOMParser().parseFromString(`<div id="r">${lido.ataHtml}</div>`, "text/html");
    const mov = (t) => { const m = String(t || "").match(/Mov\.?\s*(\d+(?:\s*(?:,|e)\s*\d+)*)/i); return m ? m[1].replace(/\s*e\s*/g, ", ") : ""; };
    const tx = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();
    d.querySelectorAll("table").forEach((t) => {
      const cab = [...t.querySelectorAll("th")].map(tx).map(sa);
      const linhas = [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map(tx));
      if (cab[0] === "testemunha") linhas.forEach((c) => {
        const intim = sa(c[3] || ""), onde = mov(c[4]) || mov(c[3]);
        const sit = /negativ|nao intimad|nao localizad/.test(intim) ? `Não intimado${onde ? " mov. " + onde : ""}` : /intimad/.test(intim) ? `Intimado${onde ? " mov. " + onde : ""}` : intim && !/nao consta/.test(intim) ? c[3] : "";
        out.pessoas.push({ nome: c[0].replace(/\s+—.*$/, ""), papel: "testemunha", situacao: sit + (/conferir/i.test(c[4] || "") ? " [conferir]" : "") });
      });
      if (cab[0] === "destinatario") linhas.forEach((c) => { if (/negativ|nao localizad|aguardando/.test(sa(c[2] || ""))) out.alertas.push(`${c[1] || "Ato"} de ${c[0]}: ${c[2]}${mov(c[4]) ? " (mov. " + mov(c[4]) + ")" : ""}`); });
      if (cab[0] === "pedido") linhas.forEach((c) => out.alertas.push(`Pedido: ${c[0]} (${c[1]}) — ${/sem decisao/.test(sa(c[3] || "")) ? "sem decisão" : c[3]}${mov(c[4]) ? " (mov. " + mov(c[4]) + ")" : ""}`));
    });
    d.querySelectorAll(".quadro li.alto").forEach((li) => out.alertas.push(tx(li)));
    d.querySelectorAll(".meta").forEach((m) => { if (/^\s*(Promotor|Vítima|Vitima)/i.test(tx(m))) { const v = tx(m).replace(/^[^:]*:\s*/, ""); if (/^v[ií]tima/i.test(tx(m))) out.pessoas.push({ nome: v, papel: "vitima", situacao: "" }); } });
  }
  return out;
}
