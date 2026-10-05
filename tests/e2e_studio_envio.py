"""Botão na tela do Studio: envia a minuta aberta à esteira (estado 'recebida'), escolhendo o processo pelo número que está na tela."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body><div id="root"><div class="bg-white border"><div class="p-3 border-b"><div class="flex"><h3>Resultado &amp; Análise</h3></div><div id="tour-result-actions"><button title="Copiar">Copiar</button></div></div>
<div id="tour-result-tabs"><button>Minuta do Ato</button></div><div class="max-w-4xl font-serif select-text">
<div class="text-center"><p>PODER JUDICIÁRIO DO ESTADO DE GOIÁS</p><div class="pt-2"><span>SENTENÇA</span></div></div>
<div id="tour-meta-parties-box">Processo nº: 5527285-86.2026.8.09.0097 Autor</div>
<div class="space-y-1.5"><h3>I - RELATÓRIO</h3><div class="markdown-body"><p>""" + "Texto da minuta aberta pelo usuário. " * 12 + """</p></div></div>
<div class="space-y-1.5"><h3>III - DISPOSITIVO</h3><div class="markdown-body"><p>Diante do exposto, julgo procedente.</p></div></div></div></div></div></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAG.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.ai.studio/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8778), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        sw.evaluate("""() => chrome.storage.local.set({ esteira_ordem: ["a", "b"],
          esteira_a: { id: "a", processo: "5293296-60.2026.8.09.0166", estado: "pausado" },
          esteira_b: { id: "b", processo: "5527285-86.2026.8.09.0097", estado: "erro" } })""")
        pg = ctx.new_page(); pg.goto("http://localhost:8778/")
        pg.wait_for_selector("[data-projudi-ext=studio-envio] button", state="attached", timeout=20000)
        sel = pg.locator("[data-projudi-ext=studio-envio] select")
        assert sel.input_value() == "b", sel.input_value()                  # escolheu o processo pelo número que está na tela
        pg.locator("[data-projudi-ext=studio-envio] button").click(); pg.wait_for_timeout(800)
        it = sw.evaluate("async () => (await chrome.storage.local.get('esteira_b')).esteira_b")
        print(it["estado"], it["minutaRecebida"][:80])
        assert it["estado"] == "recebida" and "Texto da minuta aberta pelo usuário." in it["minutaRecebida"] and "III - DISPOSITIVO" in it["minutaRecebida"]
        assert sw.evaluate("async () => (await chrome.storage.local.get('esteira_a')).esteira_a.estado") == "pausado"
        ctx.close()
    print("OK")


main()
