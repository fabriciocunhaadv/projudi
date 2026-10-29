"""Aba única do Projudi: a leitura da minuta e a busca do link novo navegam na aba que o usuário já deixou aberta (nenhuma aba nova), e a aba volta para a página em que estava."""
import glob, http.server, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
LISTA = """<html><body><script>function abrirEd(p){ const f=document.createElement("form"); f.method="get"; f.action="/editor"; f.target="_blank"; const i=document.createElement("input"); i.name="p"; i.value=p; f.appendChild(i); document.body.appendChild(f); f.submit() }</script><form id="Formulario"><input id="formLocalizarBotao" type="submit" value="Consultar" onclick="return false"><table id="Tabela">
<tr class="TabelaLinha1"><td>1</td><td><a href="BuscaProcesso?Id_Processo=1">5285460.70</a></td><td><button class="imgIcons" title="Visualizar" type="button" onclick="abrirEd(1);return false">v</button></td></tr>
<tr class="TabelaLinha1"><td>2</td><td><a href="BuscaProcesso?Id_Processo=2">6006074.21</a></td><td><button class="imgIcons" title="Visualizar" type="button" onclick="abrirEd(2);return false">v</button></td></tr></table></form></body></html>"""
EDITOR = """<html><body><div id="divCorpo"><fieldset><legend> Texto Pré-Análise </legend><div id="divTextoEditor" class="divTextoEditor" style="display:block"><!--Configuracao_Projudi {"nomeArquivo":"despacho"} Configuracao_Projudi--><p style="text-align:center"><img src="data:image/png;base64,AAAA"><br><strong>PODER JUDICIÁRIO</strong><br>Juizado Especial Cível</p><hr><p>Natureza: CÍVEL<br>Processo nº: 5285460-70.2025.8.09.0166<br>Autor(es): Fulano</p><p style="text-align:center"><strong>DESPACHO</strong></p><p>Intime-se a parte autora&nbsp;para manifestar-se.</p><p>Segundo parágrafo.</p></div></fieldset></div></body></html>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        s.wfile.write((EDITOR if s.path.startswith("/editor") else "<html><body>PAINEL DO USUARIO</body></html>" if s.path.startswith("/inicio") else LISTA).encode())
    def log_message(*a): pass


tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
for nome in ("lote.js", "minuta-pre.js"):
    j = ext / nome; j.write_text(j.read_text().replace("https://projudi.tjgo.jus.br/", "http://localhost:8783/"))
a = ext / "projudi-aba.js"; a.write_text(a.read_text().replace("https://projudi.tjgo.jus.br/*", "http://localhost/*").replace("https:\\/\\/projudi\\.tjgo\\.jus\\.br\\/", "http:\\/\\/localhost:8783\\/"))
srv = http.server.ThreadingHTTPServer(("localhost", 8783), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    usuario = ctx.new_page(); usuario.goto("http://localhost:8783/inicio")      # a aba do Projudi que o usuário deixou aberta
    pg = ctx.new_page(); pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/lote.html"); pg.wait_for_function("!!window.__lerMinutaPre")
    abertas = []; ctx.on("page", lambda x: abertas.append(x.url))
    antes = len(ctx.pages)
    r = pg.evaluate("(proc) => window.__lerMinutaPre({ processo: proc, serventiaUrl: 'Usuario?PaginaAtual=7&a1=1&a2=6' })", "5285460-70.2026.8.09.0166"); print(r)
    assert r["texto"].startswith("DESPACHO") and "Intime-se a parte autora" in r["texto"] and not r["motivo"], r
    assert len(ctx.pages) == antes and not abertas, f"abriu aba nova: {abertas}"
    pg.wait_for_timeout(1500)
    assert usuario.url.startswith("http://localhost:8783/inicio"), "a aba do usuário não voltou para a página em que estava: " + usuario.url
    h = pg.evaluate("() => window.__urlFresca({ processo: '5285460-70.2026.8.09.0166', situacao: 'preAnalisadas', serventiaUrl: 'Usuario?PaginaAtual=7&a1=1&a2=6' })"); print("link novo:", h)
    assert "Id_Processo=1" in h, h
    assert len(ctx.pages) == antes and not abertas, f"abriu aba nova na busca do link: {abertas}"
    pg.wait_for_timeout(1500)
    assert usuario.url.startswith("http://localhost:8783/inicio"), usuario.url
    ctx.close()
print("OK")
