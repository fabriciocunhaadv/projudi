"""Pauta de audiências: lê a lista (fixture fictícia) e as movimentações, e desenha a pauta por dia."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent; FIX = Path(__file__).parent / "fixtures"
lista = (FIX / "audiencias.html").read_text(encoding="utf-8")
proc = '<html><body><table><tr><td>59</td><td>10/05/2026</td><td>Intimação expedida</td></tr><tr><td>101</td><td>12/05/2026</td><td>Ofício expedido</td></tr></table></body></html>'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox", "--allow-file-access-from-files"])
    pg = b.new_page()
    pg.route("https://projudi.tjgo.jus.br/**", lambda r: r.fulfill(status=200, content_type="text/html", body=(lista.replace('href="Audiencia?PaginaAtual=3&Pagina=2"', 'href="#"') if "Audiencia?" in r.request.url else proc)))
    pg.goto("file://" + str(RAIZ / "extensao" / "pauta.html"))
    pg.click("#gerar"); pg.wait_for_selector(".folha", timeout=15000)
    t = pg.inner_text("#saida"); print(t)
    assert "PAUTA DIA 10 DE NOVEMBRO DE 2026" in t.upper() and "13h30" in t and "Maria Teste" in t and "Intimação mov. 59" in t and "Ofício mov. 101" in t
    pg.screenshot(path="/tmp/claude-0/work/ui/pauta.png"); b.close()
print("OK")
