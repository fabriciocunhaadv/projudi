import glob, os, json
from playwright.sync_api import sync_playwright
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
JS_SALVAR = """async (n) => {
  const m = await import('/src/utils/auditDb.ts');
  const big = "Autos do processo com acentuação, ação, não, é, ü. ".repeat(40000);   // ~2 milhões de caracteres
  const rec = { id: 'audit-' + n, processNumber: '553011' + n, assessorName: 'Assessor', date: Date.now() + n, score: 80, verdict: 'Aprovada com ressalvas', verdictColor: 'amber',
    processText: big, assessorDraft: big.slice(0, 300000), auditResult: { score: 80, alerts: [{ t: 'ok' }] }, status: 'pendente_correcao' };
  await m.saveAudit(rec); return true; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1366, "height": 768}); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
    pg.goto("http://127.0.0.1:5199/", wait_until="domcontentloaded"); pg.wait_for_timeout(5000)
    try: pg.get_by_text("Pular Tutorial").first.click(timeout=3000)
    except Exception: pass
    key = pg.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('agaia_judge_audits_'))")
    # 1) cinco auditorias de processo gigante: todas têm de ficar guardadas, no navegador e na nuvem
    for n in range(1, 6): pg.evaluate(JS_SALVAR, n)
    r = pg.evaluate("""() => { const k = Object.keys(localStorage).filter(k => k.startsWith('agaia_judge_audits_'))[0]; const l = k ? JSON.parse(localStorage[k]) : []; return { chave: k, n: l.length, ids: l.map(x => x.id), usoMB: Math.round(JSON.stringify(localStorage).length / 1e5) / 10, nuvem: (globalThis.__setDocs || []).filter(d => String(d.id).startsWith('audit-')).map(d => [d.id, d.bytes, d.texto]) }; }""")
    print("1) navegador:", r["n"], r["ids"], "uso MB", r["usoMB"], "| nuvem:", r["nuvem"])
    assert r["n"] == 5, "todas as auditorias precisam ficar no navegador"
    assert len(r["nuvem"]) == 5 and all(x[1] <= 900000 for x in r["nuvem"]), "cada documento da nuvem precisa caber (<= ~0,9 MB)"
    # 2) nuvem falhando: a auditoria fica no navegador, aparece aviso, entra na fila e é reenviada quando a nuvem volta
    pg.evaluate("() => { globalThis.__falharSetDoc = true; }")
    pg.evaluate(JS_SALVAR, 6); pg.wait_for_timeout(600)
    aviso = pg.locator("text=não foi gravada na nuvem").first
    ok_aviso = aviso.count() > 0
    pend = pg.evaluate("() => localStorage.getItem('agaia_audits_pendentes_v1')")
    loc = pg.evaluate("() => { const k = Object.keys(localStorage).filter(k => k.startsWith('agaia_judge_audits_'))[0]; return JSON.parse(localStorage[k]).map(x => x.id); }")
    print("2) aviso visível:", ok_aviso, "| pendentes:", pend, "| no navegador:", loc)
    assert ok_aviso and "audit-6" in (pend or "") and "audit-6" in loc
    pg.evaluate("() => { globalThis.__falharSetDoc = false; }")
    pg.evaluate("async () => { const m = await import('/src/utils/auditDb.ts'); await m.reenviarAuditoriasPendentes(); }")
    pend2 = pg.evaluate("() => localStorage.getItem('agaia_audits_pendentes_v1')"); nuvem = pg.evaluate("() => (globalThis.__setDocs || []).map(d => d.id)")
    print("3) após reenvio — pendentes:", pend2, "| nuvem:", nuvem)
    assert pend2 == "[]" and "audit-6" in nuvem
    print("erros de página:", erros[:2]); print("OK")
    b.close()
