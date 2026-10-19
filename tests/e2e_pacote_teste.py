"""Pacote de TESTE da extensão (publicacao-teste): reconhece o app de teste quando ele roda dentro da página do AI Studio
(aistudio.google.com/apps/<id>, com o app num quadro *.run.app) e NÃO age no app publicado."""
import glob, json, os, sys, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ZIP = sorted(Path(__file__).parent.parent.glob("publicacao-teste/projudi-extensao-TESTE-*.zip"))[-1]
APP_ID = "ce9bc744-6a53-4141-a2bf-80e69447e6b3"
APP = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body>
<div id="tour-input-panel"><select><option>Outros Área Judicial - Criminal</option></select></div>
<button id="tour-execute-btn">Gerar Minuta</button>
<script>document.documentElement.dataset.gigantes = JSON.stringify([{id:'g1', processo:'0000001-00.2026.8.09.0001', status:'lendo', historicoId:'', erro:''}]);</script></body></html>"""
MOLDURA_SIMPLES = f"<html><body><h1>AI Studio</h1><iframe src='https://ais-dev-teste.us-east1.run.app/?_aistudio_auth_token=x' style='width:800px;height:600px'></iframe></body></html>"
MOLDURA_ANINHADA = "<html><body><h1>AI Studio</h1><iframe src='https://sandbox-x.scf.usercontent.goog/shim' style='width:800px;height:600px'></iframe></body></html>"
INTERMEDIARIA = "<html><body><iframe src='https://ais-dev-teste.us-east1.run.app/' style='width:700px;height:500px'></iframe></body></html>"

def rodar(moldura, rotulo, url_topo):
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; zipfile.ZipFile(ZIP).extractall(ext)
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        def rota(route):
            u = route.request.url
            if "run.app" in u: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP)
            elif "usercontent.goog" in u: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=INTERMEDIARIA)
            else: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=moldura)
        ctx.route("https://aistudio.google.com/**", rota); ctx.route("https://ai.studio/**", rota); ctx.route("https://*.run.app/**", rota); ctx.route("https://*.usercontent.goog/**", rota)
        studio = ctx.new_page(); studio.goto(url_topo); studio.wait_for_timeout(2500)
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/modelos.html")
        r = pg.evaluate("""async () => { try { const m = await import('./studio-cliente.js'); const aba = await m.acharStudio(); const j = await m.consultarGigantes(); return { ok: true, aba: aba.url, jobs: j }; } catch (e) { return { ok: false, erro: String(e.message || e) }; } }""")
        print(rotulo, "->", json.dumps(r, ensure_ascii=False)[:300])
        ctx.close(); return r

topo = f"https://aistudio.google.com/apps/{APP_ID}?showAssistant=true&showPreview=true"
ok1 = rodar(MOLDURA_SIMPLES, "moldura com iframe run.app", topo)
ok2 = rodar(MOLDURA_ANINHADA, "moldura com iframe aninhado", topo)
ok3 = rodar(MOLDURA_SIMPLES, "link curto ai.studio/apps", f"https://ai.studio/apps/{APP_ID}")
falhas = [n for n, r in [("simples", ok1), ("aninhada", ok2), ("ai.studio", ok3)] if not (r["ok"] and r["jobs"] and r["jobs"][0]["id"] == "g1")]
print("FALHAS:", falhas or "nenhuma")
sys.exit(1 if falhas else 0)
