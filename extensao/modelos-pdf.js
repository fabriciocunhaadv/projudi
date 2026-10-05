// Monta UM PDF (com texto, pesquisável) com os modelos de decisão, despacho e sentença de uma serventia,
// para a base de conhecimento do Studio (que só aceita PDF). Cada modelo leva Id, nome, tipo e serventia.
const { PDFDocument, StandardFonts, rgb } = PDFLib;

export const nomePadrao = (serv) => globalThis.Sugestoes?.arquivo(serv) || `Modelos - ${serv.replace(/^.*?\s-\s(?:Vara\s+(?:de|do|da)\s+)?/i, "").trim() || serv} - Decisões, Despachos e Sentenças`;
export const semBarra = (s) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

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
  for (const tipo of TIPOS) ordenados.push(...modelos.filter((m) => tipoCanonico(m.tipo) === tipo).sort((a, c) => String(a.nome).localeCompare(c.nome, "pt-BR") || Number(a.id) - Number(c.id)));
  ordenados.push(...modelos.filter((m) => !TIPOS.includes(tipoCanonico(m.tipo))));

  // Cada modelo é identificado por "Área | Tipo | Nome" (ex.: Família | Decisão | Decisão inicial); nomes repetidos recebem 1, 2…
  const area = (globalThis.Sugestoes?.arquivo(serventia) || "").replace(/\s*-\s*Decisões.*$/, "") || String(serventia).replace(/^.*?\s-\s(?:Vara\s+(?:de|do|da)\s+)?/i, "").replace(/\s*-\s*GO\s*$/i, "").trim();
  const chaveNome = (m) => tipoCanonico(m.tipo) + "|" + sem(m.nome).replace(/\s+/g, " ").trim();
  const quantos = new Map(), vistos = new Map();
  ordenados.forEach((m) => quantos.set(chaveNome(m), (quantos.get(chaveNome(m)) || 0) + 1));
  [...ordenados].sort((a, c) => Number(a.id) - Number(c.id)).forEach((m) => {
    const k = chaveNome(m), n = (vistos.get(k) || 0) + 1; vistos.set(k, n);
    m.rotulo = `${area} | ${tipoCanonico(m.tipo)} | ${String(m.nome).trim()}${quantos.get(k) > 1 ? " " + n : ""}`;
  });

  escrever(`MODELOS DO GABINETE — ${serventia}`, { fonte: b, tam: 14, depois: 4 });
  escrever(`Decisões, despachos e sentenças cadastrados no Projudi. Atualizado em ${geradoEm.toLocaleString("pt-BR")}. Total: ${modelos.length} modelo(s).`, { tam: 9, cor: rgb(0.3, 0.3, 0.3), depois: 6 });
  escrever("Use estes modelos como referência de estilo e estrutura. Cada modelo é identificado por “Área | Tipo | Nome do modelo” (ex.: “Família | Decisão | Decisão inicial”; havendo mais de um com o mesmo nome, vêm numerados: 1, 2…). Ao sugerir um modelo, cite esse identificador.", { tam: 9, depois: 8 });
  escrever("ÍNDICE", { fonte: b, tam: 11, depois: 2 });
  for (const tipo of [...TIPOS, "Outros"]) {
    const grupo = ordenados.filter((m) => (TIPOS.includes(tipoCanonico(m.tipo)) ? tipoCanonico(m.tipo) : "Outros") === tipo);
    if (!grupo.length) continue;
    escrever(`${tipo} (${grupo.length})`, { fonte: b, tam: 10, antes: 3 });
    grupo.forEach((m) => escrever(`  ${m.rotulo}`, { tam: 9 }));
  }
  for (const m of ordenados) {
    nova();
    escrever(m.rotulo, { fonte: b, tam: 12, depois: 2 });
    escrever(`Serventia: ${m.serventia || serventia} · Id no Projudi: ${m.id}`, { tam: 8, cor: rgb(0.35, 0.35, 0.35), depois: 8 });
    escrever(m.texto || "(modelo sem texto)", { tam: 10 });
  }
  doc.setTitle(`Modelos — ${serventia}`); doc.setProducer("Extensão Conclusões Projudi");
  return doc.save();
}

// Os nomes da serventia diferem entre o painel ("... - Vara de Família e Sucessões - GO") e a lista de modelos ("... - Vara de Família e Sucessões").
const chave = (s) => sem(s).replace(/\s*-\s*go\s*$/, "").replace(/\s+/g, " ").trim();
export function acharServentia(modelos, nome) {
  const k = chave(nome), todas = Object.entries(modelos?.serventias || {});
  return (todas.find(([n]) => chave(n) === k) || todas.find(([n]) => chave(n).includes(k) || k.includes(chave(n))) || [])[1] || null;
}
