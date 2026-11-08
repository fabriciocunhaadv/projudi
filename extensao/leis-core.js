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
export const HOSTS_TESTE = ["portal.stf.jus.br", "www.stj.jus.br", "www.cjf.jus.br", "www.tjgo.jus.br", "transparencia.tjgo.jus.br", "www.planalto.gov.br", "www.lexml.gov.br", "normas.leg.br", "www2.camara.leg.br", "legis.senado.leg.br", "goias.gov.br", "leis.org", "leisestaduais.com.br", "www.jusbrasil.com.br", "acessoainformacao.montesclarosdegoias.go.leg.br"];
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

// ----- Busca de fontes pendentes (leis que os autos citam e o Studio não tem): endereços prováveis do Planalto + listagens configuradas (estaduais e municipais) -----
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slugNome = (t) => semAcento(t).replace(/[^a-z0-9]+/g, " ").trim();
/** Faixas de legislatura nas pastas do Planalto (_atoAAAA-AAAA). */
const faixaDoAno = (a) => (a >= 2023 ? "2023-2026" : a >= 2019 ? "2019-2022" : a >= 2015 ? "2015-2018" : a >= 2011 ? "2011-2014" : a >= 2007 ? "2007-2010" : a >= 2004 ? "2004-2006" : "");
/** Endereços prováveis, no Planalto, do ato federal (o primeiro que responder com texto de lei vale). Sem garantia: o Planalto não tem padrão único para atos antigos. */
export function urlsFederais({ tipo, numero, ano }) {
  const n = String(numero || "").replace(/\D/g, ""), a = Number(ano) || 0, P = PREFIXO_PLANALTO, f = faixaDoAno(a), out = [];
  if (!n || !a) return out;
  const nPonto = n.length > 3 ? `${n.slice(0, -3)}.${n.slice(-3)}` : n;
  if (tipo === "lei") {
    if (f) out.push(`${P}_ato${f}/${a}/lei/l${n}.htm`, `${P}_ato${f}/${a}/lei/l${n}compilado.htm`);
    else if (a >= 2003) out.push(`${P}leis/${a}/l${n}.htm`, `${P}leis/${a}/l${nPonto}.htm`, `${P}leis/${a}/l${n}compilado.htm`);
    else if (a === 2002 || a === 2001) out.push(a === 2001 ? `${P}leis/leis_2001/l${n}.htm` : `${P}leis/2002/l${n}.htm`, `${P}leis/l${n}.htm`);
    else out.push(`${P}leis/l${n}.htm`, `${P}leis/l${n}compilado.htm`, `${P}leis/l${n}cons.htm`);
  } else if (tipo === "lei complementar") {
    out.push(f ? `${P}_ato${f}/${a}/lei/lcp/lcp${n}.htm` : `${P}leis/lcp/lcp${n}.htm`, `${P}leis/lcp/lcp${n}.htm`, `${P}leis/lcp/lcp${n}compilado.htm`);
  } else if (tipo === "decreto") {
    out.push(f ? `${P}_ato${f}/${a}/decreto/d${n}.htm` : `${P}decreto/d${n}.htm`, `${P}decreto/d${n}.htm`);
  } else if (tipo === "decreto-lei") {
    out.push(`${P}decreto-lei/del${n}.htm`, `${P}decreto-lei/del${n}compilado.htm`);
  } else if (tipo === "medida provisória") {
    out.push(`${P}_ato${f || "2019-2022"}/${a}/mpv/mpv${n}.htm`);
  } else if (tipo === "emenda constitucional") {
    out.push(`${P}constituicao/emendas/emc/emc${n}.htm`);
  }
  return [...new Set(out)].filter(urlPermitida);
}

/** A página parece conter o ato citado? Procura "Art. N" e o número (com ou sem ponto). */
export function paginaTemOAto(texto, { numero }) {
  const n = String(numero || "").replace(/\D/g, ""), nPonto = n.length > 3 ? `${n.slice(0, -3)}.${n.slice(-3)}` : n;
  const t = String(texto || "");
  return /(?:^|[\s>])Art\s*\.?\s*\d/i.test(t) && (!n || t.includes(nPonto) || t.includes(n));
}

const ANCORA = /<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const textoDe = (h) => semAcento(String(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ")).trim();
const absoluta = (href, base) => { try { return new URL(href.replace(/&amp;/g, "&"), base).href; } catch { return ""; } };
/** Em uma página de listagem, os links que parecem ser a lei procurada (número e ano no texto ou no endereço), do melhor para o pior, e o link de "próxima página". */
export function analisarListagem(html, baseUrl, { tipo, numero, ano }) {
  const n = String(numero || "").replace(/\D/g, ""), a4 = String(ano || ""), a2 = a4.slice(-2), nPonto = n.length > 3 ? `${n.slice(0, -3)}.${n.slice(-3)}` : n;
  const candidatos = [], proximas = [];
  let m; ANCORA.lastIndex = 0;
  const palavraTipo = { "lei": "lei", "lei complementar": "complementar", "decreto": "decreto", "decreto-lei": "decreto", "resolução": "resolucao", "portaria": "portaria" }[tipo] || "";
  while ((m = ANCORA.exec(String(html || "")))) {
    const url = absoluta(m[1], baseUrl); if (!url) continue;
    const t = textoDe(m[2]), h = semAcento(decodeURIComponent(m[1].replace(/%(?![0-9a-f]{2})/gi, "%25")));
    const jun = `${t} ${h}`;
    const temNum = new RegExp(`(?<![\\d.])(?:${n}|${nPonto.replace(/\./g, "\\.")})(?![\\d])`).test(jun), temAno = jun.includes(a4) || new RegExp(`[/-]${a2}(?!\\d)`).test(jun);
    if (temNum && temAno) candidatos.push({ url, texto: t.slice(0, 160), pontos: 2 + (palavraTipo && jun.includes(palavraTipo) ? 1 : 0) + (/\.pdf(\?|$)/i.test(url) ? 0 : 0) });
    else if (/^(proxim|seguinte|next|>|›|»)/.test(t) || /(?:^|\s)(?:proxima|next)(?:\s|$)/.test(t) || /rel\s*=\s*["']next["']/i.test(m[0])) proximas.push(url);
  }
  candidatos.sort((x, y) => y.pontos - x.pontos);
  return { candidatos, proxima: proximas[0] || "" };
}
/** Dentro da página de UMA lei, link para o arquivo PDF/inteiro teor (quando a página é só a ficha da lei). */
export function acharArquivoNaPagina(html, baseUrl) {
  let m; ANCORA.lastIndex = 0; const links = [];
  while ((m = ANCORA.exec(String(html || "")))) { const url = absoluta(m[1], baseUrl), t = textoDe(m[2]); if (url && (/\.pdf(\?|$)/i.test(url) || /(texto integral|inteiro teor|baixar|download|anexo|visualizar)/.test(t))) links.push(url); }
  return links[0] || "";
}
export const casaEnte = (a, b) => !a || !b || slugNome(a) === slugNome(b);
/** Quais sites de busca servem para a fonte (esfera e ente). Fonte federal/indefinida também tenta os sites estaduais e municipais. */
export function sitesParaFonte(item, fontesBusca) {
  const lista = (Array.isArray(fontesBusca) ? fontesBusca : []).filter((f) => f && f.ativa !== false && urlDeFontePermitida(f.url));
  if (item.esfera === "estadual" || item.esfera === "municipal") return lista.filter((f) => f.esfera === item.esfera && casaEnte(f.ente, item.ente));
  return item.esfera === "indefinida" ? lista : [];
}
export const urlDeFontePermitida = (u) => urlDeTestePermitida(u);
export function itensValidos(lista) {
  const out = [], vistos = new Set();
  for (const l of Array.isArray(lista) ? lista : []) {
    const id = String(l?.id || "").slice(0, 190); if (!id || vistos.has(id)) continue; vistos.add(id);
    out.push({ id, rotulo: String(l?.rotulo || id).slice(0, 160), tipo: String(l?.tipo || "lei").slice(0, 40), esfera: ["federal", "estadual", "municipal", "indefinida"].includes(l?.esfera) ? l.esfera : "indefinida", ente: String(l?.ente || "").slice(0, 80), numero: String(l?.numero || "").replace(/\D/g, "").slice(0, 8), ano: Number(l?.ano) || 0 });
    if (out.length >= MAX_LEIS) break;
  }
  return out;
}
export const origensDosSitesDeFonte = (itens, fontesBusca) => [...new Set([PREFIXO_PLANALTO, ...(Array.isArray(fontesBusca) ? fontesBusca : []).filter((f) => f && urlDeFontePermitida(f.url)).map((f) => f.url)].map((u) => new URL(u).origin + "/*"))];
