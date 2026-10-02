// Descobre, na aba "Navegação de Arquivos" do Projudi, as movimentações e os arquivos de cada uma.
// Estrutura esperada (pelo que aparece na tela): um sumário com linhas "N - Título da movimentação" e, embaixo de cada uma,
// links com o nome do arquivo (acao.pdf, online.html...). Não depende de classes: lê a ordem dos elementos na página.
(function (g) {
  const EXT = /\.(pdf|html?|xhtml|jpe?g|png|gif|bmp|webp|tiff?|mp3|mp4|wav|ogg|m4a|webm|avi|mov|wmv|3gp|docx?|odt|rtf|xlsx?|ods|pptx?|txt|zip|rar|7z|xml|p7s|csv)$/i;
  const NUM_PROCESSO = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

  const extDe = (nome) => ((nome.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const tipoDeExt = (e) => (e === "pdf" ? "pdf" : /^(html?|xhtml)$/.test(e) ? "html" : /^(jpe?g|png|gif|bmp|webp|tiff?)$/.test(e) ? "imagem" : "outro");

  function urlDe(a) {
    const h = (a.getAttribute("href") || "").trim();
    if (h && !/^(javascript:|#|mailto:)/i.test(h)) return new URL(h, a.ownerDocument.baseURI).href;
    const oc = a.getAttribute("onclick") || h; // links "javascript:abrir('Arquivo?id=1')"
    const m = oc.match(/['"]([^'"\s]*[?\/][^'"\s]*)['"]/);
    return m ? new URL(m[1], a.ownerDocument.baseURI).href : null;
  }

  function descobrir(doc) {
    const movimentos = [];
    let atual = null, ultimoN = 0, ordem = 0;
    const sobre = (n) => n.parentElement && n.parentElement.closest("a,script,style,noscript");
    const w = doc.createTreeWalker(doc.body, 1 | 4);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 1 && n.tagName === "A") {
        const nome = n.textContent.replace(/\s+/g, "").trim();   // nomes longos quebram em várias linhas
        if (!EXT.test(nome)) continue;
        if (!atual) { atual = { n: 0, titulo: "Arquivos", arquivos: [] }; movimentos.push(atual); }
        const ext = extDe(nome);
        atual.arquivos.push({ nome, ext, tipo: tipoDeExt(ext), url: urlDe(n), ordem: ordem++, mov: atual.n });
      } else if (n.nodeType === 3 && !sobre(n)) {
        const t = n.nodeValue.replace(/\s+/g, " ").trim();
        const m = t.match(/^(\d{1,5})\s*[-–]\s*(\S.*)$/);
        if (m && +m[1] > ultimoN) { ultimoN = +m[1]; atual = { n: +m[1], titulo: t, arquivos: [] }; movimentos.push(atual); }
      }
    }
    const processo = ((doc.body.textContent || "").match(NUM_PROCESSO) || [""])[0];
    const total = movimentos.reduce((s, m) => s + m.arquivos.length, 0);
    return { processo, movimentos, total, semEndereco: movimentos.flatMap((m) => m.arquivos).filter((a) => !a.url).length };
  }

  // é a tela do sumário de movimentações com arquivos?
  const ehNavegacao = (doc) => !!doc.body && /Sum[aá]rio|Movimenta[cç][õo]es\s+Processo/i.test(doc.body.textContent || "") && descobrir(doc).total >= 1;

  g.ProjudiArquivos = { descobrir, ehNavegacao, extDe, tipoDeExt };
})(globalThis);
