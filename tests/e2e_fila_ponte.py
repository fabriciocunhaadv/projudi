"""Ponte da fila no celular (studio-base.js): entrega ao app o resumo da esteira pelo atributo da página e avisa com o evento projudi:fila."""
import glob, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg = ctx.new_page(); pg.set_content("<html><head><title>Assessor Judicial</title></head><body><div id='tour-input-panel'></div></body></html>")
    pg.evaluate("() => { window.__evento = 0; window.addEventListener('projudi:fila', () => window.__evento++); }")
    pg.evaluate("""() => { window.__mem = { filaResumo: { total: 10, aguardando: 3, analisando: 1, concluidos: 6, erros: 0, pausados: 0, modo: 'ia', ia: 'Jusbrasil', pausa: '', ultimoErro: '', versao: '1.0.96', ts: Date.now() } };
      window.chrome = { runtime: { getManifest: () => ({ version: '1.0.87' }), onMessage: { addListener() {} } }, notifications: null,
        storage: { onChanged: { addListener(f) { window.__onChanged = f; } }, local: { get: async (k) => { const ks = Array.isArray(k) ? k : [k], o = {}; ks.forEach((x) => { if (x in window.__mem) o[x] = window.__mem[x]; }); return o; }, set: async (o) => { Object.assign(window.__mem, o); } } } }; }""")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.wait_for_function("document.documentElement.dataset.projudiFilaResumo", timeout=20000)
    r = json.loads(pg.evaluate("document.documentElement.dataset.projudiFilaResumo")); print("entregue:", r)
    assert r["total"] == 10 and r["ia"] == "Jusbrasil" and "processo" not in json.dumps(r).lower().replace("processos", ""), r
    assert pg.evaluate("window.__evento") >= 1, "evento projudi:fila disparado"
    # mudança no storage: o ouvinte entrega o novo resumo
    pg.evaluate("() => { window.__mem.filaResumo = { ...window.__mem.filaResumo, concluidos: 9, aguardando: 0, analisando: 0, erros: 1 }; window.__onChanged && window.__onChanged({ filaResumo: {} }, 'local'); }")
    pg.wait_for_function("JSON.parse(document.documentElement.dataset.projudiFilaResumo).concluidos === 9", timeout=10000)
    print("segunda entrega ok")
    # comandos do celular: o app entrega por atributo + evento e a extensão os guarda; o resultado volta pelo mesmo caminho
    pg.evaluate("() => { document.documentElement.dataset.projudiFilaComandos = JSON.stringify([{ id: 'c' + 'a'.repeat(31), tipo: 'pausar', ts: Date.now() }]); window.dispatchEvent(new Event('projudi:fila-comandos')); }")
    pg.wait_for_function("(window.__mem.filaComandos || []).length === 1", timeout=10000)
    assert pg.evaluate("window.__mem.filaComandos[0].tipo") == "pausar" and pg.evaluate("document.documentElement.dataset.projudiFilaComandos") is None
    pg.evaluate("() => { window.__mem.filaComandosResultado = [{ id: 'c' + 'a'.repeat(31), ok: true, mensagem: 'Fila pausada.', ts: Date.now() }]; }")
    pg.wait_for_function("document.documentElement.dataset.projudiFilaResultado", timeout=15000)
    assert "Fila pausada." in pg.evaluate("document.documentElement.dataset.projudiFilaResultado")
    pg.evaluate("() => { document.documentElement.dataset.projudiFilaResultadoAck = JSON.stringify(['c' + 'a'.repeat(31)]); window.dispatchEvent(new Event('projudi:fila-resultado-ok')); }")
    pg.wait_for_function("(window.__mem.filaComandosResultado || []).length === 0", timeout=10000)
    print("comandos: ida e volta ok")
    b.close()
print("OK")
