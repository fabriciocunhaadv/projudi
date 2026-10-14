"""Estúdio traduzido pelo Chrome: “Outros” vira “Outras” nos nomes dos prompts (a extensão aceita as duas formas) e, se o prompt
mesmo assim não existir, a mensagem de erro explica que o Chrome está traduzindo a página."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button>Nova Análise</button><div id="tour-input-panel">
<select id="sp"><option>Outras Área Judicial - Criminal</option><option>Outras Área Judicial - Execução Fiscal Municipal</option></select><script>document.getElementById("sp").addEventListener("change",e=>{window.escolhido=e.target.selectedOptions[0].text})</script>
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
    if(window.lento){ b.disabled=true; b.innerHTML='<span>Processando e elaborando minuta judicial...</span>'; setTimeout(()=>{ b.disabled=false; b.innerHTML='<span>'+rot()+'</span>' },3000) }
    document.getElementById('prox').onclick=function(){ this.disabled=true; this.textContent='Executando...'; setTimeout(()=>{ final() },1200) } },1500) };
</script></body></html>"""

def rodar(ctx, prompt, traduzida=False):
    pg = ctx.new_page(); pg.set_content(PAG)
    if traduzida: pg.evaluate("document.documentElement.className = 'translated-ltr'")
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pg.evaluate("(p) => { window.__r = null; window.__ouvinte({ acao: 'studio-analisar', modo: 'analise', arquivoId: '', nome: 'x.pdf', prompt: p, texto: '[Página 1]\\nAutos. ' + 'y'.repeat(300), ate1: true }, {}, (r) => { window.__r = r }) }", prompt)
    pg.wait_for_function("window.__r", timeout=60000)
    return pg, pg.evaluate("window.__r")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); ctx = b.new_context()
    # 1) o app (traduzido) mostra “Outras…”; a configuração da extensão diz “Outros…”: escolhe o prompt certo
    pg, r = rodar(ctx, "Outros Área Judicial - Execução Fiscal Municipal", traduzida=True); print("1)", r.get("ok"), r.get("erro"), pg.evaluate("window.escolhido"))
    assert pg.evaluate("window.escolhido") == "Outras Área Judicial - Execução Fiscal Municipal", pg.evaluate("window.escolhido")
    # 2) prompt que não existe, página traduzida: o erro cita a tradução
    pg, r = rodar(ctx, "Outros Área Judicial - Execução Fiscal Estadual", traduzida=True); print("2)", r.get("ok"), r.get("erro"))
    assert not r.get("ok") and "não achei o prompt" in r["erro"] and "TRADUZINDO" in r["erro"], r
    # 3) o mesmo erro sem tradução não menciona o Chrome
    pg, r = rodar(ctx, "Outros Área Judicial - Execução Fiscal Estadual"); print("3)", r.get("erro"))
    assert not r.get("ok") and "TRADUZINDO" not in r["erro"], r
    b.close()
print("OK")
