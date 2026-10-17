"""Processo gigante na esteira: o app (Studio) lê os autos em lotes em segundo plano; a extensão percebe o novo trabalho,
devolve {gigante: true, jobId} na hora (a fila segue) e a consulta de andamento (studio-gigantes) responde."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button>Nova Análise</button><div id="tour-input-panel">
<select><option>Outros Área Judicial - Criminal</option></select>
<button onclick="window.modo='pdf'">PDF</button><button id="btxt" onclick="document.getElementById('ta').style.display='block';window.modo='txt'">Texto / Casos</button>
<textarea id="ta" style="display:none"></textarea><input type="file" class="hidden"></div>
<label><input type="checkbox" id="duas" checked><span>Execução em 2 Etapas</span></label>
<button id="tour-execute-btn" disabled><span>Gerar Minuta - 1ª Etapa (Fatos &amp; Relatório)</span></button><h3>Resultado &amp; Análise</h3><div id="res"></div>
<script>
const ta=document.getElementById('ta'), b=document.getElementById('tour-execute-btn');
ta.addEventListener('input',()=>{ b.disabled=ta.value.length<10 });
// o app, ao ver autos acima do limite, cria o trabalho gigante e publica o resumo no atributo da página (sem gerar minuta na tela)
b.onclick=()=>{ document.documentElement.dataset.gigantes = JSON.stringify([{id:'gig-123', processo:'5530114-61.2025.8.09.0166', status:'lendo', historicoId:'', erro:''}]); window.autoDuranteAnalise = document.documentElement.dataset.assessorAuto; };
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg = ctx.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', arquivoId: '', nome: 'x.pdf', prompt: 'Outros Área Judicial - Criminal', texto: '[Página 1]\\nAutos. ' + 'y'.repeat(400), processo: '5530114-61.2025.8.09.0166', ate1: true }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=60000)
    r = pg.evaluate("window.__r"); print("A", r)
    assert r["ok"] and r["gigante"] is True and r["jobId"] == "gig-123", r
    assert pg.evaluate("window.autoDuranteAnalise") == "1", "o app precisa saber que é a esteira que está operando"
    assert pg.evaluate("document.documentElement.dataset.assessorAuto") is None, "o aviso de modo automático deve ser retirado ao terminar"
    pg.evaluate("() => { window.__g = null; window.__ouvinte({ acao: 'studio-gigantes' }, {}, (r) => { window.__g = r }) }")
    g = pg.evaluate("window.__g"); print("B", g)
    assert g["ok"] and g["jobs"][0]["id"] == "gig-123" and g["jobs"][0]["status"] == "lendo"
    b.close()
print("OK")
