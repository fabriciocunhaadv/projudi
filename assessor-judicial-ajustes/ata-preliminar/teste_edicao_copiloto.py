import glob
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox", "--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1400, "height": 850}, accept_downloads=True); pg.goto("file:///tmp/claude-0/work/ui/h.html")
    pg.wait_for_selector("[data-testid=ata-preliminar-viewer]")
    assert pg.locator("[data-testid=ata-salvar]").is_disabled()
    # edição direta
    pg.click("[data-testid=ata-editar]")
    assert pg.get_attribute("[data-testid=ata-documento]", "contenteditable") == "true"
    pg.click("[data-testid=ata-documento] p.titulo"); pg.keyboard.press("End"); pg.keyboard.type(" (EDITADA)")
    assert not pg.locator("[data-testid=ata-salvar]").is_disabled()
    pg.click("[data-testid=ata-salvar]"); pg.wait_for_timeout(300)
    salvo = pg.evaluate("window.__salvo"); assert "(EDITADA)" in salvo and "<script" not in salvo, salvo[:200]
    # copiloto
    pg.click("[data-testid=ata-aba-copiloto]"); pg.fill("[data-testid=ata-instrucao]", "Troque o começo do resumo"); pg.click("[data-testid=ata-enviar]"); pg.wait_for_timeout(500)
    assert "Troque o começo" in pg.inner_text("[data-testid=ata-conversa]") and "Troquei o início" in pg.inner_text("[data-testid=ata-conversa]")
    assert "ALTERADA PELO COPILOTO" in pg.inner_text("[data-testid=ata-documento]") and "(EDITADA)" in pg.inner_text("[data-testid=ata-documento]")
    assert pg.evaluate("window.__pedido") == "Troque o começo do resumo"
    pg.screenshot(path="/tmp/claude-0/work/ui/ata2.png")
    pg.click("[data-testid=ata-desfazer]"); pg.wait_for_timeout(200)
    assert "ALTERADA PELO COPILOTO" not in pg.inner_text("[data-testid=ata-documento]")
    # Word exporta a versão EDITADA
    with pg.expect_download() as d: pg.click("button[title='Baixar em Word (.docx)']")
    import zipfile; d.value.save_as("/tmp/claude-0/work/ui/ata2.docx"); x = zipfile.ZipFile("/tmp/claude-0/work/ui/ata2.docx").read("word/document.xml").decode(); assert "(EDITADA)" in x, "o Word deve levar a edição"
    b.close()
print("OK")
