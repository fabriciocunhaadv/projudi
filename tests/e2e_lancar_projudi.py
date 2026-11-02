"""Lançar no Projudi: as funções que rodam na página do Projudi (escolher Tipo/Modelo e colocar a minuta no editor), contra uma tela SIMULADA
da pré-análise (rótulos, campo com sugestões, campo só com lupa + janela de busca, CKEditor falso com o modelo do gabinete).
Não valida a tela real do Projudi: só a lógica."""
import glob, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = (Path(__file__).parent.parent / "extensao" / "lancar-projudi.js").read_text(encoding="utf-8")
MODELO = ('<p style="text-align:center"><strong>PODER JUDICIÁRIO</strong></p><p>Natureza: PROCESSO CÍVEL</p><p>Processo nº: 5914870-27.2025.8.09.0166</p>'
          '<p style="text-align:center"><strong>DECISÃO</strong></p><p>I.C.</p><p><strong>Atenda-se.</strong></p><p>MCG, data do sistema</p><p>Rafael Machado de Souza</p>')
PAGINA = """<html><body>
<h2>» Pré-Analisar Autos Conclusos</h2><div>5914870.27</div>
<div id="menu"><span>Modelo</span></div>
<div class="linha"><label>Tipo de Arquivo</label> <i class="fa-search" title="Pesquisar" id="lupaTipo"></i> <input id="tipo" type="text" placeholder="Digite o Tipo de Arquivo"></div>
<div class="linha"><label>Modelo</label> <i class="fa-search" title="Pesquisar" id="lupaModelo"></i> <input id="modelo" type="text" readonly placeholder="Modelo"></div>
<ul class="ui-autocomplete" id="sug" style="display:none"></ul>
<div id="busca_padrao" class="modalBusca" style="display:none"><div id="busca_padrao_campos"><input type="text" id="f"></div><input type="submit" id="busca_padraoLocalizar" value="Consultar"><div id="divTabelaBuscaPadrao"><table></table></div></div>
<script>
const TIPOS=['Decisão','Despacho','Sentença','Decisão Interlocutória'], MODELOS={'Decisão':['Decisão Padrão','Decisão Cível'],'Despacho':['Despacho Padrão'],'Sentença':['Sentença Padrão']};
let atual='';
const tipo=document.getElementById('tipo'), modelo=document.getElementById('modelo'), sug=document.getElementById('sug');
tipo.addEventListener('input',()=>{ sug.innerHTML=TIPOS.filter(t=>t.toLowerCase().includes(tipo.value.toLowerCase())).map(t=>'<li class="ui-menu-item"><a>'+t+'</a></li>').join(''); sug.style.display='block'; });
sug.addEventListener('click',e=>{ const li=e.target.closest('li'); if(!li) return; tipo.value=li.textContent; atual=tipo.value; sug.style.display='none'; modelo.readOnly=false; });
document.getElementById('lupaModelo').onclick=()=>{ document.getElementById('busca_padrao').style.display='block'; };
document.getElementById('busca_padraoLocalizar').onclick=()=>{ const q=document.getElementById('f').value.toLowerCase();
  document.querySelector('#divTabelaBuscaPadrao table').innerHTML=(MODELOS[atual]||[]).filter(m=>m.toLowerCase().includes(q)).map(m=>'<tr><td><a href="#" class="sel">'+m+'</a></td></tr>').join(''); };
document.getElementById('divTabelaBuscaPadrao').addEventListener('click',e=>{ const a=e.target.closest('a.sel'); if(!a) return; modelo.value=a.textContent; document.getElementById('busca_padrao').style.display='none'; window.CKEDITOR.instances.e.setData(window.__MODELO); });
window.__MODELO = __MODELO__;
window.CKEDITOR={instances:{e:{_d:'',getData(){return this._d},setData(h){this._d=h},updateElement(){this.u=true},fire(){}}}};
</script></body></html>""".replace("__MODELO__", json.dumps(MODELO))

exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]); pg = b.new_page()
    pg.set_content(PAGINA); pg.add_script_tag(content=SRC)
    assert pg.evaluate("lpNaPaginaPreAnalise('591487027')") is True and pg.evaluate("lpNaPaginaPreAnalise('111111111')") is False
    assert pg.evaluate("lpTipoDoAto('SENTENÇA\\nVistos')") == "Sentença" and pg.evaluate("lpTipoDoAto('DESPACHO\\nIntime-se')") == "Despacho" and pg.evaluate("lpTipoDoAto('DECISÃO INTERLOCUTÓRIA')") == "Decisão"
    r = pg.evaluate("lpEscolherCampo('Tipo de Arquivo', 'Decisão')"); print(r); assert r["ok"] and pg.input_value("#tipo") == "Decisão", r
    r = pg.evaluate("lpEscolherCampo('Modelo', 'Decisão Padrão')"); print(r); assert r["ok"] and pg.input_value("#modelo") == "Decisão Padrão" and "lupa" in r["via"], r
    assert "Atenda-se" in pg.evaluate("lpLerEditor()")
    minuta_html = "<h3>DECISÃO</h3><p>Trata-se de pedido de <b>habilitação</b>.</p><h3>DISPOSITIVO</h3><p>Defiro.</p><blockquote>art. 104 do CPC</blockquote>"
    r = pg.evaluate("([h,t]) => lpInserirNoEditor(h, t)", [minuta_html, "DECISÃO\nTrata-se"]); print(r)
    assert r["ok"] and r["tituloAchado"] and r["assinaturaAchada"] and r["removidos"] == 2, r
    novo = pg.evaluate("lpLerEditor()")
    assert "Trata-se de pedido de <b>habilitação</b>" in novo or "<strong>habilitação</strong>" in novo or "habilitação" in novo
    assert novo.count("DECISÃO") == 1, "o título não pode duplicar"
    assert "Atenda-se" not in novo and "I.C." not in novo, "texto-padrão do modelo deve sair"
    assert "MCG, data do sistema" in novo and "Rafael Machado de Souza" in novo and "PODER JUDICIÁRIO" in novo, "cabeçalho e assinatura ficam"
    assert novo.index("DECISÃO") < novo.index("Trata-se") < novo.index("DISPOSITIVO") < novo.index("MCG, data do sistema")
    assert "text-indent:2.5cm" in novo.replace(" ", "")
    # sem título/assinatura no modelo: vai para o fim, sem apagar nada
    pg.evaluate("window.CKEDITOR.instances.e.setData('<p>texto livre</p>')")
    r = pg.evaluate("([h,t]) => lpInserirNoEditor(h, t)", ["<p>Minuta</p>", "Minuta"]); assert r["ok"] and not r["tituloAchado"] and "texto livre" in pg.evaluate("lpLerEditor()")
    # campo inexistente
    r = pg.evaluate("lpEscolherCampo('Rótulo que não existe', 'x')"); assert not r["ok"] and "não achei o campo" in r["motivo"], r
    b.close()
print("OK")
