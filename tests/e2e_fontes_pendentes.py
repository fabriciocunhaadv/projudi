"""Fontes pendentes buscadas pela extensão: lei federal por endereço do Planalto; lei municipal achada em listagem com 2 páginas + ficha com link para o PDF; lei estadual com página de texto; lei inexistente vira falha com o que foi tentado.
O app (simulado) pede pelo atributo da página (modo fonte) e recebe UMA entrega por vez."""
import base64, glob, http.server, json, os, re, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PS, PL, PC = 8797, 8798, 8799
ART = "".join(f"<p>Art. {i}º Texto do artigo {i} da lei, com redação suficiente para parecer um texto legal de verdade.</p>" for i in range(1, 20))
FEDERAL = ("<html><body><p>LEI Nº 14.905, DE 28 DE JUNHO DE 2024</p>" + ART.replace("Art. 1º", "Art . 1º") + "<p>Atualização com ç e º</p></body></html>").encode("cp1252")
ESTADUAL = ("<html><body><p>LEI Nº 21.792, DE 5 DE JULHO DE 2023</p>" + ART + "</body></html>").encode("utf-8")
PDF = b"%PDF-1.4\n" + b"x" * 4000
STUDIO = b"<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>"
class Studio(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.send_header("Content-Type", "text/html"); s.end_headers(); s.wfile.write(STUDIO)
    def log_message(*a): pass
class Planalto(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        if s.path.endswith("/_ato2023-2026/2024/lei/l14905.htm"): s.send_response(200); s.send_header("Content-Type", "text/html; charset=windows-1252"); s.end_headers(); s.wfile.write(FEDERAL); return
        s.send_response(404); s.end_headers(); s.wfile.write(b"nao")
    def log_message(*a): pass
class Camara(http.server.BaseHTTPRequestHandler):
    def _html(s, corpo, tipo="text/html; charset=utf-8"): s.send_response(200); s.send_header("Content-Type", tipo); s.end_headers(); s.wfile.write(corpo if isinstance(corpo, bytes) else corpo.encode())
    def do_GET(s):
        p = s.path
        if p == "/municipal/leis/815": s._html('<h1>Lei 1.234/2015</h1><p>Ficha da lei</p><a href="/municipal/doc/1234.pdf">Texto integral</a>')
        elif p == "/municipal/doc/1234.pdf": s._html(PDF, "application/pdf")
        elif p == "/estadual/go/lei-21792-2023": s._html(ESTADUAL)
        elif p.startswith("/municipal/leis"):
            if "pagina=2" in p: s._html('<ul><li><a href="/municipal/leis/815">Lei Municipal nº 1.234 de 10/03/2015 - Dispõe sobre taxas</a></li></ul>')
            else: s._html('<ul><li><a href="/municipal/leis/812">Lei nº 1.233 de 02/03/2014</a></li></ul><a href="/municipal/leis?pagina=2">Próxima</a>')
        elif p.startswith("/estadual/go"): s._html('<ul><li><a href="/estadual/go/lei-21792-2023">Lei Estadual nº 21.792 de 05/07/2023</a></li></ul>')
        else: s.send_response(404); s.end_headers()
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://127.0.0.1/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://docs.google.com/document/*", "http://localhost/*"))
    c = ext / "leis-core.js"; t = c.read_text()
    t = re.sub(r'export const HOSTS_TESTE = \[[^\]]*\];', 'export const HOSTS_TESTE = ["127.0.0.1"];', t).replace('export const PROTOCOLO_TESTE = "https:";', 'export const PROTOCOLO_TESTE = "http:";').replace('"https://www.planalto.gov.br/ccivil_03/"', f'"http://127.0.0.1:{PL}/ccivil_03/"').replace('x.protocol === "https:"', 'true')      # só no teste: sites simulados em http local
    c.write_text(t)
    for porta, h in ((PS, Studio), (PL, Planalto), (PC, Camara)): threading.Thread(target=http.server.HTTPServer(("127.0.0.1", porta), h).serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        if not ctx.service_workers: ctx.wait_for_event("serviceworker")
        app = ctx.new_page(); app.goto(f"http://127.0.0.1:{PS}/"); app.wait_for_timeout(1500)
        app.evaluate("""() => { window.__ent = []; window.__fim = null;
          window.addEventListener('projudi:fonte-entrega', () => { const el = document.documentElement; window.__ent.push(JSON.parse(el.dataset.projudiFonteEntrega)); delete el.dataset.projudiFonteEntrega; });
          window.addEventListener('projudi:leis-fim', () => { window.__fim = JSON.parse(document.documentElement.dataset.projudiLeisFim); }); }""")
        itens = [{"id": "fed", "rotulo": "Lei 14905/2024", "tipo": "lei", "esfera": "federal", "ente": "", "numero": "14905", "ano": 2024},
                 {"id": "mun", "rotulo": "Lei Municipal 1234/2015", "tipo": "lei", "esfera": "municipal", "ente": "Montes Claros de Goiás", "numero": "1234", "ano": 2015},
                 {"id": "est", "rotulo": "Lei Estadual 21792/2023", "tipo": "lei", "esfera": "estadual", "ente": "Goiás", "numero": "21792", "ano": 2023},
                 {"id": "nao", "rotulo": "Lei Municipal 7777/2001", "tipo": "lei", "esfera": "municipal", "ente": "Montes Claros de Goiás", "numero": "7777", "ano": 2001},
                 {"id": "outra", "rotulo": "Lei Municipal 1234/2015 (Goiânia)", "tipo": "lei", "esfera": "municipal", "ente": "Goiânia", "numero": "1234", "ano": 2015}]
        fb = [{"id": "m", "nome": "Câmara", "esfera": "municipal", "ente": "Montes Claros de Goiás", "url": f"http://127.0.0.1:{PC}/municipal/leis", "ativa": True}, {"id": "e", "nome": "Estaduais", "esfera": "estadual", "ente": "Goiás", "url": f"http://127.0.0.1:{PC}/estadual/go", "ativa": True}, {"id": "x", "nome": "Fora", "esfera": "municipal", "ente": "X", "url": "http://evil.example.com/x", "ativa": True}]
        with ctx.expect_page() as nova:
            app.evaluate("([itens, fb]) => { document.documentElement.dataset.projudiLeisPedido = JSON.stringify({ pedidoId: 'f1', modo: 'fonte', leis: itens, fontesBusca: fb }); window.dispatchEvent(new Event('projudi:leis-pedido')); }", [itens, fb])
        pg = nova.value; pg.wait_for_load_state(); pg.wait_for_selector("#permissao:not(:empty)", timeout=10000); assert "5 fonte(s)" in pg.inner_text("#permissao") and "Buscar as fontes pendentes" in pg.inner_text("h1")
        pg.click("#iniciar"); app.wait_for_function("window.__fim", timeout=90000)
        ent = {e["id"]: e for e in app.evaluate("window.__ent")}; fim = app.evaluate("window.__fim")
        print({k: ("ok " + str(len(v["b64"])) + "b64 " + v["contentType"][:15]) if v.get("b64") else "falha: " + str(v.get("erro"))[:60] for k, v in ent.items()}, fim)
        pass
        assert base64.b64decode(ent["fed"]["b64"]) == FEDERAL, "lei federal: bytes originais (windows-1252) do endereço previsível do Planalto"
        assert "pdf" in ent["mun"]["contentType"] and base64.b64decode(ent["mun"]["b64"]) == PDF, "lei municipal: achada na 2ª página da listagem, pela ficha, com o PDF do texto integral"
        assert base64.b64decode(ent["est"]["b64"]) == ESTADUAL, "lei estadual: página de texto achada pela listagem"
        assert not ent["nao"].get("b64") and "não encontrei" in ent["nao"]["erro"] and len(ent["nao"]["tentativas"]) >= 1, "inexistente: falha com o que foi tentado"
        assert not ent["outra"].get("b64") and "nenhum site de busca" in ent["outra"]["erro"], "outro município: sem site configurado (não mistura leis de municípios diferentes)"
        assert fim["modo"] == "fonte" and fim["feitas"] == 3 and fim["falhas"] == 2, fim
        ctx.close()
    print("OK")
main()
