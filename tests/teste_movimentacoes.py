# Lê a tabela de Movimentações real (tests/fixtures_movimentacoes.html) com o mov-diag.js e monta o quadro.
import json, pathlib
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parent.parent / "extensao"
import os, sys
F = pathlib.Path(os.environ.get("MOVS_HTML", pathlib.Path(__file__).parent / "fixtures_movimentacoes.html"))      # HTML real salvo pelo botão da extensão (tem dados das partes: não vai para o repositório)
if not F.exists(): print("sem o HTML real (defina MOVS_HTML); teste ignorado"); sys.exit(0)
html = F.read_text(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"]); pg = b.new_page()
    pg.route("http://t.local/", lambda r: r.fulfill(body=html, content_type="text/html; charset=utf-8"))
    pg.goto("http://t.local/")
    pg.evaluate("window.__salvo = {}; window.chrome = { storage: { local: { get: async () => ({}), set: async (o) => { Object.assign(window.__salvo, o); }, remove: async () => {} } } }")
    pg.add_script_tag(content=(R / "mov-diag.js").read_text(encoding="utf-8"))
    pg.wait_for_timeout(500)
    s = pg.evaluate("window.__salvo")
    b.close()
k = list(s)[0]; movs = s[k]["movs"]
print(k, len(movs)); print(movs[0]); print(movs[1]); print(movs[2])
assert k == "movs:5153655-70.2026.8.09.0097" and len(movs) == 35
assert movs[0]["n"] == 35 and movs[0]["tipo"] == "Autos Conclusos" and "GRATUIDADE" in movs[0]["complemento"]
assert movs[1]["tipo"].startswith("Término da Suspensão") and movs[2]["tipo"].startswith("Despacho") and "90 dias" in movs[2]["complemento"]
assert movs[-1]["n"] == 1 and movs[-1]["comArquivos"] is True, movs[-1]
open("/tmp/movs.json", "w").write(json.dumps(movs))
print("OK")
