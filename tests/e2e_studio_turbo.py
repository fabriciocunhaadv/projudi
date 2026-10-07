"""Módulo Turbo Independente (simulado): a extensão escolhe o prompt, Auto-detectar, anexa o PDF e aperta gerar; espera o resultado."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><div><h2>Módulo Turbo Independente</h2></div><div class="flex-1"><div class="p-3.5"><label><span>Prompt Especializado do Gabinete:</span><span>CRIMINAL</span></label>
<select><option value="a">Outros Área Judicial - Juizado Especial Criminal • [CRIMINAL]</option><option value="b">Outros Área Judicial - Criminal • [CRIMINAL]</option><option value="c">Outros Área Judicial - Família e Sucessões • [FAMILIA]</option></select></div>
<label><span>Tipo de Ato:</span></label><button type="button">⚖️ Sentença</button><button type="button">📝 Decisão</button><button type="button">📄 Despacho</button><button type="button" id="auto" onclick="window.auto=1">🔍 Auto-detectar</button>
<button><span>Anexar PDF dos Autos</span></button><button><span>Digitar / Colar Texto</span></button>
<div><input accept=".pdf" class="hidden" type="file"><p>Arraste o PDF dos autos ou clique para selecionar</p></div>
<button id="exec"><span>Executar Análise Turbo (~15 a 30s)</span></button><div id="res"></div></div>
<script>
const f=document.querySelector('input[type=file]'), g=document.getElementById('exec'); let pronto=false;
document.querySelector('select').addEventListener('change',e=>{window.prompt_=e.target.selectedOptions[0].text});
f.addEventListener('change',()=>{ pronto=true; document.querySelector('.p-3\\.5').insertAdjacentHTML('beforeend','<i>'+f.files[0].name+'</i>') });
g.onclick=()=>{ g.disabled=true; g.innerHTML='<span>Analisando…</span>'; setTimeout(()=>{ g.disabled=false; g.innerHTML='<span>Executar Análise Turbo (~15 a 30s)</span>'; document.getElementById('res').innerHTML='<h3>Resultado &amp; Análise</h3><div id="tour-result-tabs"></div><div class="font-serif"><div>x</div><div><h3>DISPOSITIVO</h3><div class="markdown-body"><p>' + 'Texto da minuta turbo. '.repeat(20) + '</p></div></div></div>'; window.gerou=1 },2500) };
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pdf = base64.b64encode(b"%PDF-1.4 teste").decode()
    pg.evaluate("([b64]) => { window.__r = null; window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [pdf])
    pg.evaluate("() => { window.__ouvinte({ acao: 'studio-analisar', modo: 'turbo', arquivoId: 'a1', nome: '5001234-OCR.pdf', prompt: 'Outros Área Judicial - Criminal', tipo: '' }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=60000)
    r = pg.evaluate("window.__r"); print(r["ok"], r.get("erro"), r.get("mensagem"), len(r.get("minuta", "")))
    assert r["ok"] and "Texto da minuta turbo" in r["minuta"], r
    assert pg.evaluate("window.auto") == 1 and pg.evaluate("window.prompt_") == "Outros Área Judicial - Criminal • [CRIMINAL]" and pg.evaluate("window.gerou") == 1
    b.close()
print("OK")
