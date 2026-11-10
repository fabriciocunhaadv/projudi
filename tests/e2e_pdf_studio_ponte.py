"""Ponte do tratamento de PDF no script do app (studio-base.js): declara o recurso, repassa o PDF em partes à extensão e devolve andamento e resultado ao app."""
import glob, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg = ctx.new_page(); pg.route("**/*", lambda r: r.fulfill(body="<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>", content_type="text/html")); pg.goto("http://judicial.teste/")
    pg.evaluate("""() => { window.__mem = {}; window.__log = []; window.__resp = [];
      window.addEventListener('message', (e) => { if (e.data && e.data.__projudiResp) window.__resp.push(e.data); });
      window.chrome = { runtime: { getManifest: () => ({ version: '1.0.99' }), onMessage: { addListener(f) { window.__ouvinte = f; } },
          sendMessage: async (m) => { window.__log.push(m); return { ok: true }; } }, notifications: null,
        storage: { onChanged: { addListener() {} }, local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } }; }""")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.wait_for_function("document.documentElement.dataset.assessorExtensaoRecursos", timeout=15000)
    assert pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos") == "pdf" and pg.evaluate("document.documentElement.dataset.assessorExtensao") == "1.0.99"
    post = lambda o: pg.evaluate("(o) => window.postMessage({ __projudi: 'pdf-tratar', id: 'abc', ...o }, window.location.origin)", o)
    tipos = lambda: [r.get("tipo") for r in pg.evaluate("window.__resp")]
    post({"fase": "inicio"}); pg.wait_for_function("window.__resp.some(r => r.tipo === 'pronto')", timeout=15000)
    post({"fase": "parte", "n": 0, "dados": "QUJD"}); pg.wait_for_function("window.__resp.some(r => r.tipo === 'parte-ok' && r.n === 0)", timeout=15000)
    post({"fase": "fim"}); pg.wait_for_function("window.__resp.some(r => r.tipo === 'fim-ok')", timeout=15000)
    acoes = [x["acao"] for x in pg.evaluate("window.__log")]; print("para a extensão:", acoes)
    assert acoes[:1] == ["pdf-studio-abrir"] and "pdf-studio-ping" in acoes and "pdf-studio-parte" in acoes and acoes[-1] == "pdf-studio-fim"
    # mensagens de outra origem/sem a marca são ignoradas
    pg.evaluate("() => window.postMessage({ __projudi: 'pdf-tratar', fase: 'inicio' }, window.location.origin)"); pg.wait_for_timeout(300)
    assert pg.evaluate("window.__log.filter(m => m.acao === 'pdf-studio-abrir').length") == 1, "sem id, não abre"
    # andamento e resultado vindos da página da extensão
    pg.evaluate("() => { window.__ouvinte({ acao: 'pdf-studio-progresso', id: 'abc', etapa: 'OCR', feitas: 3, total: 9 }, {}, () => {}); window.__ouvinte({ acao: 'pdf-studio-resultado', id: 'abc', ok: true, texto: 'texto', paginas: 9 }, {}, () => {}); }")
    pg.wait_for_function("window.__resp.some(r => r.tipo === 'resultado')", timeout=10000)
    r = pg.evaluate("window.__resp"); prog = [x for x in r if x["tipo"] == "progresso"][0]; res = [x for x in r if x["tipo"] == "resultado"][0]
    assert prog["feitas"] == 3 and prog["total"] == 9 and res["ok"] and res["texto"] == "texto" and res["id"] == "abc", r
    b.close()
print("OK")
