"""Painel: ocultar/reativar serventia e cargo; ocultas somem do resumo e dos totais, ficam na seção “Ocultas”."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"; tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
def serv(n, perfil, na, erro=None):
    return {"serventia": n, "perfil": perfil, "url": "x", "erro": erro, "linhas": [{"tipo": "t", "naoAnalisadas": na, "preAnalisadas": 0}], "processos": {"naoAnalisadas": [], "preAnalisadas": []}}
est = {"status": "ok", "quando": 1, "serventias": [serv("Vara A", "Juiz Novo", 3), serv("Vara B", "Juiz Antigo", 5), serv("Vara C", "Juiz Novo", 0, "tabela de conclusões não encontrada")]}
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    import json
    sw.evaluate("(e) => chrome.storage.local.set({ estado: e, falhas: { 'Vara C|Juiz Novo': 2 } })", est)
    pg = ctx.new_page(); pg.goto(base + "painel.html"); pg.wait_for_timeout(1200)
    t = pg.inner_text("#conteudo"); assert "Vara A" in t and "Vara B" in t and "ocultar?" in t, t[:400]
    pg.click("[data-ocultar-serv='Vara A']"); pg.wait_for_timeout(300)
    t = pg.inner_text("#conteudo"); assert "Ocultas (1)" in t and pg.locator("[data-ocultar-serv='Vara A']").count() == 0
    pg.click("[data-ocultar-cargo='Juiz Antigo']"); pg.wait_for_timeout(300)
    assert "Ocultas (2)" in pg.inner_text("#conteudo") and pg.locator("[data-ocultar-serv='Vara B']").count() == 0
    saved = sw.evaluate("() => chrome.storage.sync.get('ocultas')")["ocultas"]; assert saved == {"servs": ["Vara A"], "cargos": ["Juiz Antigo"]}, saved
    pg.reload(); pg.wait_for_timeout(1000); assert "Ocultas (2)" in pg.inner_text("#conteudo")      # persiste
    pg.locator("details.bloco summary", has_text="Ocultas").click(); pg.click("[data-reativar-serv='Vara A']"); pg.wait_for_timeout(300)
    assert pg.locator("[data-ocultar-serv='Vara A']").count() == 1 and "Ocultas (1)" in pg.inner_text("#conteudo")
    print("OK"); ctx.close()
