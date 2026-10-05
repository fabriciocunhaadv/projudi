// Monta UM PDF (com texto, pesquisável) com os modelos de decisão, despacho e sentença de uma serventia,
// para a base de conhecimento do Studio (que só aceita PDF). Cada modelo leva Id, nome, tipo e serventia.
const { PDFDocument, StandardFonts, rgb } = PDFLib;

export const TIPOS = ["Decisão", "Despacho", "Sentença"];
const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const tipoCanonico = (t) => TIPOS.find((x) => sem(x) === sem(t).replace(/s$/, "")) || TIPOS.find((x) => sem(t).startsWith(sem(x).slice(0, 5))) || t || "Outros";

export async function montarPdf({ serventia, modelos, geradoEm = new Date() }) {
  const doc = await PDFDocument.create();
  const r = await doc.embedFont(StandardFonts.Helvetica), b = await doc.embedFont(StandardFonts.HelveticaBold);
  const seguro = (f, t) => { let o = ""; for (const ch of String(t)) { try { f.encodeText(ch); o += ch; } catch { o += "?"; } } return o; };
  const W = 595, H = 842, M = 50, LARG = W - 2 * M;
  let pg = doc.addPage([W, H]), y = H - M;
  const nova = () => { pg = doc.addPage([W, H]); y = H - M; };
  const quebrar = (texto, fonte, tam) => {
    const linhas = [];
    for (const par of seguro(fonte, texto).replace(/\t/g, "    ").split(/\r?\n/)) {
      if (!par.trim()) { linhas.push(""); continue; }
      let atual = "";
      for (const palavra of par.split(/\s+/)) {
        const teste = atual ? atual + " " + palavra : palavra;
        if (fonte.widthOfTextAtSize(teste, tam) <= LARG) atual = teste;
        else { if (atual) linhas.push(atual); atual = palavra; }
      }
      linhas.push(atual);
    }
    return linhas;
  };
  const escrever = (texto, { fonte = r, tam = 10, cor = rgb(0, 0, 0), antes = 0, depois = 0 } = {}) => {
    y -= antes;
    for (const l of quebrar(texto, fonte, tam)) {
      if (y < M + tam) nova();
      if (l) pg.drawText(l, { x: M, y: y - tam, size: tam, font: fonte, color: cor });
      y -= tam * 1.3;
    }
    y -= depois;
  };

  const ordenados = [];
  for (const tipo of TIPOS) ordenados.push(...modelos.filter((m) => tipoCanonico(m.tipo) === tipo).sort((a, c) => String(a.nome).localeCompare(c.nome, "pt-BR")));
  ordenados.push(...modelos.filter((m) => !TIPOS.includes(tipoCanonico(m.tipo))));

  escrever(`MODELOS DO GABINETE — ${serventia}`, { fonte: b, tam: 14, depois: 4 });
  escrever(`Decisões, despachos e sentenças cadastrados no Projudi. Atualizado em ${geradoEm.toLocaleString("pt-BR")}. Total: ${modelos.length} modelo(s).`, { tam: 9, cor: rgb(0.3, 0.3, 0.3), depois: 6 });
  escrever("Use estes modelos como referência de estilo e estrutura. Ao sugerir um modelo ao assessor, cite o Id e o nome (ex.: “Modelo 504007 — Citação Edital”).", { tam: 9, depois: 8 });
  escrever("ÍNDICE", { fonte: b, tam: 11, depois: 2 });
  for (const tipo of [...TIPOS, "Outros"]) {
    const grupo = ordenados.filter((m) => (TIPOS.includes(tipoCanonico(m.tipo)) ? tipoCanonico(m.tipo) : "Outros") === tipo);
    if (!grupo.length) continue;
    escrever(`${tipo} (${grupo.length})`, { fonte: b, tam: 10, antes: 3 });
    grupo.forEach((m) => escrever(`  ${m.id} — ${m.nome}`, { tam: 9 }));
  }
  for (const m of ordenados) {
    nova();
    escrever(`[${tipoCanonico(m.tipo)}] Modelo ${m.id} — ${m.nome}`, { fonte: b, tam: 12, depois: 2 });
    escrever(`Serventia: ${m.serventia || serventia}`, { tam: 8, cor: rgb(0.35, 0.35, 0.35), depois: 8 });
    escrever(m.texto || "(modelo sem texto)", { tam: 10 });
  }
  doc.setTitle(`Modelos — ${serventia}`); doc.setProducer("Extensão Conclusões Projudi");
  return doc.save();
}
