"""Botão "Enviar ao Agaia" na tela do processo (Projudi) + preenchimento do ExecAgaia (opções extras e prompt da serventia)."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PROC = """<html><body><div>AUTOS</div><div><span>Número</span> <span id="n">5923249-54.2025.8.09.0166</span> <img src="data:,"></div><h4>DADOS DO PROCESSO</h4>
<div>OUTRAS INFORMAÇÕES</div><div>Serventia   Montes Claros de Goias - Vara de Familia e Sucessoes   Classe 69 - PROCESSO CÍVEL</div></body></html>"""
OPCOES = ["Outros Área Judicial - Sentença ", "Outros Área Judicial - Fabrício - JECRIM", "Outros Área Judicial - Fabrício Criminal", "Outros Área Judicial - Fabrício Cível",
          "Outros Área Judicial - Fabrício Família e Sucessões", "Outros Área Judicial - Fabrício Juizado Especial Criminal"]
AGAIA = """<html><body><input type="checkbox" id="consultar_juris_auto"><input type="checkbox" id="reanalisar_juris_auto"><input type="checkbox" id="incluir_contexto_ampliado_acuracia">
<input type="text" id="e_f444bb494c49" class="form-control js-ef-f" placeholder="Informe o número do processo 9999999.99.9999">
<select id="e_193b967734a3"><option value="" selected>-- Selecione um prompt --</option>""" + "".join(f'<option value="{i+1}">{t}</option>' for i, t in enumerate(OPCOES)) + """</select>
<script>document.getElementById('e_193b967734a3').addEventListener('change',e=>{window.escolhido=e.target.selectedOptions[0].text})</script></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        s.wfile.write((AGAIA if "/agaia" in s.path else PROC).encode())
    def log_message(*a): pass


tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
for f in ("manifest.json", "background.js"):
    t = (ext / f).read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/*").replace("https://simplesefacil.tjgo.jus.br/", "http://localhost:8781/").replace("https://*.tjgo.jus.br/*", "http://localhost/*")
    (ext / f).write_text(t)
srv = http.server.ThreadingHTTPServer(("localhost", 8781), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    pg = ctx.new_page(); pg.goto("http://localhost:8781/proc"); pg.wait_for_selector("[data-projudi-ext=agaia]", timeout=15000)
    with ctx.expect_page() as nova: pg.click("[data-projudi-ext=agaia]")
    ag = nova.value; ag.wait_for_load_state()
    ag.wait_for_function("document.documentElement.dataset.projudiAgaia", timeout=30000)
    print(ag.url, ag.evaluate("document.documentElement.dataset.projudiAgaia"), ag.evaluate("window.escolhido"))
    assert "numero_processo=5923249.54.2025" in ag.url and "acao_id=6" in ag.url
    assert ag.evaluate("document.documentElement.dataset.projudiAgaia") == "ok"
    assert ag.is_checked("#consultar_juris_auto") and ag.is_checked("#incluir_contexto_ampliado_acuracia") and not ag.is_checked("#reanalisar_juris_auto")
    assert ag.evaluate("window.escolhido") == "Outros Área Judicial - Fabrício Família e Sucessões"
    assert ag.input_value("#e_f444bb494c49") == "5923249.54.2025"
    ctx.close()
print("OK")
