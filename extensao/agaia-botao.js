// Botão "Enviar ao Agaia" ao lado do número do processo (tela do processo no Projudi).
// Envia só o número; a aba do ExecAgaia é aberta e preenchida por agaia-form.js (opções extras e prompt da serventia).
(() => {
  if (window.__projudiAgaiaBotao) return;
  const CNJ = /^\s*(\d{7})-(\d{2})\.(\d{4})\.8\.09\.\d{4}\s*$/;
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const chaveServ = (x) => sem(x).replace(/\s*-\s*go\s*$/, "");

  // Nó de texto com o número do processo (cabeçalho "AUTOS / Número") — só na tela de dados do processo.
  function achar() {
    if (!/DADOS DO PROCESSO|OUTRAS INFORMA/i.test(document.body?.textContent || "")) return null;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const m = n.nodeValue.match(CNJ);
      if (m && n.parentElement && !n.parentElement.closest("[data-projudi-ext]") && !/^(script|style)$/i.test(n.parentElement.tagName)) return { no: n, numero: `${m[1]}.${m[2]}.${m[3]}`, cnj: n.nodeValue.trim() };
    }
    return null;
  }
  const serventiaDaPagina = () => ((document.body.innerText || "").match(/Serventia\s*:?\s*([^\n]+?)\s*(?:\n|\s{2,}|Classe)/i) || [])[1] || "";

  async function promptPara(serv) {
    const { automacao = {} } = await chrome.storage.sync.get("automacao");
    const k = chaveServ(serv), chave = Object.keys(automacao).find((n) => chaveServ(n) === k) || Object.keys(automacao).find((n) => k && (chaveServ(n).includes(k) || k.includes(chaveServ(n))));
    const a = automacao[chave] || {};
    return a.promptAgaia || a.prompt || (globalThis.Sugestoes ? Sugestoes.prompt(serv) : "");
  }

  const vivo = () => { try { return !!(chrome.runtime && chrome.runtime.id && chrome.storage); } catch (e) { return false; } };
  async function enviar(b, alvo) {
    if (!vivo()) { b.textContent = "Extensão atualizada — recarregando…"; setTimeout(() => location.reload(), 600); return; }      // esta página ficou com uma cópia antiga da extensão
    const serv = serventiaDaPagina();
    b.disabled = true; b.textContent = "Abrindo…";
    try {
      const r = await chrome.runtime.sendMessage({ acao: "agaia-enviar", numero: alvo.numero, cnj: alvo.cnj, serventia: serv, prompt: await promptPara(serv) });
      b.textContent = r?.ok ? "✔ Enviado ao Agaia" : "✖ " + (r?.erro || "falhou");
    } catch (e) { b.textContent = "✖ " + e.message; }
    setTimeout(() => { b.disabled = false; b.textContent = "➜ Agaia"; }, 4000);
  }

  function ciclo() {
    if (!vivo()) { clearInterval(timer); document.querySelectorAll("[data-projudi-ext=agaia]").forEach((e) => { e.textContent = "↻ Atualizar página"; e.title = "A extensão foi atualizada: clique para recarregar esta página"; e.onclick = () => location.reload(); }); return; }
    const alvo = achar();
    if (!alvo) return;
    const serv = serventiaDaPagina();
    if (serv && vivo()) chrome.storage.local.set({ processo_atual: { cnj: alvo.cnj, serventia: serv, ts: Date.now() } }).catch(() => {});      // a janela “Gerar PDF” usa isto para escolher o prompt
    const pai = alvo.no.parentElement;
    if (pai.parentElement.querySelector("[data-projudi-ext=agaia]")) return;
    const b = document.createElement("button");
    b.setAttribute("data-projudi-ext", "agaia"); b.type = "button"; b.textContent = "➜ Agaia";
    b.title = "Enviar este processo ao ExecAgaia (só o número; a extensão marca as opções e o prompt da serventia)";
    b.style.cssText = "margin-left:6px;padding:1px 7px;font:11px system-ui,sans-serif;border:1px solid #0b5cad;background:#0b5cad;color:#fff;border-radius:4px;cursor:pointer;vertical-align:middle";
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); enviar(b, alvo); });
    pai.after(b);
  }
  window.__projudiAgaiaBotao = true;
  ciclo(); const timer = setInterval(ciclo, 1500);
})();
