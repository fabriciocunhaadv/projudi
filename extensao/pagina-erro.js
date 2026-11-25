// Reconhece, pelo texto da aba, uma PÁGINA DE ERRO do servidor (Cloudflare 502/503/504, "Bad gateway", "Service Unavailable"…) ou de rede.
// Puro (sem chrome.*): usado pelo cliente do Agaia para parar de esperar e avisar na hora, e testado sozinho.
const ERROS = [
  [/Bad gateway|Gateway Time-?out|Service (?:Temporarily )?Unavailable|Internal Server Error|Web server is (?:down|returning an unknown error)|Origin (?:Web Server )?(?:is )?(?:Unreachable|Down)|Host\s+Error|temporariamente indispon[ií]vel/i, "o servidor do Agaia respondeu com erro"],
];

/** Texto (título + começo da página) → mensagem de erro, ou "" se a página parece normal. */
export function classificarPaginaDeErro(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").slice(0, 2500);
  if (!t) return "";
  const codigo = (/\b(?:error code|erro|HTTP)\s*:?\s*(50[0-4]|52\d|53\d)\b/i.exec(t) || /\b(50[0-4]|52\d)\b[^.]{0,40}(?:gateway|unavailable|timeout|time-out|error)/i.exec(t) || [])[1] || "";
  for (const [re, base] of ERROS) {
    const m = re.exec(t);
    if (m) return `O Agaia está fora do ar${codigo ? ` (erro ${codigo} – ${m[0]})` : ` (${m[0]})`}: ${base}. Tente de novo em alguns minutos, ou rode no Studio ou em outra IA.`;
  }
  if (codigo && /cloudflare/i.test(t)) return `O Agaia está fora do ar (erro ${codigo}, página do Cloudflare). Tente de novo em alguns minutos, ou rode no Studio ou em outra IA.`;
  return "";
}

/** Endereço de erro do próprio navegador (sem conexão, site não encontrado…). */
export const ehPaginaDeErroDoNavegador = (url) => String(url || "").startsWith("chrome-error://");
