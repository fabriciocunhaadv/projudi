"""Esteira: a aba dona publica o RESUMO da fila (só números/estados, sem número de processo) em chrome.storage.local para o celular."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    itens = [("a", "concluido", "ia", "jusbrasil", ""), ("b", "concluido", "ia", "jusbrasil", ""), ("c", "erro", "ia", "chatgpt", "ChatGPT: não achei a caixa de mensagem"), ("d", "pulado", "ia", "claude", ""), ("e", "pausado", "ia", "gemini", ""), ("f", "pausado", "analise", "", "")]
    sw.evaluate("""async (itens) => { const o = {}, ordem = []; for (const [id, estado, modo, iaId, erro] of itens) { ordem.push(id); o['esteira_' + id] = { id, processo: '5645680-24.2026.8.09.0166', modo, iaId, estado, erro, prompt: 'x', pdfNome: id + '.pdf', criadoEm: Date.now() }; } await chrome.storage.local.set({ ...o, esteira_ordem: ordem }); }""", itens)
    pg = ctx.new_page(); pg.goto(base + "esteira.html"); pg.wait_for_selector("body[data-executor='1']", timeout=15000)
    for _ in range(40):
        r = sw.evaluate("async () => (await chrome.storage.local.get('filaResumo')).filaResumo || null")
        if r: break
        pg.wait_for_timeout(500)
    print("resumo:", r)
    assert r and r["total"] == 6 and r["concluidos"] == 2 and r["erros"] == 1 and r["pausados"] >= 1, r
    assert "ChatGPT" in r["ultimoErro"] and r["versao"] and "5645680" not in json.dumps(r), "erro curto, versão e nenhum número de processo"
    print("OK")
