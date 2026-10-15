"""Esteira → Studio (entrada PDF): se o app não registra o PDF, ou devolve minuta genérica (número 0000000, Parte Autora), a extensão dá erro claro em vez de aproveitar."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button onclick="document.getElementById('lista').textContent='';document.getElementById('res').innerHTML=''">Nova Análise</button><div id="tour-input-panel">
<select><option>Outros Área Judicial - Família e Sucessões</option></select>
<button>PDF</button><button>Texto / Casos</button><div id="lista"></div><input type="file" class="hidden"></div>
<button id="tour-execute-btn"><span>Gerar Minuta Judicial</span></button><h3>Resultado &amp; Análise</h3><div id="res"></div>
<script>
window.registra = true; window.numero = '5173237-43.2026.8.09.0166';
document.querySelector('input[type=file]').addEventListener('change', (e) => { if (window.registra) document.getElementById('lista').textContent = e.target.files[0].name });
document.getElementById('tour-execute-btn').onclick = () => { document.getElementById('res').innerHTML = '<div id="tour-result-tabs"></div><div class="font-serif"><div id="tour-meta-parties-box">Processo nº: ' + window.numero + ' Parte Autora</div><div><h3>I - RELATÓRIO</h3><div class="markdown-body"><p>' + 'Minuta de teste. '.repeat(20) + '</p></div></div></div>' };
</script></body></html>"""


def rodar(pg):
    pg.evaluate("window.__r = null")
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', ate1: true, arquivoId: 'a1', nome: '5173237-43.2026.8.09.0166-OCR.pdf', prompt: 'Outros Área Judicial - Família e Sucessões', processo: '5173237-43.2026.8.09.0166' }, {}, (r) => { window.__r = r })")
    pg.wait_for_function("window.__r", timeout=120000)
    return pg.evaluate("window.__r")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "prompt-similar.js")); pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("([b64]) => window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {})", [base64.b64encode(b"%PDF-1.4 t").decode()])
    r = rodar(pg); print("normal:", r.get("ok"), r.get("erro")); assert r["ok"], r
    pg.evaluate("window.numero = '0000000-00.0000.0.00.0000'")      # o app não leu os autos: minuta genérica
    r = rodar(pg); print("genérica:", r.get("erro")); assert not r["ok"] and "não são de 5173237-43" in r["erro"], r
    pg.evaluate("window.numero = '5173237-43.2026.8.09.0166'; window.registra = false")      # o app nem registra o PDF
    r = rodar(pg); print("sem PDF:", r.get("erro")); assert not r["ok"] and "não recebeu o PDF" in r["erro"], r
    b.close()
print("OK")
