import glob, sys
from playwright.sync_api import sync_playwright
out = sys.argv[1]; tema = sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1500, "height": 900}); pg.set_default_timeout(3000); logs = []
    pg.on("pageerror", lambda e: logs.append(str(e)))
    pg.add_init_script(f"localStorage.setItem('assessor_tema','{tema}');")
    pg.goto("http://127.0.0.1:5199/"); pg.wait_for_timeout(4000)
    try: pg.locator("text=Pular Tutorial").click(); pg.wait_for_timeout(400)
    except Exception: pass
    pg.screenshot(path=f"{out}_{tema}_main.png")
    for nome, arq in (("Auditoria Ouro", "lupa"), ("Teses & Modelos", "teses"), ("Conheça o Assessor", "conheca"), ("Histórico Local", "hist"), ("Audiências", "mesa")):
        try:
            pg.locator(f"button:has-text('{nome}')").first.click(); pg.wait_for_timeout(1800); pg.screenshot(path=f"{out}_{tema}_{arq}.png")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
            for t in ("Fechar", "Voltar"):
                try: pg.locator(f"button:has-text('{t}')").first.click(timeout=800)
                except Exception: pass
        except Exception as e: print("falhou", nome, str(e)[:60])
    print(logs[:3]); b.close()
