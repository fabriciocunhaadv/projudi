"""Monitor de Rotina: eventos anônimos, gravação de tarefa (sem guardar o texto digitado), execução e relatório."""
import glob, http.server, json, os, shutil, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "monitor-rotina"
PAG = {
 "/": '<html><body><h1>Início</h1><button onclick="location.href=\'/busca?PaginaAtual=4&x=5000001-11.2026\'">Abrir busca 5000001</button></body></html>',
 "/busca": '<html><body><h1>Busca</h1><input id="numero" name="numero" type="text"><select name="tipo"><option>Todos</option><option>Pré-análise</option></select><button id="consultar" onclick="document.getElementById(\'res\').textContent=\'Resultado: \'+document.getElementById(\'numero\').value+\'/\'+document.querySelector(\'select\').value">Consultar</button><div id="res"></div></body></html>',
}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        corpo = PAG.get(s.path.split("?")[0], "").encode()
        s.send_response(200 if corpo else 404); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(corpo)
    def log_message(*a): pass

tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
m = json.loads((ext / "manifest.json").read_text()); m["host_permissions"] = ["http://localhost/*"]; (ext / "manifest.json").write_text(json.dumps(m))
threading.Thread(target=http.server.ThreadingHTTPServer(("localhost", 8781), H).serve_forever, daemon=True).start()
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    eid = sw.url.split("/")[2]
    ev = lambda: sw.evaluate("async () => (await chrome.storage.local.get('eventos')).eventos || []")
    # --- desligado: nada é registrado ---
    pg = ctx.new_page(); pg.goto("http://localhost:8781/"); pg.wait_for_timeout(800)
    assert ev() == []
    # --- ligado e com site autorizado ---
    sw.evaluate("() => chrome.storage.local.set({ cfg: { ativo: true, sites: [{ padrao: 'http://localhost/*' }], rotulos: true } })"); pg.wait_for_timeout(500)
    print("registrados:", sw.evaluate("chrome.runtime.sendMessage({acao:'registrar'})") if False else "")
    pg2 = ctx.new_page(); pg2.evaluate("1")
    pg2.goto(f"chrome-extension://{eid}/opcoes.html"); pg2.evaluate("chrome.runtime.sendMessage({ acao: 'registrar' })"); pg2.wait_for_timeout(1000)
    pg.goto("http://localhost:8781/"); pg.wait_for_timeout(800)
    pg.click("text=Abrir busca"); pg.wait_for_url("**/busca**"); pg.wait_for_timeout(800)
    pg.fill("#numero", "SEGREDO-123"); pg.click("#consultar"); pg.wait_for_timeout(800)
    e = ev(); print([(x["tipo"], x.get("pg"), x.get("rot")) for x in e])
    assert any(x["tipo"] == "nav" and x["pg"] == "localhost/busca?PaginaAtual=4" for x in e)          # só o parâmetro de tela; o "x=5000001..." foi descartado
    assert any(x["tipo"] == "clique" and x["rot"] == "Abrir busca #" for x in e) and any(x.get("rot") == "Consultar" for x in e)
    dump = json.dumps(sw.evaluate("chrome.storage.local.get(null)")); assert "SEGREDO" not in dump and "5000001" not in dump
    # --- gravação ---
    sw.evaluate("() => chrome.storage.local.set({ gravacao: { ativa: true, passos: [], inicio: Date.now() } })"); pg.wait_for_timeout(400)
    pg.goto("http://localhost:8781/busca?PaginaAtual=4"); pg.wait_for_timeout(600)
    pg.fill("#numero", "SEGREDO-ABC"); pg.press("#numero", "Tab"); pg.select_option("select", "Pré-análise"); pg.click("#consultar"); pg.wait_for_timeout(800)
    g = sw.evaluate("async () => (await chrome.storage.local.get('gravacao')).gravacao")
    print([(x["tipo"], x["alvo"]["texto"] or x["alvo"]["name"], x.get("valor"), x.get("variavel")) for x in g["passos"]])
    assert [x["tipo"] for x in g["passos"]] == ["preencher", "selecionar", "clicar"] and g["passos"][0]["variavel"] and "valor" not in g["passos"][0]
    assert "SEGREDO" not in json.dumps(g)
    sw.evaluate("async () => { const { gravacao } = await chrome.storage.local.get('gravacao'); await chrome.storage.local.set({ tarefas: [{ id: 't1', nome: 'Buscar', passos: gravacao.passos }] }); await chrome.storage.local.remove('gravacao'); }")
    # --- execução ---
    pg.goto("http://localhost:8781/busca?PaginaAtual=4"); pg.wait_for_timeout(600)
    tab = sw.evaluate("async () => (await chrome.tabs.query({ url: 'http://localhost/busca*' }))[0].id")
    pg2.evaluate("(t) => chrome.runtime.sendMessage({ acao: 'executar', id: 't1', valores: { 0: 'XYZ-99' }, tabId: t })", tab)
    for _ in range(40):
        ex = sw.evaluate("async () => (await chrome.storage.local.get('execucao')).execucao")
        if ex and ex["estado"] in ("concluida", "erro"): break
        time.sleep(0.5)
    print(ex); assert ex["estado"] == "concluida", ex
    assert pg.inner_text("#res") == "Resultado: XYZ-99/Pré-análise"
    # --- relatório e sequências ---
    rel = ctx.new_page(); rel.goto(f"chrome-extension://{eid}/relatorio.html"); rel.wait_for_timeout(1200)
    txt = rel.inner_text("#txt"); print(txt[:700])
    assert "Telas mais abertas" in txt and "localhost/busca?PaginaAtual=4" in txt and "SEGREDO" not in txt
    seq = rel.evaluate("MonAnalise.sequencias(['A','B','C','A','B','C','A','B','C','D','A','B','C'], {minRep:3}).map(s => [s.passos.join('>'), s.vezes])")
    print(seq); assert seq[0] == ["A>B>C", 4]
    ctx.close()
print("OK")
