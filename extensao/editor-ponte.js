// Roda no mundo da PÁGINA (não no da extensão) para falar com o editor de texto do Projudi (TinyMCE/CKEditor) pela API dele.
// Assim o texto formatado passa pelos mesmos filtros e rotinas de gravação do editor, em vez de só alterar a tela.
(() => {
  if (window.__projudiPonte) return;
  window.__projudiPonte = true;

  const cadeia = () => { const r = [window]; try { let w = window; while (w.parent && w.parent !== w) { w = w.parent; r.push(w); } } catch (e) { /* outra origem */ } return r; };
  function achar() {
    for (const w of cadeia()) {
      try {
        if (w.tinymce) {
          const eds = (w.tinymce.editors && w.tinymce.editors.length ? w.tinymce.editors : []).filter(Boolean);
          const meu = eds.find((e) => { try { return e.getWin() === window || e.getDoc() === document; } catch (x) { return false; } }) || w.tinymce.activeEditor || eds[0];
          if (meu) return { tipo: "tinymce", ed: meu, w };
        }
        if (w.CKEDITOR && w.CKEDITOR.instances) {
          const nomes = Object.keys(w.CKEDITOR.instances);
          const ed = nomes.map((n) => w.CKEDITOR.instances[n]).find((e) => { try { return e.document.$ === document; } catch (x) { return false; } }) || w.CKEDITOR.instances[nomes[0]];
          if (ed) return { tipo: "ckeditor", ed, w };
        }
      } catch (e) { /* quadro de outra origem */ }
    }
    return null;
  }

  const sobrevive = (ed, tipo) => { // o que o editor deixa passar ao gravar
    const teste = '<p style="font-family:Times New Roman;font-size:16px;text-align:justify;text-indent:2.5cm;margin-left:4cm"><span style="font-family:Times New Roman;font-size:16px">x</span></p>';
    try {
      if (tipo === "tinymce") { const d = ed.getDoc().createElement("div"); d.innerHTML = teste; return ed.serializer.serialize(d, { format: "html" }); }
      if (tipo === "ckeditor") return ed.dataProcessor.toDataFormat(teste);
    } catch (e) { return "erro: " + e.message; }
    return "";
  };

  const responder = (obj) => { document.documentElement.setAttribute("data-projudi-ponte", JSON.stringify(obj)); };

  const ouvir = (ev) => {
    const d = ev.detail || {};
    const a = achar();
    if (!a) return responder({ ok: false, motivo: "nenhum editor TinyMCE/CKEditor encontrado" });
    const { ed, tipo } = a;
    try {
      if (d.acao === "diag") {
        const s = ed.settings || ed.config || {};
        const pega = (k) => (typeof s[k] === "string" || typeof s[k] === "boolean" || typeof s[k] === "number" ? s[k] : s[k] ? JSON.stringify(s[k]).slice(0, 400) : undefined);
        return responder({ ok: true, tipo, versao: (a.w.tinymce || a.w.CKEDITOR || {}).majorVersion || (a.w.CKEDITOR || {}).version, id: ed.id || ed.name,
          config: Object.fromEntries(["valid_styles", "valid_elements", "extended_valid_elements", "invalid_styles", "plugins", "toolbar", "content_style", "paste_as_text", "allowedContent", "extraAllowedContent", "forcePasteAsPlainText", "removeFormatAttributes"].map((k) => [k, pega(k)]).filter(([, v]) => v !== undefined)),
          sobrevive: sobrevive(ed, tipo), textareaAntes: (() => { try { const t = (ed.element && ed.element.$) || ed.getElement(); return String(t.value).replace(/data:[^"\s]{20,}/g, "data:…").slice(0, 700); } catch (e) { return "?"; } })(), conteudoAtual: String(ed.getContent ? ed.getContent() : ed.getData()).replace(/data:[^"\s]{20,}/g, "data:…").slice(0, 1500) });
      }
      if (d.acao === "ler") return responder({ ok: true, tipo, html: String(ed.getData ? ed.getData() : ed.getContent()) });
      if (d.acao === "sincronizar") { // o formulário do Projudi lê o <textarea>, que o CKEditor só atualiza em certos momentos
        if (tipo === "tinymce") ed.save && ed.save(); else ed.updateElement && ed.updateElement();
        return responder({ ok: true });
      }
      if (d.acao === "inserir") {
        if (tipo === "tinymce") {
          ed.undoManager.transact(() => { ed.selection.setRng(ed.selection.getRng()); ed.insertContent(d.html); });
          ed.save && ed.save(); ed.fire && ed.fire("change");
        } else {
          ed.fire("saveSnapshot"); ed.insertHtml(d.html); ed.fire("saveSnapshot");
          ed.updateElement && ed.updateElement();
        }
        return responder({ ok: true, tipo, sobrevive: sobrevive(ed, tipo) });
      }
    } catch (e) { return responder({ ok: false, motivo: e.message }); }
    responder({ ok: false, motivo: "ação desconhecida" });
  };
  // o editor reescreve o documento do quadro (document.write) e isso apaga os ouvintes: reanexa de tempos em tempos
  const garantir = () => document.addEventListener("projudi-ext-ponte", ouvir, true);
  garantir(); setInterval(garantir, 700);
})();
