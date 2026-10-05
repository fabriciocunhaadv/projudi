"""Fila completa: dois processos + base de conhecimento do Studio + análise automática no Studio (simulados). Antes: dois processos -> abre cada um, pede o PDF completo, OCR, salva número-OCR.pdf."""
import json
import base64, glob, http.server, os, shutil, subprocess, sys, tempfile, threading, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
PROC = """<html><head><meta charset="utf-8"><title>Processo</title></head><body><h3>Processo %s</h3>
<a href="#" onclick="window.open('/PdfServico/GerarPDF?usu=1&chave=2&token=%s','pdf','width=900,height=600');return false">Gerar PDF de Processo Completo</a><iframe id="ed" srcdoc="&lt;body contenteditable&gt;&lt;p&gt;inicio&lt;/p&gt;&lt;/body&gt;"></iframe></body></html>"""
GERAR = """<html><head><meta charset="utf-8"><title>Gerar PDF</title></head><body><div id="ListaCheckBox"><ul>
<li><input type="checkbox" name="chk0" id="todos" value="0" onclick="document.querySelectorAll('input[name=chk1],input[name=chk2]').forEach(c=>c.checked=this.checked)"><strong>Todos os Arquivos</strong><ul>
<li>1<input type="checkbox" name="chk1" selecao="nivel1" value="11"><strong>Petição Enviada</strong><ul><li><input type="checkbox" name="chk2" pai="11" value="101"> <strong>acao.pdf</strong></li></ul></li>
</ul></li></ul><div id="Volumes"><input type="radio" name="myradio" onclick="document.getElementById('divGerarPdf').style.display='block'" value="1">Volume 1</div></div>
<div id="divGerarPdf" style="display:none"><form id="formListaArquivos" method="POST" action="GerarPDF" onsubmit="return false"><input type="hidden" name="PaginaAtual" value="1">
<button type="submit" id="operacao" name="operacao" value="GerarPDF"> Gerar Processo em PDF </button></form></div></body></html>"""
PDF = {}
CORPOS = []


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path.startswith("/proc"):
            corpo = (PROC % (s.path, uuid.uuid4().hex[:6])).encode()
        elif s.path.startswith("/PdfServico"):
            corpo = GERAR.encode()
        else:
            corpo = b""
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)

    def do_POST(s):
        CORPOS.append(s.rfile.read(int(s.headers["Content-Length"])).decode())
        s.send_response(200); s.send_header("Content-Type", "application/pdf"); s.send_header("Content-Length", str(len(PDF["b"]))); s.end_headers(); s.wfile.write(PDF["b"])

    def log_message(*a): pass


STUDIO = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body>
<button title="Nova Análise" onclick="novaAnalise()">Nova Análise</button>
<button title="Teses &amp; Modelos" onclick="document.getElementById('modal').style.display='block'">Teses &amp; Modelos</button>
<select id="promptsel"><option value="a">Outros Área Judicial - Criminal</option><option value="b">Outros Área Judicial - Família e Sucessões</option><option value="c">Outros Área Judicial - Juizado Especial Cível</option></select>
<div id="tour-input-panel"><button>PDF</button><button>Texto / Casos</button><button>Auto-Detectar</button><button>Sentença</button>
 <div id="drop"><input accept="application/pdf,.pdf" multiple class="hidden" type="file" id="autos"><span id="nomearq"></span></div>
 <button id="tour-execute-btn" onclick="executar()">Gerar Minuta Judicial</button></div>
<div class="bg-white border rounded"><div class="p-3.5 border-b flex"><div class="flex items-center gap-2"><h3>Resultado &amp; Análise</h3></div><div id="barra" class="flex items-center gap-1.5 opacity-50 pointer-events-none text-xs"><button>Editar</button><button title="Copiar" onclick="navigator.clipboard.writeText(window.__min)">Copiar</button></div></div><div id="res"><h4>Aguardando Execução</h4></div></div>
<div id="modal" style="display:none"><button onclick="this.parentElement.style.display='none'">Fechar</button>
 <button id="tour-teses-base-conhecimento-tab" onclick="document.getElementById('base').style.display='block'">Base de Conhecimento</button>
 <div id="base" style="display:none"><div class="bg-slate-50 border relative"><span>Base de Conhecimento do Gabinete (Nuvem):</span><button>Adicionar PDF</button><input accept="application/pdf,.pdf" multiple class="hidden" type="file" id="base-input"><div id="docs"></div></div></div></div>
<script>
window.__analises = [];
function novaAnalise(){ document.getElementById('nomearq').textContent=''; document.getElementById('autos').value=''; const r=document.getElementById('res'); r.innerHTML='<h4>Aguardando Execução</h4>'; document.querySelector('.pointer-events-none-x'); document.getElementById('barra').className='flex items-center gap-1.5 opacity-50 pointer-events-none text-xs'; }
document.getElementById('autos').addEventListener('change', e => { document.getElementById('nomearq').textContent = e.target.files[0].name; window.__ultimo = {nome: e.target.files[0].name, tam: e.target.files[0].size}; });
function executar(){ const b=document.getElementById('tour-execute-btn'); b.disabled=true; b.textContent='Analisando…';
  setTimeout(()=>{ const sel=document.getElementById('promptsel'); window.__analises.push({prompt: sel.options[sel.selectedIndex].text, ...window.__ultimo});
    window.__min='SENTENÇA\\n\\nVistos, etc.\\n\\nJulgo **procedente** o pedido formulado.'; document.getElementById('res').innerHTML='<p>MINUTA GERADA</p>'; document.getElementById('barra').className='flex items-center gap-1.5 text-xs';
    b.disabled=false; b.textContent='Gerar Minuta Judicial'; }, 1200); }
function excluir(b){ if(confirm('Excluir?')) b.closest('div.border').remove() }
function adicionar(nome){ const d=document.createElement('div'); d.className='p-2.5 bg-white border rounded-lg'; d.innerHTML='<input type="checkbox" checked><div class="min-w-0"><p class="text-xs font-bold truncate" title="'+nome+'">'+nome+'</p><div class="flex"><span>2 MB</span></div></div><button title="Excluir documento da base permanentemente" onclick="excluir(this)">x</button>'; document.getElementById('docs').appendChild(d) }
document.getElementById('base-input').addEventListener('change', e => { for (const f of e.target.files) setTimeout(()=>adicionar(f.name), 300); });
</script></body></html>"""


DOCSREQ = []
class HD(http.server.BaseHTTPRequestHandler):
    def do_POST(s):
        n = int(s.headers.get("Content-Length") or 0); corpo = json.loads(s.rfile.read(n) or b"{}")
        DOCSREQ.append((s.path, s.headers.get("Authorization"), corpo))
        s.send_response(200); s.send_header("Content-Type", "application/json"); s.end_headers(); s.wfile.write(json.dumps({"documentId": "DOC123"}).encode())
    def do_GET(s):
        if s.path.startswith("/v1/documents/"):
            corpo = json.dumps({"body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": "SENTENÇA\n"}}]}}, {"paragraph": {"elements": [{"textRun": {"content": "Julgo procedente o pedido CORRIGIDO.\n"}}]}}]}}).encode(); tipo = "application/json"
        else: corpo = b"<html><title>doc</title>doc</html>"; tipo = "text/html"
        s.send_response(200); s.send_header("Content-Type", tipo); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass


class HS(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(STUDIO.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://*.ai.studio/*", "http://127.0.0.1/*").replace("https://docs.google.com/document/*", "http://127.0.0.1/*"))
    d = ext / "docs-api.js"; d.write_text(d.read_text().replace("https://docs.googleapis.com/v1/documents", "http://127.0.0.1:8777/v1/documents").replace("https://docs.google.com/document/d/", "http://127.0.0.1:8777/d/").replace("const token = () =>", "const token = async () => 'tok-teste'; const _t = () =>"))
    m.write_text(m.read_text().replace("COLE_AQUI_O_CLIENT_ID", "teste"))
    c = ext / "studio-cliente.js"; c.write_text(c.read_text().replace("https://assessor-judicial.ai.studio/", "http://127.0.0.1:8774/"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8770), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    srvd = http.server.HTTPServer(("127.0.0.1", 8777), HD); threading.Thread(target=srvd.serve_forever, daemon=True).start()
    srv2 = http.server.HTTPServer(("127.0.0.1", 8774), HS)
    threading.Thread(target=srv2.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        aux = ctx.new_page(); gerar_pdf(aux, tmp / "scan.pdf")      # página 1 nativa + 2 escaneadas
        aux.set_content("<html><body></body></html>"); aux.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
        b64 = aux.evaluate("""async (b64) => { const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib; const d = await PDFDocument.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
          const f = await d.embedFont(StandardFonts.HelveticaBold); let k = 0;
          for (const p of d.getPages()) { const { width, height } = p.getSize(); k++;
            const L = ['Processo: 5293296-60.2026.8.09.0166', 'Movimentacao ' + (k < 2 ? 1 : 8) + ' : ' + (k < 2 ? 'Peticao Enviada' : 'Juntada -> Peticao'), 'Arquivo ' + k + ': doc' + k + '.pdf - Pag.1/1'];
            L.forEach((t, i) => p.drawText(t, { x: 20, y: height - 14 - i * 10, size: 8, font: f, color: rgb(1, 0, 0) }));
            p.drawText('Usuario: FULANO 02/10/2026 17:36 PROJUDI', { x: width - 12, y: height - 60, size: 8, font: f, color: rgb(1, 0, 0), rotate: degrees(-90) }); }
          const b = await d.save(); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }""", base64.b64encode((tmp / "scan.pdf").read_bytes()).decode())
        PDF["b"] = base64.b64decode(b64); aux.close()

        SERV = "Montes Claros de Goias - Vara de Família e Sucessões - GO"
        sw.evaluate("(m) => chrome.storage.local.set({ modelos: m })", {"atualizadoEm": 1790000000000, "serventias": {SERV: {"modelos": [
            {"id": 504007, "nome": "Citação Edital", "tipo": "Decisão", "texto": "Defiro a citação por edital."},
            {"id": 700001, "nome": "Sentença Padrão", "tipo": "Sentença", "texto": "Julgo procedente o pedido."}]}}})
        studio = ctx.new_page(); studio.goto("http://127.0.0.1:8774/")
        pg = ctx.new_page(); pg.goto(f"chrome-extension://{ext_id}/lote.html")
        base = {"serventia": SERV, "classificador": "Emilly - minutando", "pasta": "Projudi/2026-10-02/Emilly", "prompt": "Outros Área Judicial - Família e Sucessões", "arquivoModelos": "Família - Decisões, Despachos e Sentenças"}
        itens = [{**base, "processo": "5293296-60.2026.8.09.0166", "url": "http://localhost:8770/proc?id=1"},
                 {**base, "processo": "5000001-11.2026.8.09.0166", "url": "http://localhost:8770/proc?id=2"}]
        sw.evaluate("(j) => chrome.storage.local.set({ lote_t1: j })", {"itens": itens, "pasta": "Projudi", "opcoes": {"atualizarBase": True, "studio": {"ativo": True, "modo": "analise", "docs": True}}})
        pg.goto(f"chrome-extension://{ext_id}/lote.html?lote=t1")
        for k in range(60):
            if pg.evaluate("() => document.body.dataset.pronto") == "1": break
            if k % 2 == 0: print(k * 10, "s |", pg.inner_text("#base").replace("\n", " / "), "|", pg.inner_text("#lista").replace("\n", " / "), "|", [p.url[-45:] for p in ctx.pages], flush=True)
            pg.wait_for_timeout(10000)
        print(pg.inner_text("#lista")); print(pg.inner_text("#status"))
        assert "2 de 2 processo(s) baixado(s)" in pg.inner_text("#status")
        assert len(CORPOS) == 2, CORPOS
        fins = [sw.evaluate("(k) => chrome.storage.local.get(k)", f"lote_fim_t1:{i}")[f"lote_fim_t1:{i}"] for i in (0, 1)]
        print(fins)
        print(pg.inner_text("#base"))
        assert "documento cadastrado" in pg.inner_text("#base") and "Família - Decisões, Despachos e Sentenças.pdf" in pg.inner_text("#base")
        assert pg.inner_text("#lista").count("na esteira de minutas") == 2, pg.inner_text("#lista")
        docs = studio.eval_on_selector_all("p[title]", "ps => ps.map(p => p.getAttribute('title'))"); assert docs == ["Família - Decisões, Despachos e Sentenças.pdf"], docs

        # ---- esteira: um processo por vez (Studio -> Docs -> conferência -> Projudi) ----
        def estados():
            return sw.evaluate("async () => { const o = (await chrome.storage.local.get('esteira_ordem')).esteira_ordem || []; const d = await chrome.storage.local.get(o.map(i => 'esteira_' + i)); return o.map(i => d['esteira_' + i].estado) }")
        def espera(cond, rot, n=90):
            for _ in range(n):
                if cond(): return
                pg.wait_for_timeout(1000)
            raise AssertionError(rot + " " + str(sw.evaluate("async () => Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith('esteira_m')).map(([k, v]) => [v.estado, v.erro])")) + str(estados()) + str([x.url[-40:] for x in ctx.pages]))
        espera(lambda: estados() == ["conferindo", "aguardando"], "1º processo deveria estar em conferência e o 2º aguardando")
        assert len(studio.evaluate("window.__analises")) == 1                              # o 2º não foi ao Studio
        doc = [x for x in ctx.pages if x.url.startswith("http://127.0.0.1:8777/d/DOC123")][0]
        doc.wait_for_selector("[data-projudi-ext=esteira] #ok", state="attached", timeout=20000)
        assert any(x.url.startswith("blob:") for x in ctx.pages), [x.url for x in ctx.pages]       # PDF aberto ao lado
        doc.locator("[data-projudi-ext=esteira] #ok").click()
        espera(lambda: estados()[0] == "cadastrando", "deveria ir para o Projudi")
        assert estados()[1] == "aguardando"                                                  # a fila só avança depois do lançamento
        proj = [x for x in ctx.pages if x.url.startswith("http://localhost:8770/proc?id=1") and x.locator("[data-projudi-ext=esteira]").count()][0]
        proj.wait_for_selector("[data-projudi-ext=esteira] #cop", state="attached", timeout=20000)        # só "Copiar minuta" e "Lancei"; nada é lançado no editor
        assert proj.locator("[data-projudi-ext=esteira] #ins").count() == 0
        assert "inicio" == [f for f in proj.frames if f != proj.main_frame][0].inner_text("body").strip()      # o editor do Projudi não foi tocado
        proj.locator("[data-projudi-ext=esteira] #ok").click()
        espera(lambda: estados()[0] == "concluido" and estados()[1] in ("analisando", "conferindo") and len(studio.evaluate("window.__analises")) == 2, "2º deveria seguir para o Studio")
        analises = studio.evaluate("window.__analises"); print(analises)
        assert len(analises) == 2 and all(a["prompt"] == "Outros Área Judicial - Família e Sucessões" for a in analises), analises
        assert [a["nome"] for a in analises] == ["5293296-60.2026.8.09.0166-OCR.pdf", "5000001-11.2026.8.09.0166-OCR.pdf"]
        print(DOCSREQ)
        assert DOCSREQ[0][2] == {"title": "5293296-60.2026.8.09.0166 – sentença"} and DOCSREQ[0][1] == "Bearer tok-teste"
        rq = DOCSREQ[1][2]["requests"]; assert rq[0]["insertText"]["text"] == "SENTENÇA\nVistos, etc.\nJulgo procedente o pedido formulado."
        assert any(r.get("updateParagraphStyle", {}).get("paragraphStyle", {}).get("alignment") == "JUSTIFIED" for r in rq)
        pdf = subprocess.run(["pdftotext", "-layout", fins[0]["pdf"], "-"], capture_output=True, text=True).stdout.lower(); pdf = " ".join(pdf.split())
        ctx.close()
    assert "5293296-60.2026.8.09.0166" in pdf and "movimentacao 8 : juntada" in pdf       # carimbo do Projudi preservado
    assert "pensão alimentícia" in pdf and "guarda compartilhada" in pdf                  # texto das páginas-imagem, com OCR
    assert pdf.count("movimentacao 8 : juntada") == 2                                      # uma por página: o OCR não duplicou o carimbo

    print("OK")


main()
