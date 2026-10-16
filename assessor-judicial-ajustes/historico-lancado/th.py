import glob
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 430, "height": 900}); logs=[]
    pg.on("pageerror", lambda e: logs.append(str(e)))
    pg.goto("http://127.0.0.1:5199/hist.html"); pg.wait_for_selector("[data-testid=btn-lancado-projudi]", timeout=20000)
    btns = pg.locator("[data-testid=btn-lancado-projudi]"); print("cards:", btns.count())
    assert btns.count() == 3
    btns.first.click(); pg.wait_for_timeout(500)
    print(pg.locator("[data-testid=btn-lancado-projudi]").first.inner_text())
    assert "Lançado no Projudi em" in pg.locator("[data-testid=btn-lancado-projudi]").first.inner_text()
    pg.screenshot(path="/tmp/claude-0/work/ui/hist.png")
    pg.click("text=A lançar"); pg.wait_for_timeout(400); assert pg.locator("[data-testid=btn-lancado-projudi]").count() == 2
    pg.click("text=Lançados ("); pg.wait_for_timeout(400); assert pg.locator("[data-testid=btn-lancado-projudi]").count() == 1
    pg.reload(); pg.wait_for_selector("[data-testid=btn-lancado-projudi]", timeout=20000)
    pg.click("text=Lançados ("); pg.wait_for_timeout(400); print("após recarregar, lançados:", pg.locator("[data-testid=btn-lancado-projudi]").count()); assert pg.locator("[data-testid=btn-lancado-projudi]").count() == 1
    print(logs[:3]); b.close()
print("OK")
