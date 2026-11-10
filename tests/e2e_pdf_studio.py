"""Tratamento de PDF para o Studio (pdf-studio.html): recebe o PDF em partes, faz OCR na página que é só imagem (mesmo com o carimbo do Projudi por cima) e devolve o TEXTO."""
import base64, glob, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); pdf = tmp / "teste.pdf"
subprocess.run([sys.executable, str(Path(__file__).parent / "gerar_pdf_teste_ocr.py"), str(pdf)], check=True)
dados = pdf.read_bytes(); PARTE = 9000      # partes pequenas para exercitar a junção
partes = [base64.b64encode(dados[i:i + PARTE]).decode() for i in range(0, len(dados), PARTE)]; print("partes:", len(partes), "bytes:", len(dados))
ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "pdf-studio.html?id=T1&aba=0&teste=1")
    ok = sw.evaluate("async () => { for (let i = 0; i < 40; i++) { try { const r = await chrome.runtime.sendMessage({ acao: 'pdf-studio-ping', id: 'T1' }); if (r && r.ok) return true; } catch (e) {} await new Promise((x) => setTimeout(x, 250)); } return false; }")
    assert ok, "a página não respondeu ao ping"
    sw.evaluate("async (partes) => { for (let n = 0; n < partes.length; n++) { const r = await chrome.runtime.sendMessage({ acao: 'pdf-studio-parte', id: 'T1', n, dados: partes[n] }); if (!r || !r.ok) throw new Error('parte ' + n); } await chrome.runtime.sendMessage({ acao: 'pdf-studio-fim', id: 'T1' }); }", partes)
    for _ in range(240):
        r = pg.evaluate("document.body.dataset.resultado || ''")
        if r: break
        pg.wait_for_timeout(500)
    else: raise AssertionError("sem resultado em 120 s")
    m = json.loads(r); print({k: v for k, v in m.items() if k != "texto"}); t = m["texto"]; print(t[:900])
    assert m["ok"] and m["paginas"] == 2 and m["ocr"] == 1 and m["paginasOcr"] == [2], m
    assert "[Página 1 de 2]" in t and "[Página 2 de 2]" in t and "|" not in t.split("[Página 2 de 2]")[0][-30:], "marcadores simples"
    assert "alimentos" in t.lower(), "texto da página normal"
    img = t.split("[Página 2 de 2]")[1].lower()
    assert "comprovante" in img and ("gabriel" in img or "nogueira" in img) , "OCR leu a página de imagem: " + img[:300]
    assert "5284265-91.2018.8.09.0006" in t, "o carimbo do Projudi continua no texto da página"
    print("OK")
