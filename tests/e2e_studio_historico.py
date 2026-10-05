"""'Usar a minuta do Studio': procura o número do processo no Histórico Local do app, carrega a minuta e a devolve."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
MIN = lambda n: f"""<div class="bg-white border"><div class="p-3 border-b"><div class="flex"><h3>Resultado &amp; Análise</h3></div><div id="tour-result-actions"><button title="Copiar">Copiar</button></div></div>
<div id="tour-result-tabs"><button>Minuta do Ato</button></div><div class="max-w-4xl font-serif"><div class="text-center"><p>PODER JUDICIÁRIO</p><div><span>SENTENÇA</span></div></div>
<div id="tour-meta-parties-box">Processo nº: {n}</div><div class="space-y-1.5"><h3>I - RELATÓRIO</h3><div class="markdown-body"><p>{("Minuta do processo " + n + ". ") * 12}</p></div></div></div></div>"""
PAG = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body><button title="Histórico Local" onclick="abrir()"><span>Histórico Local</span></button>
<div id="modal" style="display:none"><button title="Fechar" onclick="this.parentElement.style.display='none'">Fechar</button><input placeholder="Buscar processo, partes, assunto ou assessor..." oninput="filtrar(this.value)"><div id="cards"></div></div>
<div id="res">""" + MIN("5293296-60.2026.8.09.0166") + """</div>
<script>
const procs=["5293296-60.2026.8.09.0166","5527285-86.2026.8.09.0097","5565967-52.2026.8.09.0084"];
function abrir(){document.getElementById('modal').style.display='block';filtrar('')}
function filtrar(v){document.getElementById('cards').innerHTML=procs.filter(p=>p.includes(v)).map(p=>'<div class="card"><span>'+p+'</span><button onclick="carregar(\\''+p+'\\')">Carregar Minuta →</button></div>').join('')}
function carregar(p){document.getElementById('res').innerHTML=`""" + "${MINS[p]}" + """`;document.getElementById('modal').style.display='none'}
</script></body></html>"""
MINS = {p: MIN(p) for p in ["5293296-60.2026.8.09.0166", "5527285-86.2026.8.09.0097", "5565967-52.2026.8.09.0084"]}
import json
PAG = PAG.replace("`${MINS[p]}`", "MINS[p]").replace("const procs=", "const MINS=" + json.dumps(MINS) + ";const procs=")


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAG.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.ai.studio/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8779), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        pg = ctx.new_page(); pg.goto("http://localhost:8779/"); pg.wait_for_selector("[data-projudi-ext=studio-envio]", state="attached", timeout=20000)
        r = sw.evaluate("""async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost/*' }); return await chrome.tabs.sendMessage(t.id, { acao: 'studio-ler-minuta', processo: '5527285-86.2026.8.09.0097' }); }""")
        print(r["ok"], r.get("erro"), (r.get("minuta") or "")[:90])
        assert r["ok"] and "Minuta do processo 5527285-86.2026.8.09.0097." in r["minuta"] and "5293296" not in r["minuta"]
        r2 = sw.evaluate("""async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost/*' }); return await chrome.tabs.sendMessage(t.id, { acao: 'studio-ler-minuta', processo: '9999999-99.2026.8.09.0000' }); }""")
        print(r2)
        assert not r2["ok"] and "9999999-99.2026.8.09.0000" in r2["erro"]          # nunca devolve a minuta de outro processo
        ctx.close()
    print("OK")


main()
