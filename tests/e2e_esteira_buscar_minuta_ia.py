"""Esteira: a linha com erro da IA externa (Claude) oferece "Buscar a minuta na aba do Claude": a extensão olha a conversa aberta, espera a IA terminar e traz a minuta (sem enviar nada de novo)."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
mf = json.loads((ext / "manifest.json").read_text()); mf["host_permissions"] += ["https://claude.ai/*"]; (ext / "manifest.json").write_text(json.dumps(mf))      # só no teste: a autorização do site já concedida
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
MINUTA = ("PODER JUDICIÁRIO DO ESTADO DE GOIÁS. DECISÃO. Trata-se de ação declaratória de relação de parentesco cumulada com petição de herança. " * 6)
CLAUDE = """<!doctype html><meta charset=utf-8><title>Claude</title><body><div id=msgs><div data-testid="assistant-message" id=m>Vou ler integralmente o PDF dos autos antes de redigir a minuta. Executando um comando</div></div>
<script>setTimeout(()=>{document.getElementById('m').textContent=%s;},5000);</script></body>""" % json.dumps(MINUTA, ensure_ascii=False)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    it = {"id": "x", "processo": "5225174-34.2022.8.09.0166", "estado": "erro", "erro": "Claude: não consegue capturar a minuta do Claude: só veio um texto curto", "url": "BuscaProcesso?x=1", "serventia": "Vara Y", "pdfNome": "x.pdf", "modo": "ia", "iaId": "claude", "prompt": "Prompt A"}
    sw.evaluate("async (d) => { await chrome.storage.local.set({ esteira_x: d, esteira_ordem: ['x'] }); }", it)
    claude = ctx.new_page(); claude.route("https://claude.ai/**", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=CLAUDE)); claude.goto("https://claude.ai/chat/abc-123")
    pg = ctx.new_page(); pg.goto(base + "esteira.html"); pg.wait_for_selector("button[data-a=capturar-ia]", timeout=15000)
    assert "Buscar a minuta na aba do Claude" in pg.inner_text("button[data-a=capturar-ia]"), "botão presente na linha com erro da IA"
    pg.evaluate("() => { const f = async () => true; for (const k of ['contains']) Object.defineProperty(chrome.permissions, k, { value: f, configurable: true, writable: true }); }")
    pg.click("button[data-a=capturar-ia]")
    import time
    def espera(cond, seg=60):
        t0 = time.time()
        while time.time() - t0 < seg:
            v = sw.evaluate("async () => (await chrome.storage.local.get('esteira_x')).esteira_x")
            if cond(v): return v
            time.sleep(0.5)
        return v
    espera(lambda v: len(v.get("minuta") or "") > 400)
    x = sw.evaluate("async () => (await chrome.storage.local.get('esteira_x')).esteira_x")
    print(x)
    assert x["estado"] == "concluido" and "PODER JUDICI" in x["minuta"] and "Executando" not in x["minuta"] and "Vou ler integralmente" not in x["minuta"], "trouxe a minuta de verdade (não o anúncio) e concluiu a linha"
    assert not x.get("capturando"), "o estado de 'procurando' foi limpo"
    # sem aba da IA aberta: mensagem clara, nada é enviado
    claude.close(); sw.evaluate("async (d) => { await chrome.storage.local.set({ esteira_x: d }); }", it); pg.reload(); pg.wait_for_selector("button[data-a=capturar-ia]")
    pg.evaluate("() => { const f = async () => true; Object.defineProperty(chrome.permissions, 'contains', { value: f, configurable: true, writable: true }); }")
    pg.click("button[data-a=capturar-ia]"); v = espera(lambda v: "não achei uma aba aberta" in (v.get("erro") or ""), 20); assert "não achei uma aba aberta" in v["erro"] and v["estado"] == "erro" and not v.get("capturando"), v
    print("sem aba: mensagem clara OK")
    ctx.close()
print("OK")
