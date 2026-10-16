import glob, os, zipfile
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox", "--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1400, "height": 850}, accept_downloads=True); pg.goto("file:///tmp/claude-0/work/ui/h.html")
    pg.wait_for_selector("[data-testid=ata-preliminar-viewer]")
    t = pg.inner_text(".ata"); print(t[:300].replace("\n", " | "))
    assert "ATA PRELIMINAR DE AUDIÊNCIA" in t and "Mov. 3, Arq. 1, Pág. 2" in t and "Nenhum pedido relacionado à audiência" in t and "[conferir]" in t and "ALERTA" in t
    print("pagina:", pg.inner_text("text=/Página/").strip())
    pg.screenshot(path="/tmp/claude-0/work/ui/ata.png")
    assert pg.is_visible("[data-testid=ata-painel]") and "fonte branca" in pg.inner_text("[data-testid=ata-painel]")
    pg.click("text=Mais") if False else None
    for _ in range(3): pg.click("button[title=Aumentar]")
    assert "130%" in pg.inner_text("body")
    with pg.expect_download() as d: pg.click("button[title='Baixar em Word (.docx)']")
    f = d.value; path = "/tmp/claude-0/work/ui/ata.docx"; f.save_as(path); print("docx:", f.suggested_filename, os.path.getsize(path))
    x = zipfile.ZipFile(path).read("word/document.xml").decode(); assert "MARIA TESTE DA SILVA" in x and "ATA PRELIMINAR" in x and "Ana Souza" in x
    pg.click("button[title='Gerar de novo']") if False else None
    pg.keyboard.press("Escape"); assert pg.evaluate("window.__fechou")
    b.close()
print("OK")
