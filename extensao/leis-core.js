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
