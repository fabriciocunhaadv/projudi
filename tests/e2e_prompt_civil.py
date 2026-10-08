"""Prompt sugerido como “Civil” (grafia antiga) acha a opção “Cível” do app."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button>Nova Análise</button><div id="tour-input-panel">
<select><option>Outros Área Judicial - Criminal</option><option>Outros Área Judicial - Cível</option><option>Outros Área Judicial - Família e Sucessões</option></select>
<button id="bpdf" onclick="window.modo='pdf'">PDF</button><button id="btxt" onclick="document.getElementById('ta').style.display='block';window.modo='txt'">Texto / Casos</button>
<textarea id="ta" style="display:none"></textarea><input type="file" class="hidden"></div>
<button id="tour-execute-btn" disabled><span>Gerar Minuta Judicial</span></button><h3>Resultado &amp; Análise</h3><div id="res"></div>
<script>
const ta=document.getElementById('ta'), b=document.getElementById('tour-execute-btn');
ta.addEventListener('input',()=>{ window.colado=ta.value; b.disabled=ta.value.length<10 });
b.onclick=()=>{ b.disabled=true; b.innerHTML='<span>Analisando…</span>'; setTimeout(()=>{ b.disabled=false; b.innerHTML='<span>Gerar Minuta Judicial</span>'; document.getElementById('res').innerHTML='<div id="tour-result-tabs"></div><div class="font-serif"><div>x</div><div><h3>DISPOSITIVO</h3><div class="markdown-body"><p>'+'Minuta de teste. '.repeat(30)+'</p></div></div></div>' },1500) };
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', arquivoId: '', nome: 'x.pdf', prompt: 'Outros Area Judicial - Civil', texto: '[Página 1]\\nAutos completos. ' + 'y'.repeat(300) }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=60000)
    r = pg.evaluate("window.__r"); print(r.get("ok"), r.get("erro"))
    assert r["ok"] and "Minuta de teste" in r["minuta"], r
    assert pg.evaluate("window.modo") == "txt" and pg.evaluate("window.colado").startswith("[Página 1]")
    assert pg.evaluate("document.querySelector('select').selectedOptions[0].text").endswith("Cível")
    b.close()
print("OK")
