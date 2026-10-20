// Marcos do processo para a pauta, tirados do TEXTO BRUTO DOS AUTOS que a Mesa guarda (o carimbo "Movimentacao N : tipo" de cada página do Projudi).
// Só entram fatos que estão escritos nos autos, sempre com a movimentação e a data; o que não for achado fica de fora. Nada é deduzido nem inventado.
const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ws = (s) => String(s || "").replace(/\s+/g, " ").trim();
const dm = (d) => (d ? d.slice(0, 5) : "");      // 21/09/2026 -> 21/09
const tokens = (nome) => sa(nome).replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 3 && !/^(dos|das|de|da|do|instituto|nacional|seguro|social)$/.test(t));
const bate = (texto, nome) => {
  const x = sa(texto), t = tokens(nome);
  if (t.length && (t.length === 1 ? x.includes(t[0]) : [t[0], t[t.length - 1]].every((w) => x.includes(w)))) return true;
  const todas = sa(nome).replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);      // órgãos: "INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS" x "Instituto Nacional do Seguro Social"
  return todas.length >= 3 && todas.filter((w) => x.includes(w)).length >= Math.min(3, todas.length);
};

function carimbos(t) {
  const out = [], vistos = new Set();
  for (const m of t.matchAll(/Movimenta[cç][aã]o\s+(\d{1,4})\s*:\s*([^\n]{2,90})/g)) {
    const tipo = ws(m[2]).replace(/\s*Arquivo\s*\d+.*$/i, "").replace(/\s*-?\s*Pag\..*$/i, "").trim();
    out.push({ i: m.index, mov: +m[1], tipo, novo: !vistos.has(+m[1]) }); vistos.add(+m[1]);
  }
  return out;
}

export function marcosDosAutos(texto, ctx = {}) {
  const t = String(texto || "");
  const res = { marcos: [], autor: { situacao: "", alerta: false }, reu: { situacao: "", alerta: false }, testemunhas: {}, advogados: [], datas: {}, lido: t.length };
  if (t.length < 500) return res;
  const st = carimbos(t);
  const tipoDaMov = new Map(); st.forEach((s) => { if (!tipoDaMov.has(s.mov)) tipoDaMov.set(s.mov, s.tipo); });
  const maisPerto = (pos, rx) => { let melhor = null, d = 1e9; for (const s of st) { if (rx && !rx.test(sa(s.tipo))) continue; const x = Math.abs(s.i - pos); if (x < d && x < 1800) { d = x; melhor = s; } } return melhor; };

  // 1) movimentações SEM arquivo: "A movimentação: ( <tipo> - <detalhe> - Adv(s). de FULANO (Referente à ...) ) do dia dd/mm/aaaa"
  const eventos = [];
  for (const m of t.matchAll(/A movimenta[cç][aã]o:\s*\(([\s\S]{3,700}?)\)\s*do dia\s+(\d{2}\/\d{2}\/\d{4})/gi)) {
    const corpo = ws(m[1]), tipo = ws(corpo.split(" - ")[0]);
    const dest = (corpo.match(/(?:Adv\(s\)\.?\s*de|Promovente|Promovido|Minist[eé]rio P[uú]blico|Testemunha|Parte)\s*:?\s*([^()]{3,80}?)(?:\s*\(Referente|\s*$)/i) || [])[1] || "";
    const sCarimbo = maisPerto(m.index, new RegExp("^" + sa(tipo).split(" ").slice(0, 2).join(" ")));
    if (sCarimbo) eventos.push({ mov: sCarimbo.mov, tipo, data: m[2], dest: ws(dest), corpo });
  }
  // movimentações COM arquivo (mandado, citação, ofício…): o tipo vem do carimbo e a data, da assinatura/publicação do documento
  for (const s of st) {
    if (!s.novo || !/mandado|cita[cç]|of[ií]cio|carta|edital|intima/i.test(sa(s.tipo)) || eventos.some((e) => e.mov === s.mov)) continue;
    const dd = (t.slice(s.i, s.i + 9000).match(/Publicado Digitalmente em\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || "";
    eventos.push({ mov: s.mov, tipo: s.tipo, data: dd, dest: "", corpo: s.tipo });
  }
  const dedup = new Map(); eventos.forEach((e) => { const k = e.mov + "|" + sa(e.tipo); if (!dedup.has(k)) dedup.set(k, e); });
  const evs = [...dedup.values()].sort((a, b) => a.mov - b.mov);

  // 2) audiências designadas/redesignadas (tipo da movimentação ou texto do despacho/decisão)
  const aud = [];
  for (const s of st) {
    if (!s.novo || !/audi[eê]ncia|designa/i.test(sa(s.tipo)) || /intima|certid/i.test(sa(s.tipo))) continue;
    const trecho = t.slice(s.i, s.i + 3500), x = sa(trecho);
    const m = x.match(/audiencia[^\n]{0,120}?(\d{2}\/\d{2}\/\d{4})(?:[^\n]{0,24}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?/);
    aud.push({ mov: s.mov, tipo: s.tipo, para: m ? m[1] + (m[2] ? ` às ${m[2].padStart(2, "0")}h${m[3] || "00"}` : "") : "" });
  }
  const ultimaAud = aud.length ? aud[aud.length - 1] : null;
  if (aud.length) {
    const ds = aud.slice(-3).map((a) => `${/redesign/i.test(a.tipo) ? "redesignada" : /realizad/i.test(a.tipo) ? "realizada" : "designada"} mov. ${a.mov}${a.para ? " (" + a.para + ")" : ""}`);
    res.marcos.push({ texto: "Audiência " + ds.join("; "), alerta: aud.length > 1 });
  }
  const depois = (e) => !ultimaAud || e.mov > ultimaAud.mov;

  // 3) citação, mandado, ofício, carta
  for (const e of evs) {
    const x = sa(e.tipo);
    if (/cita[cç]|citac/.test(x) && /efetivad|cumprid|lida|positiv|expedid/.test(x)) { res.marcos.push({ texto: `${/expedid/.test(x) ? "Citação expedida" : "Citação efetivada"}${e.dest ? " (" + e.dest + ")" : ""} mov. ${e.mov} (${dm(e.data)})`, alerta: false }); }
    else if (/mandado (cumprido|expedido)/.test(x)) res.marcos.push({ texto: `${e.tipo} mov. ${e.mov}${e.data ? " (" + dm(e.data) + ")" : ""}`, alerta: /expedido/.test(x) && !evs.some((o) => /mandado cumprido/.test(sa(o.tipo)) && o.mov > e.mov) });
    else if (/of[ií]cio|carta (de )?(intima|cita)|edital/.test(x) && /expedid|cumprid|efetivad/.test(x)) res.marcos.push({ texto: `${e.tipo}${e.dest ? " (" + e.dest + ")" : ""} mov. ${e.mov} (${dm(e.data)})`, alerta: false });
  }
  // 4) contestação / réplica (tipo da movimentação, ou nome do arquivo juntado)
  const pecas = (rx, rot) => { const s = st.find((x) => x.novo && (rx.test(sa(x.tipo)) || rx.test(sa(t.slice(x.i, x.i + 260).match(/Arquivo\s*\d+\s*:\s*([^\n]{3,80})/i)?.[1] || "")))); if (s) { const dd = (t.slice(s.i, s.i + 5000).match(/(?:Assinado e )?Publicado Digitalmente em\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || ""; res.marcos.push({ texto: `${rot} mov. ${s.mov}${dd ? " (" + dm(dd) + ")" : ""}`, alerta: false }); } };
  pecas(/contesta/, "Contestação"); pecas(/replica|impugna[cç][aã]o [aà] contesta|impugnacao a contestacao/, "Réplica");
  // 5) intimações das partes e das testemunhas PARA A AUDIÊNCIA (efetivadas/lidas depois da última designação)
  const g = (n) => { const p = sa(n).split(" ")[0]; return /a$/.test(p) ? "a" : /(o|os|l|r|n|m|s|z)$/.test(p) ? "o" : "o(a)"; };
  const efet = evs.filter((e) => /intima/.test(sa(e.tipo)) && /efetivad|lida/.test(sa(e.tipo)) && depois(e));
  const exped = evs.filter((e) => /intima/.test(sa(e.tipo)) && /expedid/.test(sa(e.tipo)) && depois(e));
  const situ = (nome, lado) => {
    const bateE = (e) => bate(e.dest || e.corpo, nome) || (lado && new RegExp(lado, "i").test(e.dest));
    const e = efet.filter(bateE).pop(); if (e) return { texto: `Intimad${g(nome)}${/adv/i.test(e.corpo) ? " (adv.)" : ""} mov. ${e.mov} (${dm(e.data)})`, alerta: false };
    const x = exped.filter(bateE).pop(); if (x) return { texto: `Intimação expedida mov. ${x.mov} (${dm(x.data)}), sem confirmação de leitura`, alerta: true };
    return null;
  };
  if (ctx.autor) { const s = situ(ctx.autor, "promovente"); if (s) { res.autor.situacao = s.texto; res.autor.alerta = s.alerta; } }
  if (ctx.reu) { const s = situ(ctx.reu, "promovido"); if (s) { res.reu.situacao = s.texto; res.reu.alerta = s.alerta; } }
  for (const nome of ctx.testemunhas || []) { const s = situ(nome, ""); if (s) res.testemunhas[sa(nome)] = s; }

  // 6) advogados: assinatura "NOME OAB/UF – número": o da inicial (autor) e o da contestação (réu)
  const OAB = /([A-ZÁÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ú'.]+(?:\s+(?:d[aeo]s?|e|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ú'.]+)){1,6})\s*\n?\s*OAB\s*\/?\s*([A-Z]{2})\s*(?:n[º°o.]*|[-–:])?\s*([\d.]{4,8}(?:-?[A-Z])?)/g;
  const advDe = (ini, fim) => { const seg = t.slice(ini, fim); const out = []; for (const m of seg.matchAll(OAB)) { const nome = ws(m[1]).replace(/^(Dr|Dra)\.?\s+/i, ""); if (!out.some((o) => sa(o) === sa(nome))) out.push(`${nome} – OAB/${m[2]} ${m[3]}`); } return out.slice(0, 2); };
  const s1 = st.find((s) => s.mov === 1), s2 = st.find((s) => s.mov === 2);
  if (s1) { const a = advDe(s1.i, s2 && s2.i > s1.i ? s2.i : s1.i + 15000); if (a.length) res.advogados.push({ lado: "autor", texto: a.join("; ") }); }
  const sc = st.find((x) => x.novo && /contesta/.test(sa(x.tipo)));
  if (sc) { const a = advDe(sc.i, sc.i + 20000); if (a.length) res.advogados.push({ lado: "reu", texto: a.join("; ") }); }

  // 7) datas úteis
  const dist = (t.match(/Distribu[ií]d\w+[^\n]{0,60}?(\d{2}\/\d{2}\/\d{4})/i) || [])[1]; if (dist) res.datas.distribuicao = dist;
  res.marcos = res.marcos.filter((m, i, a) => a.findIndex((x) => x.texto === m.texto) === i).slice(0, 7);
  return res;
}
