"""Uso da extensão: studio-base.js entrega as contagens locais ao app; só zera o que o app confirmou (com o atributo de confirmação)."""
import glob, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
def rodar(confirmar):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
        pg = ctx.new_page(); pg.route("**/*", lambda r: r.fulfill(body="<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>", content_type="text/html")); pg.goto("http://judicial.teste/")
        pg.evaluate("""(confirmar) => { window.__envios = []; window.__mem = { uso_ext: { '2026-11-10': { esteira_turbo: 3, ocr_processo: 2 }, '2026-11-09': { pdf_studio: 1 } } };
          window.addEventListener('assessor:uso-extensao', (e) => { const d = JSON.parse(e.detail); window.__envios.push(d); window.__mem.uso_ext['2026-11-10'].esteira_turbo += 4; /* uso novo DURANTE a entrega */ if (confirmar) document.documentElement.dataset.assessorUsoExtensaoAck = d.lote; });
          window.chrome = { runtime: { getManifest: () => ({ version: '1.0.104' }), onMessage: { addListener(f) {} }, sendMessage: async () => ({ ok: true }) }, notifications: null,
            storage: { onChanged: { addListener() {} }, local: { get: async (k) => (typeof k === 'string' ? { [k]: JSON.parse(JSON.stringify(window.__mem[k] || {})) } : {}), set: async (o) => { Object.assign(window.__mem, JSON.parse(JSON.stringify(o))); }, remove: async () => {} } } }; }""", confirmar)
        pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
        pg.wait_for_function("window.__envios.length >= 1", timeout=40000)
        # enquanto o app avisa, a contagem nova feita DURANTE a entrega não pode se perder
        pg.wait_for_timeout(1500)
        r = (pg.evaluate("window.__envios[0]"), pg.evaluate("window.__mem.uso_ext")); b.close(); return r
env, resto = rodar(True)
print(env, resto)
assert env["dias"] == {"2026-11-10": {"esteira_turbo": 3, "ocr_processo": 2}, "2026-11-09": {"pdf_studio": 1}} and env["lote"] and env["versao"] == "1.0.104"
assert "2026-11-09" not in resto and resto["2026-11-10"].get("esteira_turbo") == 4 and "ocr_processo" not in resto["2026-11-10"], "zera só o confirmado: " + json.dumps(resto)
env2, resto2 = rodar(False)
assert resto2["2026-11-10"]["esteira_turbo"] == 7 and resto2["2026-11-09"]["pdf_studio"] == 1, "sem confirmação nada é zerado: " + json.dumps(resto2)
print("OK")
