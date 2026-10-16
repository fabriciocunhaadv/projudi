"""Mesa de Audiência (simulada): a extensão abre a Mesa, clica em Nova, entrega o PDF e espera a análise; também o erro de IA vira falha sem repetir."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-header-hearing-workbench-tools" title="Mesa de Audiências &amp; Instrução Judicial" onclick="abrir()">Mesa de Audiências</button><div id="mesa"></div>
<script>
function abrir(){ document.getElementById('mesa').innerHTML='<h3>PAUTA DE AUDIÊNCIAS</h3><button id="nova">+ Nova</button><div id="det"></div>';
 document.getElementById('nova').onclick=()=>{ window.cliques=(window.cliques||0)+1; document.getElementById('det').innerHTML='<input type="file" multiple accept=".pdf,.txt" class="hidden"><textarea id="r"></textarea><div id="msg"></div>';
  const f=document.querySelector('input[type=file]'); f.addEventListener('change',()=>{ window.nome=f.files[0].name; document.getElementById('msg').textContent='Extraindo autos (1/1)';
   setTimeout(()=>{ document.getElementById('msg').textContent= window.falhar ? 'Falha ao processar comando com IA (HTTP 504): o servidor demorou' : ''; if(!window.falhar) document.getElementById('r').value='Resumo fático extraído pela IA '+'x'.repeat(100); },1500); }); } }
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { window.__st = Object.assign(window.__st || {}, o); return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pdf = base64.b64encode(b"%PDF-1.4 teste").decode()
    pg.evaluate("([b64]) => { window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [pdf])
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'mesa', reqId: 'm1', arquivoId: 'a1', nome: '5001234-OCR.pdf' }, {}, () => {})")
    pg.wait_for_function("window.__st && window.__st.studio_res_m1", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m1"); print(r)
    print(pg.evaluate("[window.cliques, window.nome]"))
    assert r["ok"] and "Mesa de Audiência" in r["mensagem"] and pg.evaluate("window.cliques") == 1 and pg.evaluate("window.nome") == "5001234-OCR.pdf", r
    # falha da IA: erro final, sem repetir
    pg.evaluate("window.falhar = true")
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'mesa', reqId: 'm2', arquivoId: 'a1', nome: 'x.pdf' }, {}, () => {})")
    pg.wait_for_function("window.__st.studio_res_m2", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m2"); print(r)
    assert not r["ok"] and r["semRetry"] and "504" in r["erro"], r
    b.close()
print("OK")
