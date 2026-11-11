// Vídeos/áudios da audiência dentro do processo do Projudi (movimentação "Mídia Publicada…"): acha os links na tabela de movimentações da aba do processo, baixa pela própria extensão
// (com a sessão do usuário) e guarda no navegador (IndexedDB) para a esteira entregar ao Studio. Nada sai do computador do usuário por este módulo.
import { guardarMidia, apagarMidias } from "./esteira-banco.js";

export const EXT_MIDIA = /\.(mp4|m4v|webm|mkv|mov|avi|wmv|3gp|mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i;
const MIMES = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", avi: "video/x-msvideo", wmv: "video/x-ms-wmv", "3gp": "video/3gpp", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", aac: "audio/aac", flac: "audio/flac" };
export const mimeDe = (nome, ct = "") => (/^(video|audio)\//i.test(ct) ? ct.split(";")[0].toLowerCase() : MIMES[(String(nome).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase()] || "video/mp4");
export const chaveDoProcesso = (p) => String(p || "").replace(/\D/g, "");

/** Roda na aba do processo (todas as molduras): abre as movimentações de mídia/audiência que ainda não foram abertas e devolve os links de vídeo/áudio. */
export async function listarMidiasNaAba(tabId) {
  const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: async () => {
    const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const linhas = [...document.querySelectorAll("#tabListaProcesso tr[movi_codigo]")];
    if (!linhas.length) return null;
    const EXT = /\.(mp4|m4v|webm|mkv|mov|avi|wmv|3gp|mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i, out = [];
    const colher = (tr, n, tipo) => {
      const filha = tr.nextElementSibling; if (!filha) return 0; let c = 0;
      filha.querySelectorAll("a[href]").forEach((a) => { const nome = (a.textContent || "").trim(); if (EXT.test(nome) && !out.some((o) => o.url === a.href)) { out.push({ nome, url: a.href, mov: n, tipo }); c++; } });
      return c;
    };
    for (const tr of linhas) {
      const tipo = (tr.querySelector(".filtro_tipo_movimentacao")?.textContent || "").trim(), n = parseInt(tr.children[0]?.textContent, 10), texto = (tr.children[1]?.textContent || "");
      if (!/m[ií]dia|grava[cç][aã]o|audi[eê]ncia/i.test(texto)) continue;
      if (colher(tr, n, tipo)) continue;      // já estava aberta
      const ancora = tr.children[4]?.querySelector('a[href*="buscarArquivosMovimentacaoJSON"]'); if (!ancora) continue;
      ancora.click();
      for (let k = 0; k < 40; k++) { await dorme(250); if (colher(tr, n, tipo)) break; }
    }
    return out;
  } }).catch(() => []);
  return (r || []).flatMap((x) => x.result || []);
}

const latin1 = (b) => { let s = ""; for (const x of b.subarray(0, 1024)) s += String.fromCharCode(x); return s; };
const pareceMidia = (b) => (b.length > 12 && latin1(b).slice(4, 8) === "ftyp") || (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) || latin1(b).startsWith("ID3") || latin1(b).startsWith("OggS") || latin1(b).startsWith("RIFF");
/** Baixa uma mídia: aceita o arquivo direto ou a página "moldura" do Projudi que só embute o player (segue o <video>/<source>/<iframe>). */
export async function baixarMidia(url, saltos = 0) {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (/^(video|audio)\//i.test(ct) || pareceMidia(bytes)) return { bytes, ct };
  if (saltos < 3 && (/html/i.test(ct) || latin1(bytes).trimStart().startsWith("<"))) {
    const d = new DOMParser().parseFromString(new TextDecoder("windows-1252").decode(bytes), "text/html");
    const el = d.querySelector("video[src],source[src],audio[src],iframe[src],embed[src],object[data]"), src = el && (el.getAttribute("src") || el.getAttribute("data"));
    if (src && !/^(about:|javascript:)/i.test(src)) return baixarMidia(new URL(src, url).href, saltos + 1);
  }
  throw new Error("o Projudi devolveu algo que não é vídeo/áudio");
}

/** Acha e baixa os vídeos/áudios da audiência do processo aberto na aba. Devolve [{ nome, tipo, tamanho }] (os bytes ficam no IndexedDB). Lança erro claro se não houver. */
export async function coletarMidiasDoProcesso(tabId, processo, passo = () => {}) {
  passo("procurando os vídeos da audiência nas movimentações");
  const achadas = await listarMidiasNaAba(tabId);
  if (!achadas.length) throw Object.assign(new Error("não achei vídeo ou áudio de audiência neste processo (procurei nas movimentações “Mídia Publicada”/audiência). Use a esteira principal para sentenciar sem vídeo."), { semRetry: true });
  const chave = chaveDoProcesso(processo); await apagarMidias(chave);
  const meta = [];
  for (let i = 0; i < achadas.length; i++) {
    const a = achadas[i]; passo(`baixando o vídeo ${i + 1} de ${achadas.length}: ${a.nome}`);
    const { bytes, ct } = await baixarMidia(a.url);
    await guardarMidia(chave, i, bytes);
    meta.push({ nome: a.nome, tipo: mimeDe(a.nome, ct), tamanho: bytes.length, mov: a.mov });
  }
  await chrome.storage.local.set({ ["midias_" + chave]: { meta, em: Date.now() } });
  return meta;
}
