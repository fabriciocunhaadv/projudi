"""Formatação monografia: citação (4 cm, itálico, fonte 10), negrito/itálico, Times 12 justificado — pedidos do Docs API e HTML do plano B."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = (Path(__file__).parent.parent / "extensao" / "docs-core.js").read_text().replace("export ", "")
HTML = """<h3>PODER JUDICIÁRIO</h3><h3>I - RELATÓRIO</h3><p>Trata-se de <b>embargos</b> de declaração, <i>data venia</i> opostos.</p>
<blockquote><p>"Art. 1.022. Cabem embargos de declaração contra qualquer decisão judicial."</p></blockquote><p>Conclusos <strong><em>os autos</em></strong>.</p>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(); pg.set_content("<html></html>")
    r = pg.evaluate("""([src, html]) => { const m = new Function(src + '; return { paragrafosDeHtml, requisicoes, htmlMonografia };')();
      const ps = m.paragrafosDeHtml(html); return { ps, req: m.requisicoes(ps), html: m.htmlMonografia(ps) }; }""", [SRC, HTML])
    b.close()
ps, req, html = r["ps"], r["req"], r["html"]
print([(x["texto"][:25], x["titulo"], x["citacao"], x["negritos"], x["italicos"]) for x in ps])
assert [x["titulo"] for x in ps] == [True, True, False, False, False] and ps[3]["citacao"] and not ps[2]["citacao"]
t2 = ps[2]["texto"]; assert ps[2]["negritos"] == [[t2.index("embargos"), t2.index("embargos") + 8]] and ps[2]["italicos"] == [[t2.index("data venia"), t2.index("data venia") + 10]], (ps[2]["negritos"], ps[2]["italicos"])
assert ps[4]["negritos"] == ps[4]["italicos"] == [[ps[4]["texto"].index("os autos"), ps[4]["texto"].index("os autos") + 8]]
texto = req[0]["insertText"]["text"]; assert texto.split("\n")[3].startswith('"Art. 1.022')
cit = [x for x in req if x.get("updateParagraphStyle", {}).get("paragraphStyle", {}).get("indentStart", {}).get("magnitude", 0) > 100]
assert len(cit) == 1 and abs(cit[0]["updateParagraphStyle"]["paragraphStyle"]["indentStart"]["magnitude"] - 113.386) < 0.1      # 4 cm
assert any(x.get("updateTextStyle", {}).get("textStyle") == {"fontSize": {"magnitude": 10, "unit": "PT"}, "italic": True} for x in req)
assert any(x.get("updateTextStyle", {}).get("textStyle") == {"weightedFontFamily": {"fontFamily": "Times New Roman"}, "fontSize": {"magnitude": 12, "unit": "PT"}} for x in req)
assert any(x.get("updateParagraphStyle", {}).get("paragraphStyle", {}).get("alignment") == "JUSTIFIED" for x in req)
assert "<b>embargos</b>" in html and "<i>data venia</i>" in html and "margin-left:4cm" in html and "font-size:10pt" in html and "font-style:italic" in html and "Times New Roman" in html
print("OK")
