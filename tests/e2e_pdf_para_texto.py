"""PDF para texto: escolhe VÁRIOS PDFs do computador (um com texto nativo + páginas escaneadas, outro só com texto) e confere o .txt de cada um,
com e sem marcadores de página, e o arquivo único com todos."""
import glob, os, shutil, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
FIXTURE = Path(__file__).parent / "fixtures" / "pagina_projudi.pdf"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, accept_downloads=True,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    aux = ctx.new_page(); gerar_pdf(aux, tmp / "misto.pdf"); aux.close()
    shutil.copy(FIXTURE, tmp / "projudi.pdf")
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/texto.html")
    pg.set_input_files("#arquivo", [str(tmp / "misto.pdf"), str(tmp / "projudi.pdf")])
    assert pg.is_enabled("#iniciar"); assert "2 arquivo(s)" in pg.inner_text("#status")
    pg.click("#iniciar")
    pg.wait_for_selector("body[data-pronto='1']", timeout=300000)
    r = pg.evaluate("window.__textos")
    print([(x["nome"], x["paginas"], x["ocr"], len(x["texto"])) for x in r])
    assert [x["nome"] for x in r] == ["misto", "projudi"], r
    misto = r[0]["texto"]
    assert r[0]["paginas"] == 3 and r[0]["ocr"] == 2, r[0]
    assert "[Página 1 de 3]" in misto and "certidao de nascimento" in misto.lower(), misto[:300]
    assert "alimentos" in misto.lower() and "sentença" in misto.lower().replace("sentenca", "sentença"), misto      # texto das páginas escaneadas (OCR)
    assert len(r[1]["texto"]) > 100 and r[1]["paginas"] == 1, r[1]
    assert pg.is_visible("#baixarTudo") and pg.locator("button:has-text('Baixar .txt')").count() == 2
    with pg.expect_download() as dl:
        pg.locator("button:has-text('Baixar .txt')").first.click()
    assert dl.value.suggested_filename == "misto.txt", dl.value.suggested_filename
    conteudo = Path(dl.value.path()).read_text(encoding="utf-8-sig")
    assert conteudo == misto, "o arquivo baixado difere do texto"
    with pg.expect_download() as dl2:
        pg.click("#baixarTudo")
    junto = Path(dl2.value.path()).read_text(encoding="utf-8-sig")
    assert "===== misto.pdf =====" in junto and "===== projudi.pdf =====" in junto
    # PDF com OCR: o PDF misto (2 páginas escaneadas) devolve o pesquisável; o do Projudi também precisou de OCR (1 página imagem)
    assert r[0]["pdf"] and len(r[0]["pdf"]) > 1000, "faltou o PDF com OCR"
    assert pg.locator("button:has-text('Baixar PDF com OCR')").count() == 2 and pg.is_visible("#baixarPdfs")
    with pg.expect_download() as dl3:
        pg.locator("button:has-text('Baixar PDF com OCR')").first.click()
    assert dl3.value.suggested_filename == "misto-OCR.pdf", dl3.value.suggested_filename
    assert Path(dl3.value.path()).read_bytes()[:4] == b"%PDF"
    # sem marcadores de página
    pg.reload(); pg.set_input_files("#arquivo", [str(tmp / "projudi.pdf")]); pg.uncheck("#marcadores"); pg.click("#iniciar")
    pg.wait_for_selector("body[data-pronto='1']", timeout=300000)
    t2 = pg.evaluate("window.__textos[0].texto")
    assert "[Página" not in t2 and len(t2) > 100, t2[:200]
    print("OK"); ctx.close()
