"""Fila completa: dois processos + base de conhecimento do Studio + análise automática no Studio (simulados). Antes: dois processos -> abre cada um, pede o PDF completo, OCR, salva número-OCR.pdf e número-OCR.txt com a origem de cada trecho."""
import base64, glob, http.server, os, shutil, subprocess, sys, tempfile, threading, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
PROC = """<html><head><meta charset="utf-8"><title>Processo</title></head><body><h3>Processo %s</h3>
<a href="#" onclick="window.open('/PdfServico/GerarPDF?usu=1&chave=2&token=%s','pdf','width=900,height=600');return false">Gerar PDF de Processo Completo</a></body></html>"""
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
<div class="bg-white border rounded"><div class="p-3.5 border-b flex"><div class="flex items-center gap-2"><h3>Resultado &amp; Análise</h3></div><div class="flex items-center gap-1.5 opacity-50 pointer-events-none text-xs"><button>Editar</button></div></div><div id="res"><h4>Aguardando Execução</h4></div></div>
<div id="modal" style="display:none"><button onclick="this.parentElement.style.display='none'">Fechar</button>
 <button id="tour-teses-base-conhecimento-tab" onclick="document.getElementById('base').style.display='block'">Base de Conhecimento</button>
 <div id="base" style="display:none"><div class="bg-slate-50 border relative"><span>Base de Conhecimento do Gabinete (Nuvem):</span><button>Adicionar PDF</button><input accept="application/pdf,.pdf" multiple class="hidden" type="file" id="base-input"><div id="docs"></div></div></div></div>
<script>
window.__analises = [];
function novaAnalise(){ document.getElementById('nomearq').textContent=''; document.getElementById('autos').value=''; const r=document.getElementById('res'); r.innerHTML='<h4>Aguardando Execução</h4>'; document.querySelector('.pointer-events-none-x'); document.querySelector('.border .flex.items-center.gap-1\\.5').className='flex items-center gap-1.5 opacity-50 pointer-events-none text-xs'; }
document.getElementById('autos').addEventListener('change', e => { document.getElementById('nomearq').textContent = e.target.files[0].name; window.__ultimo = {nome: e.target.files[0].name, tam: e.target.files[0].size}; });
function executar(){ const b=document.getElementById('tour-execute-btn'); b.disabled=true; b.textContent='Analisando…';
  setTimeout(()=>{ const sel=document.getElementById('promptsel'); window.__analises.push({prompt: sel.options[sel.selectedIndex].text, ...window.__ultimo});
    document.getElementById('res').innerHTML='<p>MINUTA GERADA</p>'; document.querySelector('.border .flex.items-center.gap-1\\.5').className='flex items-center gap-1.5 text-xs';
    b.disabled=false; b.textContent='Gerar Minuta Judicial'; }, 1200); }
function excluir(b){ if(confirm('Excluir?')) b.closest('div.border').remove() }
function adicionar(nome){ const d=document.createElement('div'); d.className='p-2.5 bg-white border rounded-lg'; d.innerHTML='<input type="checkbox" checked><div class="min-w-0"><p class="text-xs font-bold truncate" title="'+nome+'">'+nome+'</p><div class="flex"><span>2 MB</span></div></div><button title="Excluir documento da base permanentemente" onclick="excluir(this)">x</button>'; document.getElementById('docs').appendChild(d) }
document.getElementById('base-input').addEventListener('change', e => { for (const f of e.target.files) setTimeout(()=>adicionar(f.name), 300); });
</script></body></html>"""


class HS(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(STUDIO.encode())
    def log_message(*a): pass


def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://*.ai.studio/*", "http://127.0.0.1/*"))
    c = ext / "studio-cliente.js"; c.write_text(c.read_text().replace("https://assessor-judicial.ai.studio/", "http://127.0.0.1:8774/"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    srv = http.server.HTTPServer(("localhost", 8770), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
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
        sw.evaluate("(j) => chrome.storage.local.set({ lote_t1: j })", {"itens": itens, "pasta": "Projudi", "opcoes": {"atualizarBase": True, "studio": {"ativo": True, "modo": "analise"}}})
        pg.goto(f"chrome-extension://{ext_id}/lote.html?lote=t1")
        pg.wait_for_selector("body[data-pronto='1']", timeout=900000)
        print(pg.inner_text("#lista")); print(pg.inner_text("#status"))
        assert "2 de 2 processo(s) baixado(s)" in pg.inner_text("#status")
        assert len(CORPOS) == 2, CORPOS
        fins = [sw.evaluate("(k) => chrome.storage.local.get(k)", f"lote_fim_t1:{i}")[f"lote_fim_t1:{i}"] for i in (0, 1)]
        print(fins)
        print(pg.inner_text("#base"))
        assert "documento cadastrado" in pg.inner_text("#base") and "Família - Decisões, Despachos e Sentenças.pdf" in pg.inner_text("#base")
        analises = studio.evaluate("window.__analises"); print(analises)
        assert len(analises) == 2 and all(a["prompt"] == "Outros Área Judicial - Família e Sucessões" for a in analises), analises
        assert [a["nome"] for a in analises] == ["5293296-60.2026.8.09.0166-OCR.pdf", "5000001-11.2026.8.09.0166-OCR.pdf"]
        assert pg.inner_text("#lista").count("análise concluída no Studio") == 2
        docs = studio.eval_on_selector_all("p[title]", "ps => ps.map(p => p.getAttribute('title'))"); assert docs == ["Família - Decisões, Despachos e Sentenças.pdf"], docs
        txt = Path(fins[0]["txt"]).read_text(encoding="utf-8")
        pdf = subprocess.run(["pdftotext", fins[0]["pdf"], "-"], capture_output=True, text=True).stdout.lower()
        ctx.close()
    print(txt[:1800])
    flat = " ".join(txt.lower().split())
    assert "processo 5293296-60.2026.8.09.0166" in flat and "índice" in flat
    assert "movimentação 1 (peticao enviada) | arquivo 1: doc1.pdf | pág. 1 de 1 do arquivo" in flat
    assert "movimentação 8 (juntada -> peticao) | arquivo 2: doc2.pdf" in flat and "[ocr]" in flat
    assert "pensão alimentícia" in flat and "guarda compartilhada" in flat          # texto das páginas-imagem, com OCR
    assert "pagina um com texto nativo" in flat                                       # texto nativo preservado
    assert flat.count("movimentacao 8 : juntada") == 2        # uma por página (2 e 3): o OCR não duplicou o carimbo
    assert "pensão alimentícia" in pdf
    print("OK")


main()
