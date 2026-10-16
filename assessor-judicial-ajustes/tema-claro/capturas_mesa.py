import glob, sys
from playwright.sync_api import sync_playwright
out = sys.argv[1]; w = int(sys.argv[2]) if len(sys.argv) > 2 else 1500
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": w, "height": 900}); pg.set_default_timeout(4000); logs = []
    pg.on("pageerror", lambda e: logs.append(str(e)))
    pg.goto("http://127.0.0.1:5199/mesa.html"); pg.wait_for_timeout(3500)
    try: pg.locator("text=Marcos Vinícius").first.click(); pg.wait_for_timeout(1200)
    except Exception as e: print("sem item", e)
    pg.screenshot(path=out + "_briefing.png")
    for nome, arq in (("Roteiro", "roteiro"), ("Deliberações", "delib"), ("Sentença", "sent"), ("Ata da Audiência", "ata")):
        try: pg.locator(f"button:has-text('{nome}')").first.click(); pg.wait_for_timeout(900); pg.screenshot(path=f"{out}_{arq}.png")
        except Exception as e: print("falhou", nome, str(e)[:80])
    try: pg.locator("button:has-text('Mutirão Expresso')").first.click(); pg.wait_for_timeout(1500); pg.screenshot(path=out + "_mutirao.png")
    except Exception as e: print("falhou mutirao", str(e)[:80])
    print(logs[:5]); b.close()
