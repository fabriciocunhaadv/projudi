"""PDF único de modelos por serventia -> base de conhecimento do Studio (simulada): cadastra e, na segunda vez, SUBSTITUI (sem duplicar)."""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body>
<button title="Teses &amp; Modelos" onclick="abrir()">Teses &amp; Modelos</button>
<div class="dropzone"><input accept="application/pdf,.pdf" multiple class="hidden" type="file" id="principal"></div>
<div id="modal" style="display:none"><div>
 <button id="tour-teses-base-conhecimento-tab" onclick="document.getElementById('base').style.display='block'">Base de Conhecimento</button>
 <div id="base" style="display:none"><div class="bg-slate-50 border relative"><span>Base de Conhecimento do Gabinete (Nuvem):</span>
   <button>Adicionar PDF</button><input accept="application/pdf,.pdf" multiple class="hidden" type="file" id="base-input">
   <div id="docs"><div class="p-2.5 bg-white border rounded-lg"><input type="checkbox" checked><div class="min-w-0"><p class="text-xs font-bold truncate" title="Boletim.pdf">Boletim.pdf</p><div class="flex"><span>1 MB</span></div></div><button title="Visualizar texto">v</button><button title="Excluir documento da base permanentemente" onclick="excluir(this)">x</button></div></div>
 </div></div></div></div>
<script>
function abrir(){document.getElementById('modal').style.display='block'}
function excluir(b){ if(confirm('Excluir?')) b.closest('div.border').remove() }
function adicionar(nome){ const d=document.createElement('div'); d.className='p-2.5 bg-white border rounded-lg'; d.innerHTML='<input type="checkbox" checked><div class="min-w-0"><p class="text-xs font-bold truncate" title="'+nome+'">'+nome+'</p><div class="flex"><span>2 MB</span><span>• 9 págs</span></div></div><button title="Visualizar texto">v</button><button title="Excluir documento da base permanentemente" onclick="excluir(this)">x</button>'; document.getElementById('docs').appendChild(d) }
document.getElementById('base-input').addEventListener('change', e => { for (const f of e.target.files) setTimeout(()=>adicionar(f.name), 300); window.__enviados=(window.__enviados||[]).concat([[...e.target.files].map(f=>f.name+':'+f.size)]) });
document.getElementById('principal').addEventListener('change', () => { window.__errado = true });
</script></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(PAG.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.ai.studio/*", "http://localhost/*"))
    j = ext / "modelos.js"; j.write_text(j.read_text().replace("https://assessor-judicial.ai.studio/", "http://localhost:8773/"))
    srv = http.server.HTTPServer(("localhost", 8773), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, accept_downloads=True,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        modelos = {"atualizadoEm": 1790000000000, "serventias": {"Montes Claros de Goias - Vara de Família e Sucessões": {"modelos": [
            {"id": 504007, "nome": "Citação Edital", "tipo": "Decisão", "texto": "Defiro a citação por edital.\nÉ necessário observar o art. 256 do CPC. " + "texto longo " * 200},
            {"id": 504002, "nome": "Arbitramento Honorários Dativo", "tipo": "Decisão", "texto": "Arbitro honorários ao advogado dativo."},
            {"id": 600001, "nome": "Mero expediente", "tipo": "Despacho", "texto": "Cite-se. Intime-se."},
            {"id": 700001, "nome": "Sentença Padrão", "tipo": "Sentença", "texto": "Julgo procedente o pedido."}]}}}
        sw.evaluate("(m) => chrome.storage.local.set({ modelos: m })", modelos)
        studio = ctx.new_page(); studio.goto("http://localhost:8773/")
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/modelos.html")
        pg.wait_for_selector("body[data-pronto='1']")
        assert "4 modelo(s)" in pg.inner_text("#lista") and "Decisão: 2" in pg.inner_text("#lista")
        nome_arq = pg.input_value("#n-0"); print(nome_arq)
        assert "Decisões, Despachos e Sentenças" in nome_arq

        def enviar():
            pg.evaluate("() => { delete document.body.dataset.enviado; delete document.body.dataset.erro; }")
            pg.click("button[data-a=enviar]")
            for _ in range(240):
                if pg.evaluate("() => !!(document.body.dataset.enviado || document.body.dataset.erro)"): break
                pg.wait_for_timeout(250)
            assert pg.evaluate("() => document.body.dataset.erro") is None, pg.evaluate("() => document.body.dataset.erro")
            return json.loads(pg.evaluate("() => document.body.dataset.enviado"))
        r1 = enviar(); print(r1)
        assert r1["ok"] and not r1["substituiu"] and r1["quantos"] == 1
        # segunda vez: o documento já existe -> a extensão NÃO exclui sozinha; avisa para excluir o antigo
        pg.evaluate("() => { delete document.body.dataset.enviado; delete document.body.dataset.erro; delete document.body.dataset.existe; }")
        pg.click("button[data-a=enviar]")
        for _ in range(240):
            if pg.evaluate("() => !!document.body.dataset.existe"): break
            pg.wait_for_timeout(250)
        assert "Já existe" in pg.inner_text("#m-0") and "exclua o documento antigo" in pg.inner_text("#m-0"), pg.inner_text("#m-0")
        assert studio.eval_on_selector_all("p[title]", "ps => ps.length") == 2           # nada foi excluído nem duplicado
        # o usuário escolhe substituir: exclui o antigo e envia o novo
        pg.click("button[data-substituir='1']")
        for _ in range(240):
            if pg.evaluate("() => !!document.body.dataset.enviado"): break
            pg.wait_for_timeout(250)
        r2 = json.loads(pg.evaluate("() => document.body.dataset.enviado")); print(r2)
        assert r2["ok"] and r2["substituiu"] and r2["quantos"] == 1
        titulos = studio.eval_on_selector_all("p[title]", "ps => ps.map(p => p.getAttribute('title'))")
        print(titulos)
        assert titulos.count(nome_arq + ".pdf") == 1 and "Boletim.pdf" in titulos      # outros documentos da base intactos
        assert studio.evaluate("window.__errado") is None                         # não usou o campo de envio da tela principal
        enviados = studio.evaluate("window.__enviados"); assert len(enviados) == 2
        # o PDF gerado tem texto, índice e cada modelo com Id/nome/tipo
        b64 = pg.evaluate("""async (m) => { const { montarPdf } = await import('./modelos-pdf.js'); const b = await montarPdf({ serventia: 'Vara de Família', modelos: m }); let s=''; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }""", modelos["serventias"]["Montes Claros de Goias - Vara de Família e Sucessões"]["modelos"])
        import base64, subprocess
        (tmp / "m.pdf").write_bytes(base64.b64decode(b64))
        txt = subprocess.run(["pdftotext", "-layout", str(tmp / "m.pdf"), "-"], capture_output=True, text=True).stdout
        flat = " ".join(txt.split())
        for trecho in ["MODELOS DO GABINETE", "ÍNDICE", "504007 — Citação Edital", "[Decisão] Modelo 504007 — Citação Edital", "Defiro a citação por edital.", "[Despacho] Modelo 600001", "[Sentença] Modelo 700001", "Julgo procedente o pedido."]:
            assert trecho in flat, trecho
        assert flat.index("[Decisão] Modelo 504002") < flat.index("[Decisão] Modelo 504007") < flat.index("[Despacho]") < flat.index("[Sentença]")
        ctx.close()
    print("OK")


main()
