// Lê a lista de audiências do Projudi a pedido do Studio (botão "Trazer audiências do Projudi"). Roda numa aba escondida da extensão (precisa de DOM para o parser)
// e devolve o resultado pelo storage ("pauta_res_<id>"); o studio-base entrega ao Studio. A aba fecha sozinha.
const BASE = "https://projudi.tjgo.jus.br/";
const id = new URLSearchParams(location.search).get("id") || "";

function decodificar(buf, tipo) {
  const cs = (/charset=([\w-]+)/i.exec(tipo || "") || [])[1];
  if (cs) { try { return new TextDecoder(cs).decode(buf); } catch { /* charset desconhecido */ } }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); }
}
/** Só endereços do próprio Projudi (o pedido vem de uma página; nunca busca em outro site). */
const urlDoProjudi = (u) => { const x = new URL(u, BASE); if (x.origin !== new URL(BASE).origin) throw new Error("endereço fora do Projudi"); return x.href; };
const buscar = async (u) => { const r = await fetch(urlDoProjudi(u), { credentials: "include" }); if (!r.ok) throw new Error("HTTP " + r.status); return decodificar(await r.arrayBuffer(), r.headers.get("content-type")); };

async function serventias() {
  const r = window.ProjudiParser.parseLista(await buscar("Usuario?PaginaAtual=9"));
  if (r.logado === false) throw new Error("Sessão do Projudi não encontrada: entre no Projudi e tente de novo.");
  return r.itens.map((s) => ({ serventia: s.serventia, perfil: s.perfil, href: s.href }));
}

async function lerLista({ serventiaHref, serventiaNome, tipo, fluxo }) {
  if (serventiaHref) await buscar(serventiaHref);      // "entra" na serventia escolhida
  const url = `Audiencia?PaginaAtual=2&AudienciaTipoCodigo=${encodeURIComponent(tipo || "")}&fluxo=${encodeURIComponent(fluxo || 2)}`;
  const vistos = new Set([url]), fila = [url], todas = [];
  while (fila.length && vistos.size < 60) {
    const u = fila.shift();
    const r = window.ProjudiParser.parseAudiencias(await buscar(u));
    if (!r.logado) throw new Error("Sessão do Projudi não encontrada: entre no Projudi e escolha a serventia.");
    if (r.linhas === null) throw new Error("Não achei a tabela de audiências. Confira se a serventia está selecionada no Projudi.");
    todas.push(...r.linhas.map((l) => ({ ...l, serventiaUrl: serventiaHref || "", serventiaNome: serventiaNome || l.serventia })));
    r.paginas.filter((p) => /^\d+$/.test(p.texto)).forEach((p) => { if (!vistos.has(p.href)) { vistos.add(p.href); fila.push(p.href); } });
  }
  return todas;
}

(async () => {
  const chave = "pauta_req_" + id;
  const req = (await chrome.storage.local.get(chave))[chave];
  let res;
  try {
    if (!req) throw new Error("pedido não encontrado");
    document.getElementById("status").textContent = req.fase === "serventias" ? "Lendo as serventias…" : "Lendo a lista de audiências…";
    res = req.fase === "serventias" ? { ok: true, serventias: await serventias() } : { ok: true, linhas: await lerLista(req) };
  } catch (e) { res = { ok: false, erro: String(e?.message || e) }; }
  await chrome.storage.local.set({ ["pauta_res_" + id]: { ...res, em: Date.now() } });
  await chrome.storage.local.remove(chave);
  try { await chrome.runtime.sendMessage({ acao: "fechar-minha-aba" }); } catch { /* a aba fica aberta, sem problema */ }
})();
