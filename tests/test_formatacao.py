"""Testa a formatação da minuta (núcleo) com HTML típico de Word, Google Docs e texto simples."""
import glob, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"

WORD = """<html><body><p class=MsoNormal align=center style='text-align:center'><b><span style='font-size:14pt;font-family:Arial'>EXCELENTÍSSIMO SENHOR DOUTOR JUIZ</span></b></p>
<p class=MsoNormal style='text-align:justify;text-indent:35.4pt'><span style='font-family:Calibri;font-size:11pt;color:red'>Trata-se de ação de alimentos&nbsp;movida por <i>PEDRO</i> contra <b>JOÃO</b>.</span></p>
<p class=MsoNormal>&nbsp;</p>
<p class=MsoNormal style='margin-left:113.4pt;text-align:justify'><span style='font-size:10pt'>O pagamento deve ser feito até o dia 10 de cada mês, sob pena de execução.</span></p>
<p class=MsoNormal style='text-align:justify'><span>Segunda frase<br><br>terceira frase após quebra dupla.</span></p></body></html>"""
DOCS = """<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;font-weight:700;">DOS FATOS</span></p>
<p dir="ltr" style="line-height:1.38;"><span style="font-size:11pt;font-family:Arial;font-style:italic;">Texto em itálico</span><span style="font-size:11pt;font-family:Arial;"> e normal.</span></p></b>"""
LONGA = "“" + "A obrigação alimentar decorre do dever de solidariedade familiar e deve observar o binômio necessidade e possibilidade. " * 2 + "”"
TXT = f"Primeiro parágrafo da minuta.\n\nSegundo parágrafo com mais texto.\n> Citação marcada com sinal\n{LONGA}\n"


def main():
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        pg = b.new_page(); pg.set_content("<html><body></body></html>")
        pg.add_script_tag(path=str(RAIZ / "formatacao-core.js"))
        cfg = "ProjudiFormatacao.mesclar()"

        # --- Word colado ---
        blocos = pg.evaluate(f"h => ProjudiFormatacao.blocosDoClipboard(h, '', {cfg})", WORD)
        print([(x["tipo"], x["align"], x["html"][:40]) for x in blocos])
        assert [x["tipo"] for x in blocos] == ["titulo", "texto", "citacao", "texto", "texto"], blocos   # vazio descartado; quebra dupla separa
        assert blocos[0]["align"] == "center" and "<strong>" in blocos[0]["html"]
        assert blocos[1]["html"] == "Trata-se de ação de alimentos movida por <em>PEDRO</em> contra <strong>JOÃO</strong>."   # sem fonte/cor, nbsp virou espaço
        assert "Calibri" not in str(blocos) and "red" not in str(blocos)
        html = pg.evaluate(f"b => ProjudiFormatacao.montarHtml(b, {cfg})", blocos)
        assert "text-indent:2.5cm" in html and "font-family:'Times New Roman', Times, serif" in html and "font-size:16px" in html
        assert html.count("margin-left:4cm") == 1 and html.count("font-size:14px") == 1   # só a citação

        # --- Google Docs ---
        blocos = pg.evaluate(f"h => ProjudiFormatacao.blocosDoClipboard(h, '', {cfg})", DOCS)
        assert [x["html"] for x in blocos] == ["<strong>DOS FATOS</strong>", "<em>Texto em itálico</em> e normal."], blocos

        # --- texto simples: aspas longas e '>' viram citação ---
        blocos = pg.evaluate(f"t => ProjudiFormatacao.blocosDoClipboard('', t, {cfg})", TXT)
        assert [x["tipo"] for x in blocos] == ["texto", "texto", "citacao", "citacao"], [x["tipo"] for x in blocos]
        assert blocos[2]["html"] == "Citação marcada com sinal"

        # --- reformatar o que já está no editor (preserva imagem, tira recuo/blockquote) ---
        corpo = ("<p style='font-family:Arial;font-size:11px;color:blue'>Texto <font face='Verdana' size='5'>misto</font> <b>forte</b></p>"
                 "<blockquote style='margin:0 0 0 40px'><p>Citação em bloco recuado</p></blockquote><p>&nbsp;</p>"
                 "<p style='text-align:center'>Título <img src='data:image/gif;base64,R0lGODlhAQABAAAAACw='></p><div style='margin-left:3cm'>Texto recuado em div</div>")
        novo = pg.evaluate(f"h => ProjudiFormatacao.formatarHtmlCorpo(h, {cfg})", corpo)
        print(novo)
        assert "blockquote" not in novo and "Verdana" not in novo and "color" not in novo and "<font" not in novo
        assert "<img" in novo and novo.count("margin-left: 4cm") == 2 and "&nbsp;</p>" in novo     # vazio mantido por padrão
        sem_vazio = pg.evaluate("h => ProjudiFormatacao.formatarHtmlCorpo(h, {...ProjudiFormatacao.mesclar(), removerVazios: true})", corpo)
        assert "&nbsp;</p>" not in sem_vazio
        idem = pg.evaluate(f"h => ProjudiFormatacao.formatarHtmlCorpo(h, {cfg})", novo)
        assert idem == novo, "formatar duas vezes deve dar o mesmo resultado"

        # --- aprender o padrão de um parágrafo formatado à mão (unidade pt) ---
        pg.set_content("<html><body contenteditable><p id=a style=\"font-family:'Garamond';text-align:justify;text-indent:1.5cm;margin:0 0 6pt 0;line-height:1.5\"><span style='font-size:12pt'>texto <b id=x>ancora</b></span></p></body></html>")
        pg.add_script_tag(path=str(RAIZ / "formatacao-core.js"))
        pg.evaluate("() => { const r = document.createRange(); r.setStart(document.getElementById('x').firstChild, 2); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }")
        ap = pg.evaluate("() => ProjudiFormatacao.aprender(document)")
        print(ap)
        assert ap["fontSize"] == "12pt" and "Garamond" in ap["fontFamily"] and ap["textAlign"] == "justify"
        assert ap["textIndent"] == "1.5cm" and ap["lineHeight"] == "1.5" and ap["marginBottom"] == "6pt"
        b.close()
    print("OK")


if __name__ == "__main__":
    main()
