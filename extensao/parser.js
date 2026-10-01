// Funções de leitura do HTML do Projudi. Usadas pelo offscreen.js (DOM) e pelos testes.
(function (g) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const semAcento = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const paraInt = (s) => parseInt((s || "").replace(/\D/g, ""), 10) || 0;
  const doc = (html) => new DOMParser().parseFromString(html, "text/html");
  const logado = (d) => !!d.body && d.body.hasAttribute("data-usuario-id");

  // Tela "Serventias Disponíveis" -> [{serventia, perfil, href}]
  function parseLista(html) {
    const d = doc(html);
    const itens = [];
    d.querySelectorAll("fieldset").forEach((fs) => {
      const serventia = norm(fs.querySelector("legend")?.textContent);
      fs.querySelectorAll('a[href*="PaginaAtual=7"]').forEach((a) =>
        itens.push({ serventia, perfil: norm(a.textContent), href: a.getAttribute("href") }));
    });
    return { logado: logado(d), itens };
  }

  // Tela da serventia -> tabela CONCLUSÕES
  function parseConclusoes(html) {
    const d = doc(html);
    const t = [...d.querySelectorAll("table")].find((t) =>
      /tipo\s+conclus/i.test(t.textContent) && /n[ãa]o\s+analisadas/i.test(t.textContent) &&
      !t.querySelector("table"));
    if (!t) return { logado: logado(d), linhas: null };
    const linhas = [...t.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("th,td")].map((c) => norm(c.textContent)))
      .filter((r) => r.length >= 3 && !semAcento(r[0]).startsWith("tipo conclus"))
      .map((r) => ({ tipo: r[0], naoAnalisadas: paraInt(r[1]), preAnalisadas: paraInt(r[2]) }));
    return { logado: true, linhas };
  }

  g.ProjudiParser = { parseLista, parseConclusoes, semAcento };
})(globalThis);
