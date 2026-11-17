"""“Refazer só com alguns eventos” (extensão 4.0.0), com Projudi e Studio simulados.
Studio pede (window.postMessage) -> extensão entra na serventia, abre o processo e a janela “Gerar PDF” SOZINHA -> botão verde “Devolver ao Studio”
-> baixa só os marcados, OCR, esteira -> o Studio recebe a análise com o aviso de “refazer” (versão 2, faixa de movimentações).
Também: processo sem serventia conhecida (pede a escolha) e processo achado pela lista da serventia."""
import base64, glob, http.server, json, os, shutil, sys, tempfile, threading, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from test_ocr import gerar_pdf   # noqa: E402

RAIZ = Path(__file__).parent.parent / "extensao"
falhas = 0
def ok(c, m):
    global falhas
    if not c: falhas += 1; print("FALHOU:", m)
    else: print("ok:", m)

PROC = """<html><head><meta charset="utf-8"><title>Processo</title></head><body><h3>Processo %s</h3>
<a href="#" onclick="window.open('/PdfServico/GerarPDF?usu=1&chave=2&token=%s','pdf','width=900,height=600');return false">Gerar PDF de Processo Completo</a></body></html>"""
GERAR = """<html><head><meta charset="utf-8"><title>Gerar PDF</title></head><body><div id="ListaCheckBox"><ul>
<li><input type="checkbox" name="chk0" id="todos" value="0"><strong>Todos os Arquivos</strong><ul>
<li>1<input type="checkbox" name="chk1" selecao="nivel1" value="11"><strong>Petição Enviada</strong><ul><li><input type="checkbox" name="chk2" pai="11" value="101"> <strong>acao.pdf</strong></li></ul></li>
<li>8<input type="checkbox" name="chk1" selecao="nivel8" value="18"><strong>Juntada -> Petição</strong><ul><li><input type="checkbox" name="chk2" pai="18" value="102"> <strong>manifestacao.pdf</strong></li></ul></li>
<li>9<input type="checkbox" name="chk1" selecao="nivel9" value="19"><strong>Decisão</strong><ul><li><input type="checkbox" name="chk2" pai="19" value="103"> <strong>decisao.html</strong></li></ul></li>
</ul></li></ul><div id="Volumes"><input type="radio" name="myradio" onclick="document.getElementById('divGerarPdf').style.display='block'" value="1">Volume 1</div></div>
<div id="divGerarPdf" style="display:none"><form id="formListaArquivos" method="POST" action="GerarPDF" onsubmit="return false"><input type="hidden" name="PaginaAtual" value="1">
<button type="submit" id="operacao" name="operacao" value="GerarPDF"> Gerar Processo em PDF </button></form></div></body></html>"""
LISTA = """<html><head><meta charset="utf-8"><title>Lista</title></head><body><table><tr><td><a href="/proc?Id_Processo=77">5000002-22.2026.8.09.0166</a></td></tr></table></body></html>"""
PDF = {}; CORPOS = []; VISITAS = []

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        VISITAS.append(s.path)
        if s.path.startswith("/proc"): corpo = (PROC % (s.path, uuid.uuid4().hex[:6])).encode()
        elif s.path.startswith("/PdfServico"): corpo = GERAR.encode()
        elif s.path.startswith("/PreAnalisarConclusao"): corpo = LISTA.encode()
        elif s.path.startswith("/serv"): corpo = b"<html><body>serventia</body></html>"
        else: corpo = b""
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)
    def do_POST(s):
        CORPOS.append(s.rfile.read(int(s.headers["Content-Length"])).decode())
        s.send_response(200); s.send_header("Content-Type", "application/pdf"); s.send_header("Content-Length", str(len(PDF["b"]))); s.end_headers(); s.wfile.write(PDF["b"])
    def log_message(*a): pass

lote = (Path(__file__).parent / "e2e_lote_studio.py").read_text(encoding="utf-8")
STUDIO = lote[lote.index('STUDIO = """') + len('STUDIO = """'): lote.index('"""', lote.index('STUDIO = """') + 12)]
# a análise simulada registra também o aviso de "refazer" que a extensão deixa na página
STUDIO = STUDIO.replace("window.__analises.push({prompt: sel.options[sel.selectedIndex].text, ...window.__ultimo});", "window.__analises.push({prompt: sel.options[sel.selectedIndex].text, refazer: document.documentElement.dataset.refazerPedido || '', ...window.__ultimo});")
assert "dataset.refazerPedido" in STUDIO

class HS(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(STUDIO.encode())
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"
    shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://judicial-mysql.assessor.net.br/*", "http://127.0.0.1/*"))
    c = ext / "studio-cliente.js"; c.write_text(c.read_text().replace("https://judicial-mysql.assessor.net.br/", "http://127.0.0.1:8774/"))
    (ext / "background.js").write_text((ext / "background.js").read_text().replace('const DOMINIO = "tjgo.jus.br";', 'const DOMINIO = "localhost";'))
    bg = ext / "background.js"; t = bg.read_text(); assert r"/^https:\/\/projudi\.tjgo\.jus\.br\//.test(m.serventiaUrl)" in t; bg.write_text(t.replace(r"/^https:\/\/projudi\.tjgo\.jus\.br\//.test(m.serventiaUrl)", r"/^http:\/\/localhost:8770\//.test(m.serventiaUrl)"))      # só na cópia de teste: o Projudi simulado fica em localhost
    (ext / "projudi-aba.js").write_text((ext / "projudi-aba.js").read_text().replace('"https://projudi.tjgo.jus.br/*"', '"http://localhost/*"'))
    r = ext / "refazer.js"; r.write_text(r.read_text().replace('const BASE = "https://projudi.tjgo.jus.br/";', 'const BASE = "http://localhost:8770/";'))
    srv = http.server.ThreadingHTTPServer(("localhost", 8770), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    srv2 = http.server.ThreadingHTTPServer(("127.0.0.1", 8774), HS); threading.Thread(target=srv2.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
            args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        sw.evaluate("() => chrome.storage.sync.set({ esteiraConfig: { continuo: false } })")
        aux = ctx.new_page(); gerar_pdf(aux, tmp / "scan.pdf")
        aux.set_content("<html><body></body></html>"); aux.add_script_tag(path=str(RAIZ / "vendor" / "pdf-lib.min.js"))
        b64 = aux.evaluate("""async (b64) => { const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib; const d = await PDFDocument.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
          const f = await d.embedFont(StandardFonts.HelveticaBold); let k = 0;
          for (const p of d.getPages()) { const { width, height } = p.getSize(); k++;
            const L = ['Processo: 5293296-60.2026.8.09.0166', 'Movimentacao ' + (k < 2 ? 1 : 8) + ' : ' + (k < 2 ? 'Peticao Enviada' : 'Juntada -> Peticao'), 'Arquivo ' + k + ': doc' + k + '.pdf - Pag.1/1'];
            L.forEach((t, i) => p.drawText(t, { x: 20, y: height - 14 - i * 10, size: 8, font: f, color: rgb(1, 0, 0) }));
            p.drawText('Usuario: FULANO 02/10/2026 17:36 PROJUDI', { x: width - 12, y: height - 60, size: 8, font: f, color: rgb(1, 0, 0), rotate: degrees(-90) }); }
          const b = await d.save(); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }""", base64.b64encode((tmp / "scan.pdf").read_bytes()).decode())
        PDF["b"] = base64.b64decode(b64); aux.close()

        PROCESSO = "5293296-60.2026.8.09.0166"
        sw.evaluate("(i) => chrome.storage.local.set({ esteira_ordem: ['mseed'], esteira_mseed: i })", {"id": "mseed", "processo": PROCESSO, "url": "http://localhost:8770/proc?id=1", "serventiaUrl": "http://localhost:8770/serv", "serventia": "Montes Claros de Goias - Vara de Família e Sucessões - GO", "prompt": "Outros Área Judicial - Família e Sucessões", "estado": "concluido", "modo": "analise", "criadoEm": 1})
        studio = ctx.new_page(); studio.goto("http://127.0.0.1:8774/")
        studio.wait_for_function("() => document.documentElement.dataset.assessorExtensaoRecursos")
        ok("refazer-parcial" in studio.evaluate("() => document.documentElement.dataset.assessorExtensaoRecursos"), "a extensão anuncia o recurso refazer-parcial")
        studio.evaluate("() => { window.__resp = []; window.addEventListener('message', (e) => { const d = e.data; if (d && d.__projudiResp === 'refazer-parcial') window.__resp.push(d); }); }")
        pedir = lambda proc, sv="": studio.evaluate("([p, sv]) => { window.__resp = []; window.postMessage({ __projudi: 'refazer-parcial', fase: 'iniciar', reqId: 'r' + Date.now(), processo: p, de: 'ana-1', prompt: 'Outros Área Judicial - Família e Sucessões', serventiaUrl: sv }, location.origin); }", [proc, sv])
        def espera_fim(n=60):
            for _ in range(n):
                f = studio.evaluate("() => window.__resp.find(x => x.tipo === 'fim') || null")
                if f: return f
                studio.wait_for_timeout(1000)
            raise AssertionError("a extensão não devolveu o fim: " + str(studio.evaluate("() => window.__resp")))

        # 1) fluxo principal: serventia e link vêm da esteira
        pedir(PROCESSO); fim = espera_fim()
        ok(fim["ok"] is True and "Gerar PDF" in fim["texto"], f"a extensão abriu a janela Gerar PDF: {fim}")
        ok(any(x["tipo"] == "progresso" for x in studio.evaluate("() => window.__resp")), "mandou andamento ao Studio")
        ok("/serv" in VISITAS and any(v.startswith("/proc?id=1") for v in VISITAS), f"entrou na serventia e abriu o processo: {VISITAS}")
        popup = next(x for x in ctx.pages if "/PdfServico/GerarPDF" in x.url); popup.wait_for_selector("[data-projudi-ext=gerarpdf] >> button[data-a=refazer]", timeout=15000)
        verde = popup.locator("[data-projudi-ext=gerarpdf] >> button[data-a=refazer]")
        ok("Devolver ao Studio e refazer a minuta" in verde.inner_text(), "o botão verde aparece na janela")
        ok(not popup.locator("[data-projudi-ext=gerarpdf] >> button[data-a=todos]").is_visible() and not popup.locator("[data-projudi-ext=gerarpdf] >> button[data-a=turbo]").is_visible(), "os botões de baixar tudo/Turbo ficam escondidos neste caminho")
        popup.screenshot(path="/tmp/claude-0/work/teste/refazer_popup.png")
        verde.click(); popup.wait_for_timeout(500)
        ok("Marque ao menos uma" in popup.locator("[data-projudi-ext=gerarpdf] >> .m").inner_text() and not CORPOS, "sem marcar nada: avisa e não baixa")
        for v in ("18", "19"): popup.check(f"input[name=chk1][value='{v}']")
        for v in ("102", "103"): popup.check(f"input[name=chk2][value='{v}']")
        verde.click()
        for k in range(60):
            if CORPOS: break
            if k in (3, 10): print("   (depois de", k, "s) mensagem da janela:", popup.locator("[data-projudi-ext=gerarpdf] >> .m").inner_text()[:300], "| abas:", [x.url[-50:] for x in ctx.pages], flush=True)
            if k == 10:
                for x in ctx.pages:
                    if "ocr.html" in x.url: print("   OCR:", x.inner_text("body")[:700].replace("\n", " / "), flush=True)
            popup.wait_for_timeout(1000)
        ok(len(CORPOS) == 1, "pediu UM PDF ao Projudi")
        corpo = CORPOS[0] if CORPOS else ""
        ok("codigosArquivos=102%3B103%3B" in corpo and "codigosMovimentacoes=18%3B19%3B" in corpo and "101" not in corpo.split("codigosArquivos=")[1][:12], f"só os marcados foram pedidos: {corpo[-90:]}")
        for _ in range(240):
            an = studio.evaluate("() => window.__analises")
            if an: break
            studio.wait_for_timeout(1000)
        an = studio.evaluate("() => window.__analises"); print(an)
        ok(len(an) == 1 and an[0]["nome"] == PROCESSO + "-OCR.pdf", "o Studio recebeu a análise do processo")
        ped = json.loads(an[0]["refazer"]) if an and an[0].get("refazer") else {}
        ok(ped.get("de") == "ana-1" and ped.get("min") == 8 and ped.get("max") == 9 and ped.get("n") == 2 and ped.get("arquivos") == 2 and ped.get("processo") == PROCESSO, f"o aviso de 'refazer' chegou ao app com a faixa 8–9: {ped}")
        studio.wait_for_timeout(1500)
        ok(studio.evaluate("() => document.documentElement.dataset.refazerPedido === undefined"), "o aviso sai da página quando a análise termina")
        ok(sw.evaluate("() => chrome.storage.local.get('refazer_pedido')") == {}, "o pedido guardado foi consumido")
        it = sw.evaluate("async () => (await chrome.storage.local.get(null))")
        concl = [v for k, v in it.items() if k.startswith("esteira_m") and v.get("refazer")]
        for _ in range(60):
            it = sw.evaluate("async () => (await chrome.storage.local.get(null))"); concl = [v for k, v in it.items() if k.startswith("esteira_m") and v.get("refazer")]
            if concl and concl[0].get("estado") == "concluido": break
            studio.wait_for_timeout(1000)
        ok(concl and concl[0]["estado"] == "concluido" and "Nova versão da minuta feita só com as movimentações 8 a 9" in concl[0].get("aviso", ""), f"esteira conclui com o aviso da nova versão: {concl and concl[0].get('aviso')}")

        # 2) processo que a extensão não conhece, sem serventia: pede a escolha
        pedir("5000002-22.2026.8.09.0166"); fim = espera_fim(20)
        ok(fim["ok"] is False and fim["precisaServentia"] is True and "Escolha a serventia" in fim["erro"], f"sem serventia conhecida: pede a escolha: {fim}")
        # 3) com a serventia escolhida: acha o processo na lista da serventia
        VISITAS.clear(); pedir("5000002-22.2026.8.09.0166", "http://localhost:8770/serv"); fim = espera_fim()
        ok(fim["ok"] is True, f"com a serventia escolhida, achou o processo na lista: {fim}")
        ok(any(v.startswith("/PreAnalisarConclusao") for v in VISITAS) and any(v.startswith("/proc?Id_Processo=77") for v in VISITAS), f"procurou na lista e abriu o link novo: {VISITAS}")
        ctx.close()
    print("FALHAS:", falhas); raise SystemExit(1 if falhas else 0)

main()
