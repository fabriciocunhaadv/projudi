"""Esteira → Studio: o PDF e os vídeos vão em partes (studio-cliente.js → studio-base.js → app), o andamento e o resultado voltam pelo storage."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
APP = """<html><head><title>Assessor Judicial</title></head><body><div id="tour-input-panel"></div><script>
const R = {}; window.__rec = R; document.documentElement.dataset.assessorSentencaVideo = '1';
const resp = (id, o) => window.postMessage({ __projudiResp: 'sv', reqId: id, ...o }, location.origin);
window.addEventListener('message', (e) => { const d = e.data; if (e.source !== window || !d || d.__projudi !== 'sv') return;
  R[d.reqId] = R[d.reqId] || { partes: {}, auto: null };
  if (d.fase === 'parte') { (R[d.reqId].partes[d.idx] = R[d.reqId].partes[d.idx] || []).push(d.dados.length); resp(d.reqId, { tipo: 'parte-ok', idx: d.idx, n: d.n }); }
  else if (d.fase === 'iniciar') { R[d.reqId].iniciar = d; R[d.reqId].auto = document.documentElement.dataset.assessorAuto || null;
    resp(d.reqId, { tipo: 'iniciado' }); setTimeout(() => resp(d.reqId, { tipo: 'andamento', texto: 'A IA está degravando…', pct: 50 }), 200);
    setTimeout(() => resp(d.reqId, { tipo: 'resultado', ok: true, minuta: 'SENTENÇA de teste', transcricao: 'degravação', processo: d.processo, historicoId: 'h1' }), 4500); }
  else if (d.fase === 'cancelar') R[d.reqId].cancelado = true; });
</script></body></html>"""
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    ctx.route("https://judicial-mysql.assessor.net.br/**", lambda r: r.fulfill(body=APP, content_type="text/html; charset=utf-8"))
    app = ctx.new_page(); app.goto("https://judicial-mysql.assessor.net.br/")
    app.wait_for_function("document.documentElement.dataset.assessorExtensaoRecursos", timeout=15000)
    assert "sv" in app.evaluate("document.documentElement.dataset.assessorExtensaoRecursos").split(",")
    pg = ctx.new_page(); pg.goto(base + "pauta.html")
    r = pg.evaluate("""async () => { const c = await import('./studio-cliente.js'); const andamentos = [];
      const res = await c.sentencaComVideoNoStudio({ pdf: { nome: 'a.pdf', tipo: 'application/pdf', bytes: new Uint8Array(4_000_000).fill(1) }, videos: [{ nome: 'v1.mp4', tipo: 'video/mp4', bytes: new Uint8Array(3_100_000).fill(2) }, { nome: 'v2.webm', tipo: 'video/webm', bytes: new Uint8Array(100).fill(3) }] },
        { processo: '5428441-88.2026.8.09.0166', promptTitulo: 'Previdenciário', promptTexto: 'PROMPT', andamento: (t) => andamentos.push(t), aindaValido: async () => true });
      return { res, andamentos }; }""")
    print(json.dumps(r, ensure_ascii=False)[:500])
    assert r["res"]["ok"] and r["res"]["minuta"] == "SENTENÇA de teste" and r["res"]["historicoId"] == "h1", r
    assert any("degravando" in a for a in r["andamentos"]) and any("o PDF" in a for a in r["andamentos"]) and any("vídeo 2 de 2" in a for a in r["andamentos"]), r["andamentos"]
    rec = app.evaluate("Object.values(window.__rec)[0]")
    assert [len(rec["partes"][k]) for k in ("0", "1", "2")] == [3, 3, 1], "partes de 1,5 MB: PDF 4 MB = 3, vídeo 3,1 MB = 3, vídeo pequeno = 1: " + str({k: len(v) for k, v in rec["partes"].items()})
    assert rec["iniciar"]["pdfIdx"] == 0 and rec["iniciar"]["videosIdx"] == [1, 2] and rec["iniciar"]["promptTexto"] == "PROMPT" and rec["auto"] == "1", rec
    # Studio sem a versão nova: mensagem clara
    app.evaluate("() => { delete document.documentElement.dataset.assessorSentencaVideo; }")
    msg = pg.evaluate("""async () => { const c = await import('./studio-cliente.js'); try { await c.sentencaComVideoNoStudio({ pdf: { nome: 'a.pdf', tipo: 'application/pdf', bytes: new Uint8Array(10) }, videos: [] }, {}); return 'sem erro'; } catch (e) { return e.message; } }""")
    print(msg); assert "atualize a página do Studio" in msg
    ctx.close()
print("OK")
