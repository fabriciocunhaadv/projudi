// Página da extensão que busca as leis do Planalto no navegador do Super Admin e as entrega ao app (Central de fontes oficiais).
import { ORIGENS_PLANALTO, MAX_BYTES, leisValidas, motivoDeRecusa, nomeDoArquivo, sitesValidos, origensDosSites, analisarResposta, urlsFederais, paginaTemOAto, analisarListagem, acharArquivoNaPagina, sitesParaFonte, itensValidos, origensDosSitesDeFonte, urlDeFontePermitida } from "./leis-core.js";
import { reportarSaude, instalarSaude } from "./saude-fila.js";
instalarSaude("leis");
const $ = (id) => document.getElementById(id), dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const b64De = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

const { leisJob } = await chrome.storage.local.get("leisJob");
const modoTeste = leisJob?.modo === "teste", modoFonte = leisJob?.modo === "fonte", fontesBusca = Array.isArray(leisJob?.fontesBusca) ? leisJob.fontesBusca : [];
const leis = modoTeste ? sitesValidos(leisJob?.leis) : modoFonte ? itensValidos(leisJob?.leis).map((i) => ({ ...i, nome: i.rotulo })) : leisValidas(leisJob?.leis), tabId = leisJob?.tabId, pedidoId = leisJob?.pedidoId;
const linhas = new Map();
for (const l of leis) { const li = document.createElement("li"); li.innerHTML = `<span class="espera">•</span><span></span>`; li.lastChild.textContent = l.nome; $("lista").append(li); linhas.set(l.id, li); }
const marca = (id, classe, texto) => { const li = linhas.get(id); li.firstChild.className = classe; li.firstChild.textContent = classe === "ok" ? "✔" : classe === "erro" ? "✖" : "…"; li.lastChild.textContent = li.lastChild.textContent.split(" — ")[0] + (texto ? " — " + texto : ""); };
if (!leis.length || tabId == null) { $("resumo").textContent = "Nenhuma lei válida para buscar. Volte ao Studio e peça de novo."; $("iniciar").disabled = true; }
else $("permissao").textContent = modoFonte ? `${leis.length} fonte(s) serão procuradas no Planalto e nos sites de leis estaduais e municipais configurados (só leitura, sem cookies), com pausa entre os pedidos.` : modoTeste ? `${leis.length} site(s) oficiais serão abertos (só leitura, sem cookies) para ver o que o seu navegador alcança.` : `${leis.length} lei(s) serão buscadas, com uma pausa entre elas.`;
if (modoFonte) { document.querySelector("h1").textContent = "Buscar as fontes pendentes pelo seu navegador"; $("iniciar").textContent = "Permitir acesso e buscar"; }
if (modoTeste) { document.querySelector("h1").textContent = "Testar o acesso aos sites oficiais pelo seu navegador"; $("iniciar").textContent = "Permitir acesso e testar"; }

const enviar = (msg) => chrome.tabs.sendMessage(tabId, msg);

// ---------- fontes pendentes: procura o ato no Planalto (endereços prováveis) e nas listagens configuradas, e entrega o arquivo ao Studio ----------
const decodificar = (bytes) => { if (bytes.length > 1 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return new TextDecoder("utf-16").decode(bytes); try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); } };
async function baixar(url) {
  if (!urlDeFontePermitida(url)) return { status: 0, erro: "endereço fora dos sites permitidos" };
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
  try { const r = await fetch(url, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal }); const bytes = new Uint8Array(await r.arrayBuffer()); return { status: r.status, bytes, contentType: r.headers.get("content-type") || "", url: r.url || url }; }
  catch (e) { return { status: 0, erro: e?.name === "AbortError" ? "tempo esgotado" : String(e?.message || e).slice(0, 100) }; } finally { clearTimeout(to); }
}
const ehPdf = (r) => /pdf/i.test(r.contentType || "") || (r.bytes && r.bytes.length > 5 && String.fromCharCode(...r.bytes.subarray(0, 5)) === "%PDF-");
async function percorrerSite(site, item, tentativas) {
  const vistas = new Set(); let pagina = site.url, n = 0;
  while (pagina && n < 12 && !vistas.has(pagina)) {
    vistas.add(pagina); n++;
    const r = await baixar(pagina); await dorme(500);
    if (!r.bytes || r.status < 200 || r.status >= 300) { tentativas.push(`${pagina} → ${r.erro || "HTTP " + r.status}`); break; }
    const html = decodificar(r.bytes), { candidatos, proxima } = analisarListagem(html, r.url || pagina, item);
    for (const c of candidatos.slice(0, 3)) {
      const d = await baixar(c.url); await dorme(500);
      if (!d.bytes || d.status < 200 || d.status >= 300) { tentativas.push(`${c.url} → ${d.erro || "HTTP " + d.status}`); continue; }
      if (ehPdf(d)) return { ok: true, bytes: d.bytes, contentType: "application/pdf", url: d.url };
      const t = decodificar(d.bytes);
      if (paginaTemOAto(t, item)) return { ok: true, bytes: d.bytes, contentType: d.contentType || "text/html", url: d.url };
      const arq = acharArquivoNaPagina(t, d.url);      // a página é só a ficha da lei: procura o texto integral (PDF) nela
      if (arq) { const e = await baixar(arq); await dorme(500); if (e.bytes && e.status >= 200 && e.status < 300) { if (ehPdf(e)) return { ok: true, bytes: e.bytes, contentType: "application/pdf", url: e.url }; const te = decodificar(e.bytes); if (paginaTemOAto(te, item)) return { ok: true, bytes: e.bytes, contentType: e.contentType || "text/html", url: e.url }; } tentativas.push(`${arq} → não é o texto da lei`); }
      else tentativas.push(`${c.url} → a página não traz o texto da lei`);
    }
    pagina = proxima && new URL(proxima).origin === new URL(site.url).origin ? proxima : "";
  }
  if (!tentativas.some((x) => x.startsWith(site.url))) tentativas.push(`${site.nome || site.url}: ${n} página(s) de listagem consultada(s), sem o ato`);
  return { ok: false };
}
async function buscarFonte(item) {
  const tentativas = [];
  if (item.esfera === "federal" || item.esfera === "indefinida") {
    for (const url of urlsFederais(item)) {
      const r = await baixar(url); await dorme(700);
      if (r.bytes && r.status >= 200 && r.status < 300 && !motivoDeRecusa(r.status, r.bytes) && paginaTemOAto(decodificar(r.bytes), item)) return { ok: true, bytes: r.bytes, contentType: r.contentType || "text/html", url: r.url };
      tentativas.push(`${url} → ${r.erro || "HTTP " + r.status}`);
    }
  }
  for (const site of sitesParaFonte(item, fontesBusca)) { const r = await percorrerSite(site, item, tentativas); if (r.ok) return r; }
  return { ok: false, motivo: item.esfera === "federal" && !urlsFederais(item).length ? "não há endereço previsível para este tipo de ato: envie o arquivo ou informe o link" : tentativas.length ? "não encontrei o texto da lei nos sites consultados" : "nenhum site de busca configurado para esta esfera/município", tentativas: tentativas.slice(-6) };
}
async function rodarFonte() {
  const origens = origensDosSitesDeFonte(leis, fontesBusca);
  try { if (!(await chrome.permissions.contains({ origins: origens })) && !(await chrome.permissions.request({ origins: origens }))) { $("resumo").textContent = "Sem a permissão, não dá para buscar. Clique de novo e escolha “Permitir”."; $("iniciar").disabled = false; return; } }
  catch (e) { $("resumo").textContent = "Não consegui pedir a permissão: " + (e?.message || e); $("iniciar").disabled = false; return; }
  let ok = 0, falhas = 0;
  for (const l of leis) {
    marca(l.id, "espera", "procurando…");
    let r; try { r = await buscarFonte(l); } catch (e) { r = { ok: false, motivo: "erro: " + (e?.message || e), tentativas: [] }; }
    if (r.ok) {
      try { const resp = await enviar({ acao: "studio-fonte-entrega", pedidoId, id: l.id, nome: nomeDoArquivo(r.url), b64: b64De(r.bytes), contentType: r.contentType, url: r.url }); if (!resp?.ok) throw new Error(resp?.erro || "o Studio não recebeu"); ok++; marca(l.id, "ok", `encontrada e entregue ao Studio (${Math.round(r.bytes.length / 1024)} KB)`); }
      catch (e) { falhas++; marca(l.id, "erro", "não consegui entregar ao Studio: " + (e?.message || e)); }
    } else {
      falhas++; marca(l.id, "erro", r.motivo);
      try { await enviar({ acao: "studio-fonte-entrega", pedidoId, id: l.id, erro: r.motivo, tentativas: r.tentativas }); } catch (e) { /* aba fechada */ }
    }
    await dorme(500);
  }
  $("resumo").textContent = `Pronto: ${ok} encontrada(s) e entregue(s) ao Studio, ${falhas} sem resultado.`;
  try { await enviar({ acao: "studio-leis-fim", pedidoId, modo: "fonte", feitas: ok, falhas, bloqueios: 0 }); } catch (e) { /* aba fechada */ }
  await chrome.storage.local.remove("leisJob");
  if (ok > 0 && falhas === 0) { try { await chrome.tabs.update(tabId, { active: true }); } catch (e) { /* ignora */ } setTimeout(() => window.close(), 3000); }
}

async function rodarTeste() {
  const origens = origensDosSites(leis);
  try { if (!(await chrome.permissions.contains({ origins: origens })) && !(await chrome.permissions.request({ origins: origens }))) { $("resumo").textContent = "Sem a permissão, não dá para testar. Clique de novo e escolha “Permitir”."; $("iniciar").disabled = false; return; } }
  catch (e) { $("resumo").textContent = "Não consegui pedir a permissão: " + (e?.message || e); $("iniciar").disabled = false; return; }
  let ok = 0, ruins = 0;
  for (const l of leis) {
    marca(l.id, "espera", "abrindo…");
    const t0 = Date.now(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000); let res;
    try {
      const r = await fetch(l.url, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal });
      const bytes = new Uint8Array(await r.arrayBuffer());
      res = { id: l.id, ...analisarResposta({ status: r.status, bytes: bytes.subarray(0, 600000), contentType: r.headers.get("content-type") || "" }), bytes: bytes.length, ms: Date.now() - t0, urlFinal: r.url && r.url !== l.url ? r.url : undefined };
    } catch (e) { res = { id: l.id, status: 0, ms: Date.now() - t0, erro: e?.name === "AbortError" ? "tempo esgotado (20 s)" : String(e?.message || e).slice(0, 160) }; }
    clearTimeout(to);
    const bom = res.status >= 200 && res.status < 300 && !res.bloqueio && !res.erro;
    if (bom) ok++; else ruins++;
    marca(l.id, bom ? "ok" : "erro", res.erro || res.bloqueio || `HTTP ${res.status} · ${res.ms} ms`);
    try { await enviar({ acao: "studio-teste-entrega", pedidoId, resultado: res }); } catch (e) { /* aba fechada */ }
    await dorme(400);
  }
  $("resumo").textContent = `Pronto: ${ok} site(s) abrem no seu navegador, ${ruins} com problema.`;
  try { await enviar({ acao: "studio-leis-fim", pedidoId, modo: "teste", feitas: ok, falhas: ruins, bloqueios: 0 }); } catch (e) { /* aba fechada */ }
  await chrome.storage.local.remove("leisJob");
  try { await chrome.tabs.update(tabId, { active: true }); } catch (e) { /* ignora */ } setTimeout(() => window.close(), 3000);
}

$("iniciar").onclick = async () => {
  $("iniciar").disabled = true;
  if (modoFonte) return rodarFonte();
  if (modoTeste) return rodarTeste();
  try {
    if (!(await chrome.permissions.contains({ origins: ORIGENS_PLANALTO })) && !(await chrome.permissions.request({ origins: ORIGENS_PLANALTO }))) { $("resumo").textContent = "Sem a permissão, não dá para buscar. Clique de novo e escolha “Permitir”."; $("iniciar").disabled = false; return; }
  } catch (e) { $("resumo").textContent = "Não consegui pedir a permissão: " + (e?.message || e); $("iniciar").disabled = false; return; }
  let feitas = 0, falhas = 0, bloqueios = 0, seguidosBloqueio = 0;
  for (const l of leis) {
    marca(l.id, "espera", "buscando…");
    let motivo = null, bytes = null;
    try {
      const r = await fetch(l.url, { credentials: "omit", cache: "no-store", redirect: "follow" });
      bytes = new Uint8Array(await r.arrayBuffer());
      motivo = motivoDeRecusa(r.status, bytes);
      if (!motivo && bytes.length > MAX_BYTES) motivo = "arquivo grande demais";
    } catch (e) { motivo = "falha de rede: " + (e?.message || e); }
    if (motivo) {
      falhas++; marca(l.id, "erro", motivo);
      if (/bloqueou/i.test(motivo)) { bloqueios++; seguidosBloqueio++; } else seguidosBloqueio = 0;
      if (seguidosBloqueio >= 3) { $("resumo").textContent = "O Planalto está bloqueando também o seu navegador. Parei para não insistir; use o envio dos arquivos salvos."; void reportarSaude("leis", "aviso", "Planalto bloqueou a busca pelo navegador (3 seguidas)"); break; }
    } else {
      try {
        const r = await enviar({ acao: "studio-lei-entrega", pedidoId, id: l.id, nome: nomeDoArquivo(l.url), b64: b64De(bytes) });
        if (!r?.ok) throw new Error(r?.erro || "o Studio não recebeu");
        feitas++; seguidosBloqueio = 0; marca(l.id, "ok", `entregue ao Studio (${Math.round(bytes.length / 1024)} KB)`);
      } catch (e) { falhas++; marca(l.id, "erro", "não consegui entregar ao Studio: " + (e?.message || e)); if (/Receiving end|Could not establish|No tab/i.test(String(e?.message || e))) { $("resumo").textContent = "A aba do Studio foi fechada. Abra o Studio e peça de novo."; break; } }
    }
    await dorme(1200);
  }
  if (!$("resumo").textContent) $("resumo").textContent = `Pronto: ${feitas} entregue(s) ao Studio, ${falhas} com problema.`;
  try { await enviar({ acao: "studio-leis-fim", pedidoId, feitas, falhas, bloqueios }); } catch (e) { /* aba fechada */ }
  await chrome.storage.local.remove("leisJob");
  if (feitas > 0 && falhas === 0) { try { await chrome.tabs.update(tabId, { active: true }); } catch (e) { /* ignora */ } setTimeout(() => window.close(), 3000); }
};
