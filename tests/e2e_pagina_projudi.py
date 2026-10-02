"""Página real do PDF completo do Projudi (documento escaneado + cabeçalho, tarja e selo digital em texto):
o OCR precisa reconhecer a página como imagem e deixar o texto do documento selecionável."""
import base64, glob, os, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
ENTRADA = Path(__file__).parent / "fixtures" / "pagina_projudi.pdf"


def main():
    tmp = Path(tempfile.mkdtemp())
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={RAIZ}", f"--load-extension={RAIZ}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/ocr.html")
        pg.set_input_files("#arquivo", str(ENTRADA)); pg.click("#iniciar")
        pg.wait_for_selector("body[data-pronto='1']", timeout=300000)
        print(pg.inner_text("#log"))
        link = pg.locator("#resultados a")
        assert link.get_attribute("data-nome") == "pagina_projudi-OCR.pdf", link.get_attribute("data-nome")
        b64 = pg.evaluate("async () => { const r = await fetch(document.querySelector('#resultados a').href); const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }")
        (tmp / "o.pdf").write_bytes(base64.b64decode(b64)); ctx.close()
    txt = " ".join(subprocess.run(["pdftotext", str(tmp / "o.pdf"), "-"], capture_output=True, text=True).stdout.lower().split())

    assert "taynara" in txt and "joao batista de oliveira" in txt and "território nacional" in txt, "o texto da identidade não foi reconhecido"
    print("OK")


main()
