"""Esteira x chat: com o app sinalizando `data-assessor-ocupado` (a pessoa está no chat da minuta), a extensão NÃO começa o processo seguinte; quando a pessoa termina, ela segue.
Rodar: /usr/bin/python3 tests/e2e_esteira_espera_chat.py"""
import ast, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
src = (Path(__file__).parent / "e2e_studio_lupa.py").read_text()
PAG = next(ast.literal_eval(n.value) for n in ast.parse(src).body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "PAG")
CHAMA = "() => window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', arquivoId: '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Cível', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor.\\nSegundo parágrafo.', texto: '[Página 1]\\nAutos em texto. ' + 'z'.repeat(300) }, {}, (r) => { window.__r = r })"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("() => { window.__r = null; window.auditou = null; document.documentElement.dataset.assessorOcupado = '1' }")
    pg.evaluate(CHAMA)
    pg.wait_for_timeout(5000)
    assert pg.evaluate("window.__r") is None and pg.evaluate("document.documentElement.dataset.assessorAuto") != "1", "com o app ocupado a esteira não pode começar"
    print("ok: ocupado, a esteira espera (nada começou em 5 s)")
    pg.evaluate("() => { delete document.documentElement.dataset.assessorOcupado }")
    pg.wait_for_function("window.__r", timeout=90000)
    r = pg.evaluate("window.__r"); assert r.get("ok"), r
    print("ok: livre, a esteira segue e conclui:", r.get("ok"))
    # sem ocupado: começa na hora
    pg.evaluate("() => { window.__r = null }")
    pg.evaluate(CHAMA)
    pg.wait_for_function("window.__r", timeout=90000)
    assert pg.evaluate("window.__r").get("ok")
    print("ok: sem ocupado, segue sem atraso")
    b.close()
print("TUDO OK")
