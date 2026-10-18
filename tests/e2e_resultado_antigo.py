"""Processo gigante na esteira: o app (Studio) lê os autos em lotes em segundo plano; a extensão percebe o novo trabalho,
devolve {gigante: true, jobId} na hora (a fila segue) e a consulta de andamento (studio-gigantes) responde."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button>Nova Análise</button><div id="tour-input-panel">
<select><option>Outros Área Judicial - Criminal</option></select>
<button onclick="window.modo='pdf'">PDF</button><button id="btxt" onclick="document.getElementById('ta').style.display='block'">Texto / Casos</button>
<textarea id="ta" style="display:none"></textarea><input type="file" class="hidden"></div>
<label><input type="checkbox" id="duas" checked><span>Execução em 2 Etapas</span></label>
<button id="tour-execute-btn" disabled><span>Gerar Minuta - 1ª Etapa (Fatos &amp; Relatório)</span></button>
<h3>Resultado &amp; Análise</h3>
<div id="tour-result-tabs">abas</div>
<div class="font-serif"><div id="tour-meta-parties-box">Processo nº: 5541798-51.2023.8.09.0166 Autor ANTIGO</div><div><h3>I - RELATÓRIO</h3><div class="markdown-body"><p>Minuta ANTIGA do processo anterior.</p></div></div></div>
<button>Prosseguir para 2ª Etapa</button>
<script>
const ta=document.getElementById('ta'), b=document.getElementById('tour-execute-btn');
ta.addEventListener('input',()=>{ b.disabled=ta.value.length<10 });
// o app mantém na tela o resultado do processo anterior; só 3 s depois entrega o novo
b.onclick=()=>{ setTimeout(()=>{ b.disabled=true; b.firstElementChild.textContent='Processando...'; }, 1500); setTimeout(()=>{ document.getElementById('tour-meta-parties-box').textContent='Processo nº: 5541750-92.2023.8.09.0166 Autor NOVO'; document.querySelector('.markdown-body p').textContent='Minuta NOVA do processo atual.'; b.firstElementChild.textContent='Gerar Minuta - 1ª Etapa (Fatos & Relatório)'; b.disabled=false; document.documentElement.dataset.historicoSalvo = JSON.stringify({id:'a1', processo:'5541750-92.2023.8.09.0166', ok:true, erro:'', t: Date.now()}); }, 4500); };
document.documentElement.dataset.historicoSuporte = '1';
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg = ctx.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', ate1: true, arquivoId: '', nome: 'x.pdf', prompt: 'Outros Área Judicial - Criminal', processo: '5541750-92.2023.8.09.0166', texto: '[Página 1]\\nAutos. ' + 'y'.repeat(400) }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=90000)
    r = pg.evaluate("window.__r"); print(r)
    assert r["ok"], r
    assert "NOVA" in r["minuta"] and "ANTIGA" not in r["minuta"], "a esteira pegou o resultado do processo anterior"
    print("OK (ignorou o resultado antigo e esperou o novo)")
    b.close()
