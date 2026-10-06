"""Módulo Turbo Independente (simulado): a extensão escolhe o prompt, Auto-detectar, anexa o PDF e aperta gerar; espera o resultado."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="abrir-turbo" onclick="document.getElementById('m').style.display='block'">⚡ Turbo</button>
<div id="m" class="fixed" style="display:none"><h2>Módulo Turbo Independente</h2>
<select id="p"><option value="">Selecione</option><option value="1">Outros Área Judicial - Criminal • [CRIMINAL]</option><option value="2">Família • [FAM]</option></select>
<button id="tipoS">Sentença</button><button id="tipoD">Decisão</button><button id="auto" onclick="window.auto=1">Auto-detectar</button>
<button id="anexar">Anexar PDF dos Autos</button><input type="file" id="f" style="display:none">
<button id="gerar" disabled>⚡ Gerar Minuta Turbo</button><div id="res"></div></div>
<script>
const f=document.getElementById('f'), g=document.getElementById('gerar');
f.addEventListener('change',()=>{ document.getElementById('m').insertAdjacentHTML('beforeend','<p id="nome">'+f.files[0].name+'</p>'); g.disabled=false });
document.getElementById('p').addEventListener('change',e=>{window.prompt_=e.target.selectedOptions[0].text});
g.onclick=()=>{ g.disabled=true; g.textContent='Gerando...'; setTimeout(()=>{ g.disabled=false; g.textContent='⚡ Gerar Minuta Turbo'; document.getElementById('res').innerHTML='<h3>Resultado &amp; Análise</h3><div id="tour-result-tabs"></div><div class="font-serif"><div>x</div><div><h3>DISPOSITIVO</h3><div class="markdown-body"><p>' + 'Texto da minuta turbo. '.repeat(20) + '</p></div></div></div>'; window.gerou=1 },2500) };
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pdf = base64.b64encode(b"%PDF-1.4 teste").decode()
    pg.evaluate("([b64]) => { window.__r = null; window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [pdf])
    pg.evaluate("() => { window.__ouvinte({ acao: 'studio-analisar', modo: 'turbo', arquivoId: 'a1', nome: '5001234-OCR.pdf', prompt: 'CRIMINAL', tipo: '' }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=60000)
    r = pg.evaluate("window.__r"); print(r["ok"], r.get("erro"), r.get("mensagem"), len(r.get("minuta", "")))
    assert r["ok"] and "Texto da minuta turbo" in r["minuta"], r
    assert pg.evaluate("window.auto") == 1 and "CRIMINAL" in pg.evaluate("window.prompt_") and pg.evaluate("window.gerou") == 1
    b.close()
print("OK")
