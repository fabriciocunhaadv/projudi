// Studio → Agaia: troca o texto de um prompt do Agaia (achado pelo TÍTULO) pelo prompt do Studio, guardando antes uma cópia do texto antigo.
// Carregado no background.js (importScripts). Um pedido por vez (fila por trava), na aba do Agaia que o usuário já tem aberta.
const AGAIA_PROMPTS_LISTA = "https://simplesefacil.tjgo.jus.br/agaia/prompts/lista";
const AGAIA_LINHA_FINAL = "Texto fornecido: {}";
const AGAIA_BACKUPS_MAX = 60;

/** O texto novo = prompt do Studio, sem repetir a linha final, e SEMPRE terminando em “Texto fornecido: {}”. */
function agaiaComporPrompt(texto) {
  const corpo = String(texto || "").replace(/\r\n?/g, "\n").split("\n").filter((l) => !/^\s*Texto fornecido:\s*\{\s*\}\s*$/i.test(l)).join("\n").replace(/\s+$/, "");
  return (corpo ? corpo + "\n\n" : "") + AGAIA_LINHA_FINAL;
}

const agaiaDorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
function agaiaAbaCarregou(tabId, ms = 60000) {
  return new Promise((ok) => {
    const f = (id, i) => { if (id === tabId && i.status === "complete") { chrome.tabs.onUpdated.removeListener(f); clearTimeout(t); ok(true); } };
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(f); ok(false); }, ms);
    chrome.tabs.onUpdated.addListener(f);
  });
}
async function agaiaAbrir(tabId, url) {
  const espera = agaiaAbaCarregou(tabId);
  await chrome.tabs.update(tabId, { url, active: false });
  await espera;
  for (let i = 0; i < 40; i++) {
    try { const r = await chrome.tabs.sendMessage(tabId, { acao: "agaia-prompt-ping" }); if (r?.ok) return true; } catch (e) { /* a página ainda carrega */ }
    if (i === 3) { try { await chrome.scripting.executeScript({ target: { tabId }, files: ["agaia-prompt.js"] }); } catch (e) { /* sem permissão: segue esperando */ } }
    await agaiaDorme(700);
  }
  return false;
}
async function agaiaAbaDoAgaia() {
  const abertas = await chrome.tabs.query({ url: "https://simplesefacil.tjgo.jus.br/agaia/*" }).catch(() => []);
  const a = abertas.find((t) => !t.pinned) || abertas[0];
  if (a) return a;
  return chrome.tabs.create({ url: AGAIA_PROMPTS_LISTA, active: false });
}

async function agaiaGuardarBackup(b) {
  const { agaia_prompt_backups = [] } = await chrome.storage.local.get("agaia_prompt_backups");
  agaia_prompt_backups.unshift(b);
  await chrome.storage.local.set({ agaia_prompt_backups: agaia_prompt_backups.slice(0, AGAIA_BACKUPS_MAX) });
}

/** pedido = { titulo, texto }  (Studio)  ou  { titulo, texto, html, restaurar:true }  (voltar uma cópia). */
function agaiaPromptSubstituir(pedido) {
  return navigator.locks.request("agaia-prompt", async () => {
    const titulo = String(pedido.titulo || "").trim();
    if (!titulo) return { ok: false, erro: "o prompt do Studio está sem título" };
    const novoTexto = pedido.restaurar ? String(pedido.texto || "") : agaiaComporPrompt(pedido.texto);
    if (!pedido.restaurar && !String(pedido.texto || "").trim()) return { ok: false, erro: "o prompt do Studio está vazio" };
    const aba = await agaiaAbaDoAgaia();
    try {
      if (!(await agaiaAbrir(aba.id, AGAIA_PROMPTS_LISTA))) return { ok: false, erro: "a lista de prompts do Agaia não abriu (confira se você está logado no Agaia)" };
      const a = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-achar", titulo });
      if (!a?.ok) return { ok: false, naoEncontrado: !!a?.naoEncontrado, erro: a?.erro || "não achei o prompt no Agaia" };
      if (!(await agaiaAbrir(aba.id, a.href))) return { ok: false, erro: "a página de edição do prompt não abriu" };
      const atual = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-ler" });
      if (!atual?.ok) return { ok: false, erro: atual?.erro || "não consegui ler o prompt atual do Agaia" };
      if (!atual.salvarOk) return { ok: false, erro: "não achei o botão Salvar na página de edição do Agaia" };
      const sn = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (atual.titulo && a.tituloAgaia && sn(atual.titulo) !== sn(a.tituloAgaia)) return { ok: false, erro: `a página de edição mostra o título “${atual.titulo}”, diferente do da lista (“${a.tituloAgaia}”); não troquei nada` };
      // cópia de segurança ANTES de trocar
      const backup = { id: "b" + Date.now(), titulo, tituloAgaia: a.tituloAgaia || "", agaiaId: a.id || "", unidade: a.unidade || "", texto: atual.texto || "", html: atual.html || "", tipo: atual.tipo, em: Date.now(), origem: pedido.restaurar ? "antes-de-restaurar" : "antes-de-enviar" };
      if (!pedido.restaurar) await agaiaGuardarBackup(backup);      // devolver uma cópia NÃO cria outra cópia
      const g = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-gravar", texto: novoTexto, html: null });
      if (!g?.ok) return { ok: false, erro: g?.erro || "o Agaia não aceitou o texto", backupId: pedido.restaurar ? "" : backup.id };
      await agaiaDorme(800);
      await agaiaAbaCarregou(aba.id, 20000);
      // confere: abre de novo a página de edição e compara com o que foi enviado
      if (!(await agaiaAbrir(aba.id, a.href))) return { ok: false, erro: "salvei, mas não consegui reabrir a página para conferir", backupId: backup.id };
      const depois = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-ler" });
      const n = (s) => String(s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
      if (!depois?.ok || n(depois.texto) !== n(novoTexto)) {
        // o Agaia gravou diferente do enviado (ex.: engoliu as marcas < >): devolve o texto antigo para não deixar o prompt estragado
        let voltou = false;
        if (!pedido.restaurar) { try { const g2 = await chrome.tabs.sendMessage(aba.id, { acao: "agaia-prompt-gravar", texto: backup.texto, html: null }); if (g2?.ok) { await agaiaDorme(800); await agaiaAbaCarregou(aba.id, 20000); voltou = true; } } catch (e) { /* segue */ } }
        await agaiaAbrir(aba.id, AGAIA_PROMPTS_LISTA).catch(() => {});
        return { ok: false, erro: "o Agaia não guardou o texto como enviado (conferi depois de Salvar: ele alterou o texto, por exemplo as marcas < >). " + (voltou ? "Devolvi o texto antigo ao prompt; nada foi perdido." : "O texto antigo está na cópia de segurança (devolva por lá)."), backupId: backup.id, alterado: true };
      }
      await agaiaAbrir(aba.id, AGAIA_PROMPTS_LISTA).catch(() => {});      // volta à lista, pronta para o próximo
      return { ok: true, backupId: backup.id, agaiaId: a.id || "", tituloAgaia: a.tituloAgaia || "", caracteres: novoTexto.length };
    } catch (e) {
      return { ok: false, erro: "falha da extensão no Agaia: " + String(e?.message || e) };
    }
  });
}
