"""Lupa do Magistrado (simulada com a estrutura dos prints): Nova Auditoria, minuta do assessor, autos por TEXTO ou PDF, Auditar Minuta."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-sidebar-minute-auditor" onclick="document.getElementById('m').style.display='block'">Auditoria Ouro</button>
<div id="m" class="fixed" style="display:none"><h2>Lupa do Magistrado &amp; Auditor de Minutas</h2>
<button id="tn" onclick="document.getElementById('f').style.display='block';document.getElementById('hist').style.display='none'">Nova Auditoria</button><button>Processos Auditados</button>
<div id="hist">Nenhum processo auditado encontrado</div>
<div id="f" style="display:none"><select><option>Outros Área Judicial - Criminal</option><option>Outros Área Judicial - Cível</option></select>
<input type="text" placeholder="Ex: 5012345-88.2026.8.09.0051"><textarea id="min"></textarea>
<button onclick="document.getElementById('up').style.display='block';document.getElementById('ta2').style.display='none'">Upload PDF</button><button onclick="document.getElementById('ta2').style.display='block';document.getElementById('up').style.display='none'">Colar Texto</button>
<div id="up" style="display:none"><input type="file" class="hidden"></div><textarea id="ta2" style="display:block"></textarea>
<button id="aud"><span>Auditar Minuta com Rigor do Magistrado</span></button></div></div>
<script>
document.getElementById('aud').onclick=()=>{ const b=document.getElementById('aud'); window.auditou={min:document.getElementById('min').value, autos:document.getElementById('ta2').value, arq:(document.querySelector('input[type=file]').files[0]||{}).name||''}; b.disabled=true; b.innerHTML='<span>Auditando…</span>'; setTimeout(()=>{b.disabled=false;b.innerHTML='<span>Auditar Minuta com Rigor do Magistrado</span>'},2000) };
</script></body></html>"""


def rodar(pg, extra, nome):
    pg.evaluate("() => { window.auditou = null; window.__r = null; }")
    pg.evaluate("([ex]) => window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', arquivoId: ex.arq || '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Cível', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor.\\nSegundo parágrafo.', ...ex.dados }, {}, (r) => { window.__r = r })", [extra])
    pg.wait_for_function("window.__r", timeout=90000)
    r = pg.evaluate("window.__r"); print(nome, r); assert r.get("ok"), r
    return pg.evaluate("window.auditou")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    a = rodar(pg, {"dados": {"texto": "[Página 1]\nAutos em texto. " + "z" * 300}}, "texto")
    assert a["min"].startswith("Minuta do assessor") and a["autos"].startswith("[Página 1]") and a["arq"] == "", a
    assert pg.evaluate("document.querySelector('select').selectedOptions[0].text").endswith("Cível")
    pg.evaluate("([b64]) => window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {})", [base64.b64encode(b"%PDF-1.4 t").decode()])
    a = rodar(pg, {"arq": "a1", "dados": {}}, "pdf")
    assert a["arq"] == "x-OCR.pdf" and a["min"].startswith("Minuta do assessor"), a
    b.close()
print("OK")
