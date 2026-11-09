"""Esteira: executa os comandos vindos do celular (pausar, repetir os que deram erro, retomar), sem começar trabalho novo quando pausada, e anota o resultado."""
import glob, os, shutil, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    agora = int(time.time() * 1000)
    sw.evaluate("""async (t) => { const it = (id, estado) => ({ id, processo: '5645680-24.2026.8.09.0166', modo: 'ia', iaId: 'jusbrasil', estado, erro: estado === 'erro' ? 'ChatGPT: falhou' : '', prompt: 'x', pdfNome: id + '.pdf', criadoEm: t });
      await chrome.storage.local.set({ esteira_ordem: ['e1', 'c1'], esteira_e1: it('e1', 'erro'), esteira_c1: it('c1', 'concluido'),
        filaComandos: [{ id: 'a'.repeat(32), tipo: 'pausar', ts: t }, { id: 'b'.repeat(32), tipo: 'repetir_erros', ts: t + 1 }, { id: 'v'.repeat(32), tipo: 'apagar_tudo', ts: t + 2 }, { id: 'x'.repeat(32), tipo: 'pausar', ts: t - 3600000 }] }); }""", agora)
    pg = ctx.new_page(); pg.goto(base + "esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    for _ in range(40):
        r = sw.evaluate("async () => (await chrome.storage.local.get('filaComandosResultado')).filaComandosResultado || []")
        if len(r) >= 3: break
        pg.wait_for_timeout(500)
    print("resultados:", [(x["id"][0], x["ok"], x["mensagem"]) for x in r])
    por = {x["id"][0]: x for x in r}
    assert por["a"]["ok"] and "pausada" in por["a"]["mensagem"].lower(), por
    assert por["b"]["ok"] and "1 processo" in por["b"]["mensagem"], por
    assert not por["v"]["ok"], "comando desconhecido recusado"
    assert "x" not in por, "comando vencido (1 hora) não é executado"
    st = sw.evaluate("async () => { const o = await chrome.storage.local.get(['filaPausada', 'esteira_e1']); return { pausada: !!o.filaPausada, estado: o.esteira_e1.estado }; }")
    assert st["pausada"] and st["estado"] == "aguardando", st
    pg.wait_for_timeout(4500)      # pausada: o processo repetido NÃO começa
    assert sw.evaluate("async () => (await chrome.storage.local.get('esteira_e1')).esteira_e1.estado") == "aguardando", "pausada não pode iniciar processo"
    resumo = sw.evaluate("async () => (await chrome.storage.local.get('filaResumo')).filaResumo")
    assert resumo["pausadaManual"] is True, resumo
    # retomar (sem trabalho pendente, para não iniciar nada)
    sw.evaluate("""async () => { await chrome.storage.local.set({ esteira_ordem: ['c1'], filaComandos: [{ id: 'r'.repeat(32), tipo: 'retomar', ts: Date.now() }] }); await chrome.storage.local.remove('esteira_e1'); }""")
    for _ in range(40):
        if not sw.evaluate("async () => !!(await chrome.storage.local.get('filaPausada')).filaPausada"): break
        pg.wait_for_timeout(500)
    else: raise AssertionError("retomar deveria limpar a pausa")
    print("OK")
