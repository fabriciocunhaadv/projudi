"""Ponte “Buscar minuta lançada”: o app pede (window.postMessage) → studio-base.js → background (mock) → devolve andamento e texto. Rodar: /usr/bin/python3 tests/e2e_minuta_lancada_ponte.py"""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page()
    pg.route("https://studio.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<html><body>studio</body></html>")); pg.goto("https://studio.test/")
    pg.evaluate("""() => { window.__pedidos = []; window.__respostas = [];
      window.chrome = { runtime: { id: "x", getManifest: () => ({ version: "3.0.6" }), lastError: null, onMessage: { addListener(f) { window.__ouvinte = f } },
        sendMessage(m, cb) { window.__pedidos.push(m); if (m.acao === "ler-minuta-lancada") setTimeout(() => cb(m.processo === "FALHA" ? { ok: false, erro: "não achei o editor", tela: "Pré-Analisar" } : { ok: true, html: "<p>Texto lançado</p>" }), 50); } },
        notifications: null, storage: { local: { set() { return Promise.resolve() }, get(k) { return Promise.resolve({ lancar_ultima_serventia: "https://projudi.tjgo.jus.br/x" }) } } } };
      window.addEventListener("message", (e) => { if (e.data && e.data.__projudiResp === "minuta-lancada") window.__respostas.push(e.data); }); }""")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    assert "minuta-lancada" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos"), "o recurso precisa ser anunciado ao app"
    pg.evaluate("() => window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', reqId: 'r1', processo: '5914870-27.2025.8.09.0166' }, window.location.origin)")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'fim')", timeout=5000)
    fim = pg.evaluate("window.__respostas.find(r => r.tipo === 'fim')")
    ped = pg.evaluate("window.__pedidos[0]")
    assert fim["ok"] and fim["html"] == "<p>Texto lançado</p>" and fim["reqId"] == "r1", fim
    assert ped["acao"] == "ler-minuta-lancada" and ped["processo"] == "5914870-27.2025.8.09.0166" and ped["serventiaUrl"] == "https://projudi.tjgo.jus.br/x", ped
    # andamento vindo do background é repassado ao app durante a leitura
    pg.evaluate("() => { window.__respostas = []; window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', reqId: 'r2', processo: 'FALHA' }, window.location.origin); }")
    pg.evaluate("() => window.__ouvinte({ acao: 'lancar-progresso', texto: 'lendo o texto salvo…' }, {}, () => {})")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'fim')", timeout=5000)
    rs = pg.evaluate("window.__respostas")
    assert any(r["tipo"] == "progresso" and "lendo" in r["texto"] and r["reqId"] == "r2" for r in rs), rs
    f2 = next(r for r in rs if r["tipo"] == "fim"); assert not f2["ok"] and "editor" in f2["erro"] and f2["tela"] == "Pré-Analisar", f2
    # pedido sem reqId ou de outra origem é ignorado
    pg.evaluate("() => { window.__pedidos = []; window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', processo: 'X' }, window.location.origin); }"); pg.wait_for_timeout(300)
    assert pg.evaluate("window.__pedidos.length") == 0, "sem reqId não deve pedir nada"
    b.close()
print("OK")
