"""Lupa do Magistrado (simulada com a estrutura dos prints): Nova Auditoria, minuta do assessor, autos por TEXTO ou PDF, Auditar Minuta."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-sidebar-minute-auditor" onclick="document.getElementById('m').style.display='block'">Auditoria Ouro</button>
<div id="m" class="fixed" style="display:none"><h2>Lupa do Magistrado &amp; Auditor de Minutas</h2>
<button id="tn" onclick="document.getElementById('f').style.display='block';document.getElementById('hist').style.display='none'">Nova Auditoria</button><button onclick="document.getElementById('hist').style.display='block'">Processos Auditados</button>
<div id="hist" style="display:none">Nenhum processo auditado encontrado</div>
<div id="f" style="display:none"><select><option>Outros Área Judicial - Criminal</option><option>Outros Área Judicial - Cível</option><option>Outros Área Judicial - Fazenda Pública Comum</option><option>Outros Área Judicial - Execução Fiscal Municipal</option></select>
<input type="text" placeholder="Ex: 5012345-88.2026.8.09.0051"><button id="limpar" onclick="window.limpou=(window.limpou||0)+1;document.getElementById('min').value='';document.getElementById('ta2').value=''">Limpar Tudo (Novo Cadastro)</button><textarea id="min">AUDITORIA ANTERIOR</textarea>
<button onclick="document.getElementById('up').style.display='block';document.getElementById('ta2').style.display='none'">Upload PDF</button><button onclick="document.getElementById('ta2').style.display='block';document.getElementById('up').style.display='none'">Colar Texto</button>
<div id="up" style="display:none"><input type="file" class="hidden"></div><textarea id="ta2" style="display:block">AUTOS ANTERIORES</textarea>
<button id="aud"><span>Auditar Minuta com Rigor do Magistrado</span></button></div></div>
<script>
document.getElementById('aud').onclick=()=>{ const b=document.getElementById('aud'); document.getElementById('hist').textContent=(document.getElementById('hist').textContent.replace('Nenhum processo auditado encontrado','')+' '+document.querySelector('input[type=text]').value); window.auditou={min:document.getElementById('min').value, autos:document.getElementById('ta2').value, arq:(document.querySelector('input[type=file]').files[0]||{}).name||''}; b.disabled=true; b.innerHTML='<span>Auditando…</span>'; setTimeout(()=>{b.disabled=false;b.innerHTML='<span>Auditar Minuta com Rigor do Magistrado</span>'},2000) };
</script></body></html>"""


def rodar(pg, extra, nome):
    pg.evaluate("() => { window.auditou = null; window.__r = null; }")
    pg.evaluate("([ex]) => window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', arquivoId: ex.arq || '', nome: 'x-OCR.pdf', prompt: ex.prompt, dicas: ex.dicas || '', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor.\\nSegundo parágrafo.', ...ex.dados }, {}, (r) => { window.__r = r })", [extra])
    pg.wait_for_function("window.__r", timeout=90000)
    r = pg.evaluate("window.__r"); print(nome, r); assert r.get("ok"), r
    return r


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "prompt-similar.js")); pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    dados = {"texto": "[Página 1]\nAutos em texto. " + "z" * 300}
    sel = lambda: pg.evaluate("document.querySelector('select').selectedOptions[0].text")
    # 1) sem o prompt "Execução Fiscal Estadual": usa o parecido (Municipal) e avisa
    r = rodar(pg, {"dados": dados, "prompt": "Outros Área Judicial - Execução Fiscal Estadual"}, "estadual→municipal")
    assert sel().endswith("Execução Fiscal Municipal") and "parecido" in r["mensagem"], (sel(), r["mensagem"][:300])
    # 2) prompt exato continua sendo usado, sem aviso
    r = rodar(pg, {"dados": dados, "prompt": "Outros Área Judicial - Fazenda Pública Comum"}, "exato")
    assert sel().endswith("Fazenda Pública Comum") and "parecido" not in r["mensagem"]
    # 3) tradução Outras/Outros não atrapalha
    r = rodar(pg, {"dados": dados, "prompt": "Outras Área Judicial - Execução Fiscal Estadual"}, "traduzido")
    assert sel().endswith("Execução Fiscal Municipal")
    # 4) NÃO troca de matéria: Família não existe → erro claro, nada escolhido à força
    pg.evaluate("window.__r = null")
    pg.evaluate("([ex]) => window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', arquivoId: '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Família e Sucessões', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor. ' + 'a'.repeat(300), ...ex.dados }, {}, (r) => { window.__r = r })", [{"dados": dados}])
    pg.wait_for_function("window.__r", timeout=60000); r = pg.evaluate("window.__r"); print("familia", r)
    assert not r.get("ok") and "não achei o prompt" in (r.get("erro") or ""), r
    # 5) sem o prompt da serventia no nome, a matéria da serventia (dica) decide
    r = rodar(pg, {"dados": dados, "prompt": "Prompt Personalizado do Juiz", "dicas": "Goiânia - 3º Núcleo de Justiça 4.0 - Execução Fiscal Municipal"}, "dica")
    assert sel().endswith("Execução Fiscal Municipal"), sel()
    b.close()
print("OK")
