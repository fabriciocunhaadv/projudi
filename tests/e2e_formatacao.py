"""Teste ponta a ponta da formatação: extensão carregada, editor simulado (iframe que reescreve o documento, como o TinyMCE)."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAGINA = """<html><body><h3>Editor Texto</h3><div id="ed"></div><script>
const f = document.createElement('iframe'); f.id = 'ed_ifr'; f.style.cssText = 'width:700px;height:400px'; f.src = 'about:blank';
document.getElementById('ed').appendChild(f);
setTimeout(() => {   // o TinyMCE faz isto: reescreve o documento do quadro (apaga listeners)
  const d = f.contentWindow.document; d.open();
  d.write('<!DOCTYPE html><html><head></head><body id="tinymce" contenteditable="true"><p><br></p></body></html>'); d.close();
}, 600);
</script></body></html>"""
WORD = ("<html><body><p class=MsoNormal align=center style='text-align:center'><b><span style='font-size:14pt;font-family:Arial'>EXCELENTÍSSIMO SENHOR</span></b></p>"
        "<p class=MsoNormal style='text-align:justify'><span style='font-family:Calibri;font-size:11pt;color:red'>Primeiro parágrafo da minuta.</span></p>"
        "<p class=MsoNormal style='margin-left:113pt'><span style='font-size:10pt'>Citação recuada vinda do Word.</span></p></body></html>")


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        s.wfile.write(PAGINA.encode())
    def log_message(*a): pass


def colar(frame, html, txt=""):
    frame.evaluate("""([h, t]) => { const dt = new DataTransfer(); if (h) dt.setData('text/html', h); dt.setData('text/plain', t);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", [html, txt])


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8766), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        pg = ctx.new_page(); pg.goto("http://localhost:8766/")
        pg.wait_for_timeout(2500)   # o quadro foi reescrito: a extensão precisa reanexar os ouvintes
        ed = [f for f in pg.frames if f != pg.main_frame][0]
        assert ed.locator("[data-projudi-ext]").count() == 1, "botões da extensão não apareceram no editor"
        ed.click("body"); ed.wait_for_timeout(200)

        # 1) colar do Word => entra formatado no padrão
        colar(ed, WORD)
        ed.wait_for_timeout(300)
        corpo = ed.evaluate("document.body.innerHTML")
        print(corpo)
        assert "Calibri" not in corpo and "Arial" not in corpo and "color" not in corpo and "MsoNormal" not in corpo
        ps = ed.evaluate("[...document.body.querySelectorAll('p')].map(p => ({t: p.textContent, fs: p.style.fontSize, ti: p.style.textIndent, ml: p.style.marginLeft, ta: p.style.textAlign}))")
        assert [x["t"] for x in ps if x["t"].strip()] == ["EXCELENTÍSSIMO SENHOR", "Primeiro parágrafo da minuta.", "Citação recuada vinda do Word."], ps
        corpo_p = [x for x in ps if x["t"].startswith("Primeiro")][0]
        assert corpo_p["fs"] == "16px" and corpo_p["ta"] == "justify" and corpo_p["ti"] == "2.5cm", corpo_p
        cit = [x for x in ps if x["t"].startswith("Citação")][0]
        assert cit["fs"] == "14px" and cit["ml"] == "4cm", cit
        assert [x for x in ps if x["t"].startswith("EXCEL")][0]["ta"] == "center"

        # 2) trecho curto no meio de um parágrafo não vira parágrafo novo
        ed.evaluate("""() => { const p = [...document.querySelectorAll('p')].find(p => p.textContent.startsWith('Primeiro')); const r = document.createRange();
          r.setStart(p.firstChild, 9); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
        antes = ed.evaluate("document.querySelectorAll('p').length")
        colar(ed, "", "XYZ"); ed.wait_for_timeout(200)
        assert ed.evaluate("document.querySelectorAll('p').length") == antes and "XYZ" in ed.evaluate("document.body.textContent")

        # 3) botão "Formatar minuta" reformata o que já está no editor
        ed.evaluate("""() => { document.body.innerHTML = "<p style='font-family:Arial;font-size:9px;color:red'>Texto solto antigo</p><p>Outro</p>"; }""")
        ed.click("body"); ed.locator("[data-projudi-ext] button[data-a=formatar]").click(); ed.wait_for_timeout(300)
        fmt = ed.evaluate("[...document.querySelectorAll('p')].map(p => p.style.fontSize + '|' + p.style.textAlign + '|' + p.style.color)")
        assert fmt == ["16px|justify|", "16px|justify|"], fmt

        # 4) "Aprender texto": formato um parágrafo à mão (12pt, recuo 1,25cm) e a extensão grava esse padrão
        ed.evaluate("""() => { document.body.innerHTML = "<p id='x' style=\\"font-family:Georgia;font-size:12pt;text-align:justify;text-indent:1.25cm\\">Meu padrão</p>";
          const r = document.createRange(); r.setStart(document.getElementById('x').firstChild, 3); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
        ed.locator("[data-projudi-ext] button[data-a=aprender-texto]").click(); ed.wait_for_timeout(500)
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        gravado = sw.evaluate("chrome.storage.sync.get('formatacao')")["formatacao"]["texto"]
        print(gravado)
        assert gravado["fontSize"] == "12pt" and "Georgia" in gravado["fontFamily"] and gravado["textIndent"] == "1.25cm"
        # e a próxima colagem já usa o padrão aprendido
        ed.evaluate("document.body.innerHTML = '<p><br></p>'"); ed.click("body")
        colar(ed, "<p>Novo parágrafo colado</p>"); ed.wait_for_timeout(300)
        p = ed.evaluate("(() => { const p = document.querySelector('p'); return p.style.fontSize + '|' + p.style.textIndent; })()")
        assert p == "12pt|1.25cm", p

        # 5) fora de editor e em campos de texto a extensão não interfere
        pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<input id=\"campo\"><textarea id=\"area\"></textarea>')")
        pg.fill("#campo", "abc")
        assert pg.input_value("#campo") == "abc"
        ctx.close()
    print("OK")


if __name__ == "__main__":
    main()
