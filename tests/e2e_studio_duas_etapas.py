"""Análise principal com o app em “Execução em 2 Etapas” (padrão novo): a extensão desliga a opção durante a análise,
devolve ao estado do usuário e, se a 1ª etapa sair mesmo assim, aperta “Prosseguir para 2ª Etapa”."""
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
const ta=document.getElementById('ta'), b=document.getElementById('tour-execute-btn'), duas=document.getElementById('duas'); window.cliques=[];
const ligada=()=> duas.isConnected ? duas.checked : true;
const rot=()=> ligada() ? 'Gerar Minuta - 1ª Etapa (Fatos & Relatório)' : 'Gerar Minuta Judicial Completa';
duas.addEventListener('change',()=>{ window.cliques.push(duas.checked); b.innerHTML='<span>'+rot()+'</span>' });
ta.addEventListener('input',()=>{ b.disabled=ta.value.length<10 });
function final(){ document.getElementById('res').innerHTML='<div id="tour-result-tabs"></div><div class="font-serif"><div>x</div><div><h3>DISPOSITIVO</h3><div class="markdown-body"><p>Minuta COMPLETA de teste. '+'z'.repeat(300)+'</p></div></div></div>' }
b.onclick=()=>{ const una=ligada(); b.disabled=true; b.innerHTML='<span>Analisando…</span>';
  setTimeout(()=>{ b.disabled=false; b.innerHTML='<span>'+rot()+'</span>';
    if(!una){ final(); return }
    document.getElementById('res').innerHTML='<div id="tour-result-tabs"></div><div class="font-serif"><div>x</div><div><h3>DISPOSITIVO</h3><div class="markdown-body"><p>Minuta 1ª ETAPA. '+'z'.repeat(300)+'</p></div></div></div><button id="prox">Prosseguir para 2ª Etapa</button>';
    document.getElementById('prox').onclick=function(){ this.disabled=true; this.textContent='Executando...'; setTimeout(()=>{ final() },1200) } },1500) };
</script></body></html>"""

def rodar(ctx, ligada):
    pg = ctx.new_page(); pg.set_content(PAG)
    if not ligada: pg.evaluate("document.getElementById('duas').closest('label').remove()")      # sem a opção na tela: cai no botão “Prosseguir”
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("() => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', arquivoId: '', nome: 'x.pdf', prompt: 'Outros Área Judicial - Criminal', texto: '[Página 1]\\nAutos. ' + 'y'.repeat(300) }, {}, (r) => { window.__r = r }) }")
    pg.wait_for_function("window.__r", timeout=60000)
    return pg, pg.evaluate("window.__r")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    pg, r = rodar(ctx, True); print("A", r.get("ok"), r.get("erro"))
    assert r["ok"] and "COMPLETA" in r["minuta"], r
    assert pg.evaluate("window.cliques") == [False, True], pg.evaluate("window.cliques")      # desligou e religou
    assert pg.evaluate("document.getElementById('duas').checked") is True
    pg, r = rodar(ctx, False); print("B", r.get("ok"), r.get("erro"))
    assert r["ok"] and "COMPLETA" in r["minuta"], r
    b.close()
print("OK")
