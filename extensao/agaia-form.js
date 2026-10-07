// ExecAgaia (simplesefacil.tjgo.jus.br/agaia): aplica o pedido enviado pelo Projudi — marca as duas opções extras e escolhe o prompt da serventia.
// O número do processo já vem na própria URL (numero_processo=...). O restante do formulário fica para o usuário.
(() => {
  if (window.__projudiAgaiaForm) return;
  window.__projudiAgaiaForm = true;
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/civel/g, "civil");
  async function esperar(fn, ms) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await dorme(250); } }

  function marcar(id) {
    const c = document.getElementById(id);
    if (!c) return false;
    if (!c.checked) c.click();
    return c.checked;
  }
  // Prompt: a opção cujo texto termina com o final do nome desejado ("… - Família e Sucessões"); entre várias, a mais curta.
  function melhorOpcao(sel, alvo) {
    const ops = [...sel.options].filter((o) => o.value && !/selecione/i.test(o.text));
    const t = sem(alvo), fim = sem(alvo.split(" - ").pop());
    const por = (f) => ops.filter((o) => f(sem(o.text))).sort((a, b) => a.text.length - b.text.length)[0];
    return por((x) => x === t) || por((x) => x.includes(t)) || (fim && (por((x) => x.endsWith(fim)) || por((x) => x.includes(fim)))) || null;
  }
  function escolherPrompt(alvo) {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /selecione um prompt/i.test(o.text)));
    if (!sel) return "não achei a lista de prompts";
    const op = alvo && melhorOpcao(sel, alvo);
    if (!op) return alvo ? `não achei no Agaia um prompt parecido com “${alvo}” (escolha à mão)` : "serventia sem prompt cadastrado (escolha à mão)";
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, op.value);
    sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true }));
    return "";
  }
  function aviso(txt, ok) {
    const d = document.createElement("div");
    d.setAttribute("data-projudi-ext", "agaia-aviso");
    d.style.cssText = `position:fixed;right:12px;bottom:60px;z-index:2147483647;max-width:360px;padding:8px 12px;border-radius:6px;font:13px system-ui;color:#fff;background:${ok ? "#1b7a3d" : "#b3541e"};box-shadow:0 2px 8px #0005`;
    d.textContent = txt; document.body.append(d); setTimeout(() => d.remove(), ok ? 8000 : 20000);
  }

  (async () => {
    const { agaia_pedido: p } = await chrome.storage.local.get("agaia_pedido");
    if (!p || Date.now() - p.ts > 3 * 60000) { if (p) await chrome.storage.local.remove("agaia_pedido"); return; }
    await chrome.storage.local.remove("agaia_pedido");
    if (!(await esperar(() => document.getElementById("consultar_juris_auto") && document.getElementById("incluir_contexto_ampliado_acuracia"), 20000))) return aviso("Extensão: não achei as opções extras do ExecAgaia.", false);
    await dorme(500);
    const problemas = [];
    if (!marcar("consultar_juris_auto")) problemas.push("jurisprudência simultânea");
    if (!marcar("incluir_contexto_ampliado_acuracia")) problemas.push("contexto ampliado");
    const campo = document.querySelector("input[name][id][class*=js-ef-f]") || [...document.querySelectorAll("input[type=text]")].find((i) => /Informe o n[uú]mero do processo/i.test(i.placeholder || ""));
    if (campo && !campo.value && p.numero) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, p.numero); campo.dispatchEvent(new Event("input", { bubbles: true })); campo.dispatchEvent(new Event("change", { bubbles: true })); }
    await esperar(() => document.querySelector("select option[value='630']") || [...document.querySelectorAll("select")].some((s) => s.options.length > 2 && [...s.options].some((o) => /selecione um prompt/i.test(o.text))), 10000);
    const e = escolherPrompt(p.prompt);
    if (e) problemas.push(e);
    document.documentElement.dataset.projudiAgaia = problemas.length ? "parcial:" + problemas.join("|") : "ok";
    aviso(problemas.length ? "Extensão: preenchi o que deu; " + problemas.join("; ") + "." : `Extensão: ${p.numero} — opções marcadas e prompt escolhido. Falta só o restante do formulário.`, !problemas.length);
  })();
})();
