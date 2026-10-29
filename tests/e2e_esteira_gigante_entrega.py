"""Gigante concluído no Studio: a esteira traz a minuta (a do Histórico, gravada depois do pedido) e a entrega como as demais; com o Studio ocupado, espera ficar livre."""
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
function filtrar(v){document.getElementById('cards').innerHTML=procs.filter(p=>p.includes(v)).map(p=>'<div class="card"><span>'+p+'</span><small>21/10/2026 13:14</small><button onclick="carregar(\\''+p+'\\')">Carregar Minuta →</button></div>').join('')}
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
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://localhost/*"))
    c = ext / "studio-cliente.js"; c.write_text(c.read_text().replace('"https://judicial-mysql.assessor.net.br/"', '"http://localhost:8781/"'))
    srv = http.server.HTTPServer(("localhost", 8781), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    PROC = "5527285-86.2026.8.09.0097"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        pg = ctx.new_page(); pg.goto("http://localhost:8781/"); pg.wait_for_selector("[data-projudi-ext=studio-envio]", state="attached", timeout=20000)
        # o app informa um gigante concluído e um mapa em andamento
        pg.evaluate("""(p) => { document.documentElement.dataset.gigantes = JSON.stringify([{ id: 'gig-1', processo: p, status: 'concluido', historicoId: 'h1', fim: Date.now(), erro: '', serie: '', uniao: false, parte: 0 }]); document.documentElement.dataset.mapas = JSON.stringify([{ id: 'm1', status: 'lendo', feitas: 2, total: 6 }]); }""", PROC)
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        mapas = pg.evaluate("document.documentElement.dataset.mapas"); assert '"lendo"' in mapas
        er = ctx.new_page(); er.goto(base + "esteira.html"); er.wait_for_selector("body[data-executor='1']", timeout=20000); er.wait_for_timeout(3000)      # o executor zera “analisando/pausado” ao abrir: os itens só entram depois
        mod_js = "async (i, campos) => { const k = 'esteira_' + i; await chrome.storage.local.set({ [k]: { ...(await chrome.storage.local.get(k))[k], ...campos } }); }"
        def novo_item():
            o = ver.evaluate("""async () => { const id = 'busy-1'; const ord = (await chrome.storage.local.get('esteira_ordem')).esteira_ordem || [];
              await chrome.storage.local.set({ ['esteira_' + id]: { id, processo: '5000000-00.2026.8.09.0001', modo: 'turbo', pdfNome: 'y.pdf', estado: 'analisando', rodada: 1, criadoEm: Date.now() }, esteira_ordem: [...ord, id] }); return id; }""")
            a = ver.evaluate("""async (p) => { const m = await import('./esteira-banco.js'); const id = await m.enfileirar({ processo: p, modo: 'analise', pdfNome: 'x.pdf', prompt: 'x' }, new Uint8Array([1, 2, 3]));
              const k = 'esteira_' + id; await chrome.storage.local.set({ [k]: { ...(await chrome.storage.local.get(k))[k], estado: 'gigante', jobId: 'gig-1', criadoEm: new Date(2026, 9, 20, 10, 0).getTime() } }); return id; }""", PROC)
            return a, o
        # 1) Studio ocupado (outro item analisando): a esteira espera, sem mexer na tela do app
        a, o = novo_item(); er.wait_for_timeout(8000)
        est = lambda i: ver.evaluate("async (i) => { const m = await import('./esteira-banco.js'); const x = (await m.todos()).find((y) => y.id === i); return { estado: x.estado, minuta: (x.minuta || '').length, aviso: x.aviso || '' }; }", i)
        r = est(a); print("Studio ocupado:", r); assert r["estado"] == "gigante" and "ficar livre" in r["aviso"], r
        # 2) Studio livre: traz a minuta do Histórico e entrega
        ver.evaluate("async (o) => { const k = 'esteira_' + o; await chrome.storage.local.set({ [k]: { ...(await chrome.storage.local.get(k))[k], estado: 'concluido' } }); }", o)
        for _ in range(60):
            r = est(a)
            if r["estado"] != "gigante": break
            er.wait_for_timeout(1000)
        print("Studio livre:", r); assert r["estado"] in ("concluido", "conferindo") and r["minuta"] > 200, r
        print("OK"); ctx.close(); srv.shutdown(); return

if __name__ == '__main__':
    main()
