// Regras PURAS da busca de leis pela extensão (sem rede): o que pode ser baixado e como reconhecer a página de bloqueio do Planalto.
export const PREFIXO_PLANALTO = "https://www.planalto.gov.br/ccivil_03/";
export const ORIGENS_PLANALTO = ["https://www.planalto.gov.br/*", "https://planalto.gov.br/*"];
export const MAX_LEIS = 40, MAX_BYTES = 20 * 1024 * 1024;

/** Só endereços de leis do Planalto: a página do app não consegue mandar a extensão buscar outro lugar. */
export const urlPermitida = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" && String(u).startsWith(PREFIXO_PLANALTO) && !x.username && !x.password; } catch { return false; } };

/** Devolve null se a página parece uma lei de verdade, ou o motivo (texto curto) se for erro/bloqueio. Usa os bytes como latin1 só para procurar avisos. */
export function motivoDeRecusa(status, bytes) {
  if (status < 200 || status >= 300) return `o site respondeu HTTP ${status}`;
  if (!bytes || bytes.length < 800) return "página vazia ou pequena demais";
  if (bytes.length < 30000) {
    let t = ""; for (let i = 0; i < Math.min(bytes.length, 6000); i++) t += String.fromCharCode(bytes[i]);
    if (/Acesso Negado|bloqueio\.de\.aplicacoes|Attention Required|Just a moment|Enable JavaScript/i.test(t)) return "o Planalto bloqueou o acesso (página de “Acesso Negado”)";
  }
  return null;
}

/** Filtra o pedido recebido do app: só leis com id e endereço permitido, no máximo MAX_LEIS. */
export function leisValidas(lista) {
  const out = [], vistos = new Set();
  for (const l of Array.isArray(lista) ? lista : []) {
    const id = String(l?.id || "").slice(0, 80), url = String(l?.url || "");
    if (!id || vistos.has(id) || !urlPermitida(url)) continue;
    vistos.add(id); out.push({ id, nome: String(l?.nome || id).slice(0, 160), url });
    if (out.length >= MAX_LEIS) break;
  }
  return out;
}
export const nomeDoArquivo = (url) => decodeURIComponent(String(url).split("?")[0].split("/").pop() || "lei.htm");

// ----- Teste de acesso pelo navegador (Central de fontes): só estes sites oficiais, só GET, sem cookies -----
export const PROTOCOLO_TESTE = "https:";
export const HOSTS_TESTE = ["portal.stf.jus.br", "www.stj.jus.br", "www.cjf.jus.br", "www.tjgo.jus.br", "transparencia.tjgo.jus.br", "www.planalto.gov.br", "www.lexml.gov.br", "normas.leg.br", "www2.camara.leg.br", "legis.senado.leg.br", "goias.gov.br", "leis.org", "leisestaduais.com.br", "www.jusbrasil.com.br"];
export const urlDeTestePermitida = (u) => { try { const x = new URL(String(u)); return x.protocol === PROTOCOLO_TESTE && HOSTS_TESTE.includes(x.hostname) && !x.username && !x.password; } catch { return false; } };
export function sitesValidos(lista) {
  const out = [], vistos = new Set();
  for (const l of Array.isArray(lista) ? lista : []) {
    const id = String(l?.id || "").slice(0, 80), url = String(l?.url || "");
    if (!id || vistos.has(id) || !urlDeTestePermitida(url)) continue;
    vistos.add(id); out.push({ id, nome: String(l?.nome || id).slice(0, 160), url });
    if (out.length >= MAX_LEIS) break;
  }
  return out;
}
export const origensDosSites = (sites) => [...new Set(sites.map((s) => new URL(s.url).origin + "/*"))];

const ENTIDADES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificarEntidades = (t) => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => { if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; } return ENTIDADES[e.toLowerCase()] ?? m; });
const BLOQUEIO = /acesso negado|requisi[çc][ãa]o foi bloqueada|access denied|request blocked|captcha|forbidden|enable javascript|attention required|just a moment|cloudflare/i;
/** Resume a resposta de um site de teste: tipo, tamanho, amostra do texto e se é página de bloqueio. Mesma ideia do teste do servidor. */
export function analisarResposta({ status, bytes, contentType = "" }) {
  const tipo = String(contentType).split(";")[0].trim(), n = bytes ? bytes.length : 0;
  const ehPdf = /pdf/i.test(tipo) || (n > 5 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) === "%PDF-");
  if (ehPdf) return { status, tipo, bytes: n, amostra: "(arquivo PDF)" };
  let texto; try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes || new Uint8Array()); } catch { texto = new TextDecoder("windows-1252").decode(bytes || new Uint8Array()); }
  const linhas = decodificarEntidades(texto.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/?(p|div|tr|li|h[1-6]|table|center|blockquote|pre)\b[^>]*>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = { status, tipo, bytes: n, amostra: linhas.slice(0, 6).join(" | ").slice(0, 280), linhas: linhas.length };
  if ((BLOQUEIO.test(linhas.slice(0, 40).join(" ")) && linhas.length < 40) || status === 403) out.bloqueio = "BLOQUEADO: a página é um aviso de bloqueio (ou exige JavaScript), não o conteúdo.";
  return out;
}
