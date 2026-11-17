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
        sendMessage(m, cb) { window.__pedidos.push(m); if (m.acao === "lancar-serventias") return Promise.resolve({ ok: true, serventias: [{ serventia: "Vara", url: "https://projudi.tjgo.jus.br/x" }], sugerida: "https://projudi.tjgo.jus.br/x" }); if (m.acao === "ler-minuta-lancada") setTimeout(() => cb(m.processo === "FALHA" ? { ok: false, erro: "não achei o editor", tela: "Pré-Analisar" } : { ok: true, html: "<p>Texto lançado</p>" }), 50); } },
        notifications: null, storage: { local: { set() { return Promise.resolve() }, get(k) { return Promise.resolve({ lancar_ultima_serventia: "https://projudi.tjgo.jus.br/x" }) } } } };
      window.addEventListener("message", (e) => { if (e.data && e.data.__projudiResp === "minuta-lancada") window.__respostas.push(e.data); }); }""")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    assert "minuta-lancada" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos"), "o recurso precisa ser anunciado ao app"
    pg.evaluate("() => window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', reqId: 'r1', processo: '5914870-27.2025.8.09.0166' }, window.location.origin)")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'fim')", timeout=5000)
    fim = pg.evaluate("window.__respostas.find(r => r.tipo === 'fim')")
    ped = pg.evaluate("window.__pedidos.find(p => p.acao === 'ler-minuta-lancada')")
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
    # lista de serventias para o usuário escolher (fase "serventias") e leitura NA serventia escolhida (sem adivinhar)
    assert "minuta-serventia" in pg.evaluate("document.documentElement.dataset.assessorExtensaoRecursos"), "o recurso de escolher serventia precisa ser anunciado"
    pg.evaluate("() => { window.__respostas = []; window.postMessage({ __projudi: 'minuta-lancada', fase: 'serventias', reqId: 's1', processo: '5914870-27.2025.8.09.0166' }, window.location.origin); }")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'serventias')", timeout=5000)
    sv = pg.evaluate("window.__respostas.find(r => r.tipo === 'serventias')")
    assert sv["reqId"] == "s1" and sv["serventias"][0]["url"] == "https://projudi.tjgo.jus.br/x" and sv["serventias"][0]["serventia"] == "Vara", sv
    pg.evaluate("() => { window.__pedidos = []; window.__respostas = []; window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', reqId: 'r3', processo: '5914870-27.2025.8.09.0166', serventiaUrl: 'https://projudi.tjgo.jus.br/ESCOLHIDA' }, window.location.origin); }")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'fim')", timeout=5000)
    ped3 = pg.evaluate("window.__pedidos.find(p => p.acao === 'ler-minuta-lancada')")
    assert ped3["serventiaUrl"] == "https://projudi.tjgo.jus.br/ESCOLHIDA", ped3
    assert not pg.evaluate("window.__pedidos.some(p => p.acao === 'lancar-serventias')"), "serventia escolhida pelo usuário: não adivinha"
    # serventia de OUTRO site é ignorada (cai na escolha automática)
    pg.evaluate("() => { window.__pedidos = []; window.__respostas = []; window.postMessage({ __projudi: 'minuta-lancada', fase: 'ler', reqId: 'r4', processo: '5914870-27.2025.8.09.0166', serventiaUrl: 'https://outro.site/x' }, window.location.origin); }")
    pg.wait_for_function("window.__respostas.some(r => r.tipo === 'fim')", timeout=5000)
    assert pg.evaluate("window.__pedidos.find(p => p.acao === 'ler-minuta-lancada').serventiaUrl") == "https://projudi.tjgo.jus.br/x", "URL de outro site não vale"
    b.close()
print("OK")
