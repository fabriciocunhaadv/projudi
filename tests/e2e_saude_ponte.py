"""Ponte de Saúde do sistema no script do app (studio-base.js): entrega a fila da extensão ao app pelo atributo da página, e tira da fila o que o app confirmou."""
import glob, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg = ctx.new_page(); pg.set_content("<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>")
    pg.evaluate("""() => { window.__mem = { saudeFila: [{ id: 'a1', ts: Date.now(), versao: '1.0.87', modulo: 'ocr', severidade: 'erro', mensagem: 'Falhou o OCR' }] };
      window.chrome = { runtime: { getManifest: () => ({ version: '1.0.87' }), onMessage: { addListener() {} } }, notifications: null,
        storage: { local: { get: async (k) => { const ks = Array.isArray(k) ? k : [k], o = {}; ks.forEach((x) => { if (x in window.__mem) o[x] = window.__mem[x]; }); return o; }, set: async (o) => { Object.assign(window.__mem, o); } } } }; }""")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.wait_for_function("document.documentElement.dataset.projudiSaudeFila", timeout=15000)
    fila = json.loads(pg.evaluate("document.documentElement.dataset.projudiSaudeFila")); print("entregue:", [(e["modulo"], e["mensagem"]) for e in fila])
    assert any(e["mensagem"] == "Falhou o OCR" for e in fila) and any(e["mensagem"] == "Extensão ativa" for e in fila), "evento da fila + aviso diário de versão"
    # o app confirma o recebimento (como saudeCliente.ts faz) e libera o atributo
    ids = [e["id"] for e in fila]; pg.evaluate("(ids) => { delete document.documentElement.dataset.projudiSaudeFila; document.documentElement.dataset.projudiSaudeAck = JSON.stringify(ids); }", ids)
    pg.wait_for_function("window.__mem.saudeFila.length === 0", timeout=30000); print("fila depois da confirmação:", pg.evaluate("window.__mem.saudeFila.length"))
    assert pg.evaluate("document.documentElement.dataset.projudiSaudeFila") is None, "nada novo para entregar"
    b.close()
print("OK")
