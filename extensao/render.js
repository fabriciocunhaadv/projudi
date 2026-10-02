// Monta as tabelas de processos no formato do Projudi (usado pelo popup e pelo painel).
(function (g) {
  const BASE = "https://projudi.tjgo.jus.br/";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const rotuloClassificador = (p) =>
    p.classificador ? esc(p.classificador) + (p.prioridade != null ? ` - (Prioridade: ${p.prioridade})` : "") : "Sem classificador";

  const diasDe = (p, agora) => {
    const t = g.Ordenar.ms(p.dataInicio || p.dataPreAnalise);
    return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / 86400000)) : "";
  };

  function celulaProcesso(p) {
    const dot = p.urgencia && p.urgencia < 3 ? `<span class="dot u${p.urgencia}" title="${esc(p.urgenciaTexto)}"></span>` : "";
    const num = p.url ? `<a href="${esc(new URL(p.url, BASE).href)}" target="_blank">${esc(p.processo)}</a>` : `<b>${esc(p.processo)}</b>`;
    const urg = p.urgencia && p.urgencia < 3 && p.urgenciaTexto ? `<span class="urgtxt">${esc(p.urgenciaTexto)}</span>` : "";
    return `<td class="proc">${dot}${num} <button class="copiar" data-num="${esc(p.processo)}" title="Copiar número do processo">📋</button>${urg}</td>`;
  }

  // tipo: "naoAnalisadas" | "preAnalisadas"
  function tabela(procs, { tipo, modo = "trabalho", dias = false, agora = Date.now() } = {}) {
    if (!procs || !procs.length) return "";
    const pre = tipo === "preAnalisadas";
    const cols = (pre ? 6 : 4) + (dias ? 1 : 0);
    const cmp = g.Ordenar.comparador(modo);
    const porTipo = new Map();
    procs.forEach((p) => { const k = p.tipoConclusao || ""; (porTipo.get(k) || porTipo.set(k, []).get(k)).push(p); });
    let h = `<table class="tp"><thead><tr><th class="n"></th><th>Processo</th>` +
      (pre ? `<th>Data Início</th><th>Data Pré-Análise</th><th>Usuário Pré-Análise</th><th>Tipo de Movimento</th>`
           : `<th>Data/Hora</th><th>Tipo da Ação</th>`) + (dias ? `<th class="n" title="Dias desde o início">Dias</th>` : "") + `</tr></thead><tbody>`;
    let n = 0;
    for (const [tc, lista] of porTipo) {
      h += `<tr class="tp-titulo"><th colspan="${cols}">${esc(tc || "Conclusões")}</th></tr>`;
      let ultimo = null;
      for (const p of [...lista].sort(cmp)) {
        const chave = `${p.classificador}|${p.prioridade}`;
        if (chave !== ultimo) { ultimo = chave; h += `<tr class="tp-sub${p.classificador ? "" : " sem"}"><th colspan="${cols}">${rotuloClassificador(p)}</th></tr>`; }
        n++;
        const d = dias ? diasDe(p, agora) : "";
        h += `<tr class="tp-linha"><td class="n">${n}</td>${celulaProcesso(p)}` + (pre
          ? `<td class="dt">${esc(p.dataInicio)}</td><td class="dt">${esc(p.dataPreAnalise)}${p.origem === "multipla" ? ' <span class="multipla">múltipla</span>' : ""}</td><td>${esc(p.usuarioPreAnalise)}</td><td>${esc(p.tipoMovimento)}</td>`
          : `<td class="dt">${esc(p.dataInicio)}</td><td>${esc(p.tipoAcao)}</td>`) +
          (dias ? `<td class="n ${d >= 30 ? "velho" : ""}">${d}</td>` : "") + `</tr>`;
      }
    }
    return h + `</tbody></table>`;
  }

  // clique no 📋 copia o número do processo
  function ligarCopiar(raiz) {
    raiz.addEventListener("click", async (e) => {
      const b = e.target.closest && e.target.closest(".copiar");
      if (!b) return;
      try { await navigator.clipboard.writeText(b.dataset.num); } catch (_) { return; }
      const ok = document.createElement("span"); ok.className = "copiado"; ok.textContent = "copiado";
      b.after(ok); setTimeout(() => ok.remove(), 1200);
    });
  }

  g.RenderProjudi = { tabela, ligarCopiar, rotuloClassificador, diasDe, esc };
})(globalThis);
