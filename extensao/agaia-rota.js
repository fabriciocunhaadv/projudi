// ExecAgaia, caminho até a execução do prompt (como o usuário faz à mão):
//   início → "Gestão e Execução de Processos" → "Meus Processos Judiciais" → "Unidade do Projudi" (a da serventia/prompt)
//   → aba "Classificador" → botão "IR" do processo na lista → tela de execução do prompt.
// Na tela de execução, agaia-form.js faz as marcações de sempre. O pedido (agaia_pedido) vem do botão "➜ Agaia" do Projudi.
// Cada etapa se reconhece pelo CONTEÚDO da página (não pela URL), e o pedido guarda por onde já passou; se algo falhar, a tela diz qual etapa e oferece o atalho direto.
(() => {
  if (window.__projudiAgaiaRota) return;
  window.__projudiAgaiaRota = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/civel/g, "civil");
  const semGo = (s) => sem(s).replace(/\s*-\s*go\s*$/, "");
  const digitos = (s) => String(s || "").replace(/\D/g, "");
  async function esperar(fn, ms) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(250); } }
  const visivel = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  async function pegar() { const { agaia_pedido: p } = await chrome.storage.local.get("agaia_pedido"); return p && p.rota && Date.now() - p.ts < 10 * 60000 ? p : null; }
  async function guardar(p, extra) { Object.assign(p, extra, { ts: Date.now() }); await chrome.storage.local.set({ agaia_pedido: p }); }

  function aviso(txt, ok, linkDireto) {
    document.querySelectorAll("[data-projudi-ext=agaia-rota]").forEach((e) => e.remove());
    const d = document.createElement("div");
    d.setAttribute("data-projudi-ext", "agaia-rota");
    d.style.cssText = `position:fixed;right:12px;bottom:60px;z-index:2147483647;max-width:380px;padding:8px 12px;border-radius:6px;font:13px system-ui;color:#fff;background:${ok ? "#0b5cad" : "#b3541e"};box-shadow:0 2px 8px #0005`;
    d.textContent = txt;
    if (linkDireto) { const a = document.createElement("a"); a.href = linkDireto; a.textContent = " Abrir direto o processo"; a.style.cssText = "color:#fff;font-weight:bold;text-decoration:underline"; d.append(a); }
    document.body.append(d); if (ok) setTimeout(() => d.remove(), 9000);
  }
  const direto = (p) => "https://simplesefacil.tjgo.jus.br/agaia/prompts/moderno?numero_processo=" + encodeURIComponent(p.numero) + "&tipo_processo=judicial&acao_id=6&validado=True";
  function falhar(p, etapa, detalhe) {
    document.documentElement.dataset.projudiAgaiaRota = "falha:" + etapa;
    chrome.storage.local.remove("agaia_pedido").catch(() => {});
    aviso(`Extensão: não consegui a etapa “${etapa}”${detalhe ? " (" + detalhe + ")" : ""}. Continue à mão a partir daqui.`, false, direto(p));
  }

  // Elemento clicável cujo texto é o rótulo (o menor que o contém); cartões inteiros e links são aceitos.
  function acharPorTexto(rotulo, exato) {
    const r = sem(rotulo);
    const cand = [...document.querySelectorAll("a, button, [role=button], [onclick], li, div, span, h1, h2, h3, h4, h5, p")].filter((e) => visivel(e) && (exato ? sem(e.innerText) === r : sem(e.innerText).includes(r)));
    if (!cand.length) return null;
    cand.sort((a, b) => sem(a.innerText).length - sem(b.innerText).length);
    const e = cand[0];
    return e.closest("a, button, [role=button], [onclick]") || e.querySelector("a, button") || e;
  }
  const clicar = (el) => { el.scrollIntoView({ block: "center" }); el.click(); };

  const botoesIr = () => [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].filter((e) => visivel(e) && /^[^a-z0-9]*ir[^a-z0-9]*$/.test(sem(e.innerText || e.value)));
  const selectUnidade = () => [...document.querySelectorAll("select")].find((s) => /unidade do projudi/i.test((s.closest("div, fieldset, form")?.innerText || "").slice(0, 200)) || [...s.options].some((o) => / - /.test(o.text) && /vara|juizado|comarca|serventia/i.test(o.text)));
  const ehListagem = () => !!selectUnidade() || /Classificador/i.test(document.body.innerText) && botoesIr().length > 0;
  const ehExecucao = () => !!document.getElementById("consultar_juris_auto") || /\/prompts\/moderno/.test(location.pathname);

  function melhorUnidade(sel, serventia, prompt) {
    const ops = [...sel.options].filter((o) => o.value && !/selecione|todas/i.test(o.text));
    const por = (alvo, f) => ops.filter((o) => f(semGo(o.text), alvo)).sort((a, b) => a.text.length - b.text.length)[0];
    const s = semGo(serventia), fim = sem((prompt || "").split(" - ").pop()), fimServ = sem((serventia || "").split(" - ").pop().replace(/\s*-\s*go\s*$/i, ""));
    return (s && (por(s, (x, a) => x === a) || por(s, (x, a) => x.includes(a) || a.includes(x)))) || (fimServ && por(fimServ, (x, a) => x.endsWith(a) || x.includes(a))) || (fim && fim.length > 4 && por(fim, (x, a) => x.endsWith(a) || x.includes(a))) || null;
  }

  async function passo() {
    const p = await pegar();
    if (!p || ehExecucao()) return "fim";      // sem pedido, ou já na execução (agaia-form.js assume)
    if (p.irOk) return "clicou";      // o IR já foi clicado: só falta a tela de execução abrir
    await dorme(600);

    if (ehListagem()) {
      const sel = selectUnidade();
      // 1) Unidade do Projudi
      if (sel && !p.unidadeOk) {
        const op = melhorUnidade(sel, p.serventia, p.prompt);
        if (!op) return falhar(p, "escolher a Unidade do Projudi", `não achei “${p.serventia || p.prompt || "?"}” entre as unidades`);
        await guardar(p, { unidadeOk: true });
        if (sel.value !== op.value) {
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, op.value);
          sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true }));
          await dorme(3500);      // a lista recarrega (a página pode ser recarregada: então este script termina e o próximo continua daqui)
        }
      }
      // 2) aba "Classificador"
      if (!p.classificadorOk) {
        const aba = acharPorTexto("Classificador", true);
        if (!aba) return falhar(p, "abrir a aba Classificador", "não achei a aba");
        await guardar(p, { classificadorOk: true });
        clicar(aba);
        await dorme(3500);
      }
      // 3) "IR": o processo enviado, se estiver na lista; senão o primeiro
      const irs = await esperar(() => { const l = botoesIr(); return l.length ? l : null; }, 20000);
      if (!irs) return falhar(p, "achar o botão IR", "a lista do Classificador está vazia nesta unidade");
      const num = digitos(p.numero), linhaDe = (b) => (b.closest("tr, .row, li, [class*=card]") || b.parentElement || b).innerText || "";
      const doProcesso = irs.find((b) => num && digitos(linhaDe(b)).includes(num));
      const escolhido = doProcesso || irs[0];
      const aberto = (linhaDe(escolhido).match(/\d{7}[-.]\d{2}[.\-]?\d{4}/) || [])[0] || "";
      await guardar(p, { aberto, primeiro: !doProcesso, irOk: true });
      clicar(escolhido);
      return "clicou";
    }

    // páginas anteriores à lista
    const meus = !p.meusOk && acharPorTexto("Meus Processos Judiciais", false);
    if (meus) { await guardar(p, { meusOk: true }); clicar(meus); return "clicou"; }
    const gestao = !p.gestaoOk && !p.meusOk && acharPorTexto("Gestão e Execução de Processos", false);
    if (gestao) { await guardar(p, { gestaoOk: true }); clicar(gestao); return "clicou"; }
    return "nada";
  }

  (async () => {
    const t0 = Date.now();
    for (;;) {      // a etapa pode demorar a aparecer (menus carregando); se a página navegar, este script termina e o da página seguinte continua
      const p = await pegar();
      if (!p || ehExecucao()) return;
      await guardar(p, { passos: (p.passos || 0) + 1 });
      if ((p.passos || 0) > 60) return falhar(p, "seguir o caminho até a execução", "muitas tentativas");
      const r = await passo();
      if (r === "fim") return;
      if (Date.now() - t0 > 90000) return falhar(p, p.irOk ? "abrir a execução do prompt" : p.classificadorOk ? "achar o botão IR" : p.meusOk ? "abrir a lista de processos" : p.gestaoOk ? "abrir Meus Processos Judiciais" : "abrir Gestão e Execução de Processos", "a página não respondeu como esperado");
      await dorme(1500);
    }
  })();
})();
