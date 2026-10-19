// Chave estável do processo: o Projudi mostra o número SEM os zeros à esquerda ("57388.42" em vez de "0057388-42"). A chave completa os 7 dígitos e junta o DV.
export function chaveProc(s) {
  const t = String(s || ""), m = t.match(/(\d{1,7})[.\-](\d{1,2})(?!\d)/);
  return m ? m[1].padStart(7, "0") + m[2].padStart(2, "0") : t.replace(/\D/g, "").slice(0, 9);
}
export const padProc = (s) => String(s || "").replace(/^(\d{1,7})([.\-])(\d{1,2})(?!\d)/, (m, a, sep, dv) => a.padStart(7, "0") + sep + dv.padStart(2, "0"));
