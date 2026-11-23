"""Pauta pelo Studio: o app pede à extensão (postMessage) as serventias e a lista de audiências do Projudi (aba escondida que fecha sozinha) e manda os marcados para a esteira (lote → Mesa).
Projudi simulado com os dados fictícios de tests/fixtures. Rodar: /usr/bin/python3 tests/e2e_pauta_studio.py"""
import glob, http.server, json, os, shutil, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"; FIX = Path(__file__).parent / "fixtures"
LISTA = (FIX / "audiencias.html").read_text(encoding="utf-8")
SERV = '<html><body data-usuario-id="1"><fieldset><legend>Comarca Teste - Vara Cível</legend><a href="Usuario?PaginaAtual=7&Id=9">Assessor</a></fieldset></body></html>'

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(b"<html><head><title>Assessor Judicial</title></head><body>Studio falso</body></html>")
    def log_message(*a): pass

PEDIR = """([fase, extra]) => new Promise((ok) => {
  const reqId = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
  const f = (ev) => { const d = ev.data; if (ev.source !== window || !d || d.__projudiResp !== 'pauta' || d.reqId !== reqId || d.tipo !== 'fim') return; window.removeEventListener('message', f); ok(d); };
  window.addEventListener('message', f); window.postMessage({ __projudi: 'pauta', fase, reqId, ...extra }, location.origin);
  setTimeout(() => ok({ ok: false, erro: 'sem resposta em 40 s' }), 40000);
})"""

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://judicial-mysql.assessor.net.br/*", "http://localhost/*"))
    srv = http.server.HTTPServer(("localhost", 8795), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        pedidos = []
        def rota(r):
            u = r.request.url; pedidos.append(u)
            if "PaginaAtual=9" in u: body = SERV
            elif "Audiencia?" in u: body = LISTA.replace('href="Audiencia?PaginaAtual=3&Pagina=2"', 'href="#"')
            else: body = "<html></html>"
            r.fulfill(status=200, headers={"content-type": "text/html; charset=utf-8"}, body=body.encode("utf-8"))
        ctx.route("https://projudi.tjgo.jus.br/**", rota)
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        pg = ctx.new_page(); pg.goto("http://localhost:8795/"); pg.wait_for_function("document.documentElement.dataset.assessorExtensao", timeout=10000)
        assert "pauta-studio" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos"), "a extensão anuncia o recurso 'pauta-studio'"
        antes = len(ctx.pages)
        r1 = pg.evaluate(PEDIR, ["serventias", {}]); print("serventias:", r1)
        assert r1["ok"] and len(r1["serventias"]) == 1 and r1["serventias"][0]["href"].startswith("Usuario?PaginaAtual=7"), r1
        r2 = pg.evaluate(PEDIR, ["ler", {"serventiaHref": r1["serventias"][0]["href"], "serventiaNome": "Comarca Teste - Vara Cível", "tipo": "", "fluxo": "2"}]); print("linhas:", len(r2.get("linhas") or []), (r2.get("linhas") or [{}])[0])
        assert r2["ok"] and len(r2["linhas"]) >= 1, r2
        l0 = r2["linhas"][0]
        assert l0["data"] and l0["hora"] and l0["processo"] and l0["serventiaNome"] == "Comarca Teste - Vara Cível", l0
        pg.wait_for_timeout(1500)
        assert len(ctx.pages) == antes, f"a aba escondida de leitura fecha sozinha ({antes} → {len(ctx.pages)}: {[x.url[-30:] for x in ctx.pages]})"
        # sem login no Projudi: erro claro, sem travar
        ctx.unroute("https://projudi.tjgo.jus.br/**"); ctx.route("https://projudi.tjgo.jus.br/**", lambda r: r.fulfill(status=200, headers={"content-type": "text/html"}, body="<html><body><form><input type='password'></form></body></html>"))
        r3 = pg.evaluate(PEDIR, ["ler", {"tipo": "", "fluxo": "2"}]); print("sem login:", r3.get("erro"))
        assert not r3["ok"] and ("Sessão do Projudi" in r3["erro"] or "tabela" in r3["erro"]), r3
        # endereço de fora do Projudi: recusado
        r4 = pg.evaluate(PEDIR, ["ler", {"serventiaHref": "https://exemplo.com/x", "tipo": "", "fluxo": "2"}]); assert not r4["ok"] and "fora do Projudi" in r4["erro"], r4
        # enviar marcados: vira um lote na esteira (só links do Projudi)
        itens = [{**l0, "url": "Processo?PaginaAtual=2&Id_Processo=123"}, {**l0, "processo": "999", "url": "https://exemplo.com/roubo"}]
        with ctx.expect_page(timeout=15000) as nova:
            r5 = pg.evaluate(PEDIR, ["enviar", {"itens": itens}])
        print("enviar:", r5); assert r5["ok"] and r5["n"] == 1, r5
        assert "lote.html?lote=pautamesa" in nova.value.url, nova.value.url
        lote = pg.evaluate("1") and nova.value.evaluate("async () => { const k = new URLSearchParams(location.search).get('lote'); const x = (await chrome.storage.local.get('lote_' + k))['lote_' + k]; return x; }")
        assert lote["opcoes"]["studio"]["modo"] == "mesa" and len(lote["itens"]) == 1 and lote["itens"][0]["classificador"] == "pauta" and lote["itens"][0]["audHora"] == l0["hora"], lote
        r6 = pg.evaluate(PEDIR, ["enviar", {"itens": [{**l0, "url": "https://exemplo.com/x"}]}]); assert not r6["ok"], r6
        ctx.close()
    print("TUDO OK")

main()
