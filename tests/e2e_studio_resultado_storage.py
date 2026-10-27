"""Lupa do Magistrado (simulada com a estrutura dos prints): Nova Auditoria, minuta do assessor, autos por TEXTO ou PDF, Auditar Minuta."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-sidebar-minute-auditor" onclick="document.getElementById('m').style.display='block'">Auditoria Ouro</button>
<div id="m" class="fixed" style="display:none"><h2>Lupa do Magistrado &amp; Auditor de Minutas</h2>
<button id="tn" onclick="document.getElementById('f').style.display='block';document.getElementById('hist').style.display='none'">Nova Auditoria</button><button onclick="document.getElementById('hist').style.display='block'">Processos Auditados</button>
<div id="hist" style="display:none">Nenhum processo auditado encontrado</div>
<div id="f" style="display:none"><select><option>Outros Área Judicial - Criminal</option><option>Outros Área Judicial - Cível</option></select>
<input type="text" placeholder="Ex: 5012345-88.2026.8.09.0051"><button id="limpar" onclick="window.limpou=(window.limpou||0)+1;document.getElementById('min').value='';document.getElementById('ta2').value=''">Limpar Tudo (Novo Cadastro)</button><textarea id="min">AUDITORIA ANTERIOR</textarea>
<button onclick="document.getElementById('up').style.display='block';document.getElementById('ta2').style.display='none'">Upload PDF</button><button onclick="document.getElementById('ta2').style.display='block';document.getElementById('up').style.display='none'">Colar Texto</button>
<div id="up" style="display:none"><input type="file" class="hidden"></div><textarea id="ta2" style="display:block">AUTOS ANTERIORES</textarea>
<button id="aud"><span>Auditar Minuta com Rigor do Magistrado</span></button></div></div>
<script>
document.getElementById('aud').onclick=()=>{ const b=document.getElementById('aud'); document.getElementById('hist').textContent=(document.getElementById('hist').textContent.replace('Nenhum processo auditado encontrado','')+' '+document.querySelector('input[type=text]').value); window.auditou={min:document.getElementById('min').value, autos:document.getElementById('ta2').value, arq:(document.querySelector('input[type=file]').files[0]||{}).name||''}; b.disabled=true; b.innerHTML='<span>Auditando…</span>'; setTimeout(()=>{b.disabled=false;b.innerHTML='<span>Auditar Minuta com Rigor do Magistrado</span>'},2000) };
</script></body></html>"""



with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    # o storage de mentira guarda o que o app grava: é por ali que o resultado chega à extensão quando o pedido leva reqId
    pg.evaluate("window.__salvo = {}; window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { Object.assign(window.__salvo, o); return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("""() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', reqId: 'tLupa1', arquivoId: '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Cível', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor para auditar. ' + 'y'.repeat(300), texto: '[Página 1]\\nAutos em texto. ' + 'z'.repeat(300) }, {}, (r) => { window.__r = r; }); }""")
    pg.wait_for_function("window.__r", timeout=15000)
    r = pg.evaluate("window.__r"); print("resposta imediata:", r)
    assert r.get("ok") and r.get("assincrono"), r      # responde já, sem esperar a auditoria (o canal pode cair)
    pg.wait_for_function("window.__salvo && window.__salvo['studio_res_tLupa1']", timeout=90000)
    res = pg.evaluate("window.__salvo['studio_res_tLupa1']"); print("resultado no storage:", res)
    assert res.get("ok"), res
    # análise normal também (modo sem Turbo/Mesa): resultado pelo storage
    pg.evaluate("""() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', reqId: 'tAna1', arquivoId: '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Cível', processo: '5001234-56.2026.8.09.0166', texto: '[Página 1]\\nAutos em texto. ' + 'z'.repeat(300) }, {}, (r) => { window.__r = r; }); }""")
    pg.wait_for_function("window.__r", timeout=15000)
    assert pg.evaluate("window.__r").get("assincrono"), pg.evaluate("window.__r")
    pg.wait_for_function("window.__salvo && window.__salvo['studio_res_tAna1']", timeout=30000)
    print("analise normal no storage:", pg.evaluate("window.__salvo['studio_res_tAna1']"))
    b.close()
print("OK")
