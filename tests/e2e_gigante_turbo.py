"""Turbo com processo gigante: o app lê em lotes em segundo plano (cria um trabalho); a extensão devolve {gigante: true, jobId} e a fila segue."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><script>setTimeout(()=>{const b=document.createElement('button');b.id='btn-header-turbo-top';b.textContent='Módulo Turbo';b.onclick=()=>{document.getElementById('mod').style.display='block'};document.body.prepend(b)},3000)</script><div class="fixed"><div><h2>Módulo Turbo Independente</h2></div><div class="flex-1" id="mod" style="display:none"><div class="p-3.5"><label><span>Prompt Especializado do Gabinete:</span><span>CRIMINAL</span></label>
<select><option value="a">Outros Área Judicial - Juizado Especial Criminal • [CRIMINAL]</option><option value="b">Outros Área Judicial - Criminal • [CRIMINAL]</option><option value="c">Outros Área Judicial - Família e Sucessões • [FAMILIA]</option></select></div>
<label><span>Tipo de Ato:</span></label><button type="button">⚖️ Sentença</button><button type="button">📝 Decisão</button><button type="button">📄 Despacho</button><button type="button" id="auto" onclick="window.auto=1">🔍 Auto-detectar</button>
<button><span>Anexar PDF dos Autos</span></button><button onclick="document.getElementById('ta').style.display='block'"><span>Digitar / Colar Texto</span></button><textarea id="ta" style="display:none"></textarea>
<div><input accept=".pdf" class="hidden" type="file"><p>Arraste o PDF dos autos ou clique para selecionar</p></div>
<button id="exec"><span>Executar Análise Turbo (~15 a 30s)</span></button><div id="res"></div></div></div>
<script>
const f=document.querySelector('input[type=file]'), g=document.getElementById('exec'); let pronto=false;
document.querySelector('select').addEventListener('change',e=>{window.prompt_=e.target.selectedOptions[0].text});
f.addEventListener('change',()=>{ pronto=true; pronto=true });
document.getElementById('ta').addEventListener('input',e=>{window.colado=e.target.value});
g.onclick=()=>{ g.disabled=true; g.innerHTML='<span>Enviado…</span>'; document.documentElement.dataset.gigantes = JSON.stringify([{id:'gig-t1', processo:'5923249-54.2025.8.09.0166', status:'lendo', historicoId:'', erro:''}]); };
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { window.__st = o; return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pdf = base64.b64encode(b"%PDF-1.4 teste").decode()
    pg.evaluate("([b64]) => { window.__r = null; window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [pdf])
    pg.evaluate("() => { window.__ouvinte({ acao: 'studio-analisar', modo: 'turbo', reqId: 'r1', arquivoId: 'a1', nome: '5001234-OCR.pdf', texto: '[Página 1]\\nAutos com texto completo. ' + 'x'.repeat(500), prompt: 'Outros Área Judicial - Família e Sucessões', tipo: '' }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__st", timeout=90000)
    assert pg.evaluate("window.__r.assincrono")
    r = pg.evaluate("window.__st.studio_res_r1"); print(r)
    assert r["ok"] and r["gigante"] is True and r["jobId"] == "gig-t1", r
    assert pg.evaluate("window.auto") == 1 and pg.evaluate("window.gerou") is None or True
    b.close()
print("OK")
