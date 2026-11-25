"""Minuta IA (página sintética, sem dados reais): anexa no input escondido, acrescenta o comando, envia, espera o editor abrir e "Minuta gerada"."""
import base64
from pathlib import Path
from playwright.sync_api import sync_playwright
agente = (Path(__file__).resolve().parent.parent / "extensao" / "ia-agente.js").read_text()
PAG = """<html><body><div id=chat><textarea aria-label="Instruções para a minuta" id=chat-input-1 style="width:300px;height:60px"></textarea>
<button aria-label="Enviar" id=s disabled>Enviar</button><input type=file aria-label="Selecionar arquivos do processo" style="display:none"><span id=docs></span></div>
<script>const t=document.querySelector('textarea'),s=document.getElementById('s');
t.addEventListener('input',()=>s.disabled=!t.value.trim());
document.querySelector('input').onchange=e=>{const nome=e.target.files[0].name;const d=document.createElement('div');d.id='imp';d.setAttribute('role','dialog');d.innerHTML='<h2>Importar arquivo(s)</h2><p>Selecione como deseja tratar 1 arquivo.</p><div>Arquivo: '+nome+'</div><label><input type=radio name=m id=r1 checked> Documento</label><label><input type=radio name=m id=r2> Modelo</label><button id=canc>Cancelar</button><button id=cont>Continuar</button>';document.body.appendChild(d);document.getElementById('cont').onclick=()=>{window.__modo=document.getElementById('r1').checked?'documento':'modelo';d.remove();document.getElementById('docs').textContent='Documentos (1) '+nome;};document.getElementById('canc').onclick=()=>d.remove();};
s.onclick=()=>{window.__cliques=(window.__cliques||0)+1; if(window.__cliques===1){const d=document.createElement('div');d.id='dlg';d.setAttribute('role','dialog');d.innerHTML='<h2>Atenção: nenhum contexto adicionado!</h2><button id=cont>Continuar sem contexto</button><button id=volta>Voltar</button>';document.body.appendChild(d);document.getElementById('volta').onclick=()=>d.remove();document.getElementById('cont').onclick=()=>{window.__semContexto=true;d.remove();};return;}
 window.__enviado=t.value;document.getElementById('chat').remove();const ed=document.createElement('div');document.body.appendChild(ed);
 ed.innerHTML='<div role=textbox aria-label="Conteúdo da minuta" contenteditable=true></div><div data-tiptap-ai-chat-messages></div>';
 const tx=ed.firstChild;let i=0;const iv=setInterval(()=>{tx.innerHTML+='<p>Trecho '+(++i)+' da decisão sintética, com texto suficiente para parecer uma minuta de verdade. </p>';
  if(i==12){clearInterval(iv);setTimeout(()=>{const m=document.createElement('div');m.setAttribute('data-tiptap-ai-chat-message-variant','generation-complete');m.textContent='Minuta gerada';ed.lastChild.appendChild(m);},500);}},200);};
</script></body></html>"""
b64 = base64.b64encode(b"%PDF-1.4 fake").decode()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'], proxy={'server': 'http://127.0.0.1:1'})
    pg = b.new_context().new_page()
    pg.route("**/*", lambda r: r.fulfill(body=PAG, content_type="text/html; charset=utf-8"))
    pg.goto("http://www.minutaia.com.br/x", wait_until='commit'); pg.wait_for_selector('body'); pg.add_script_tag(content=agente)
    d = pg.evaluate("__projudiIA.diagnosticar()"); print(d)
    assert d["perfil"] == "minutaia" and d["pronto"] and "Selecionar arquivos" in (d["campoArquivo"] or ""), d
    pg.evaluate("__projudiIA.anexar('12345-OCR.pdf', %r)" % b64)
    assert "12345-OCR" in pg.inner_text("#docs") and pg.evaluate("window.__modo") == "documento" and pg.locator("#imp").count() == 0, "clicou Continuar no diálogo Importar arquivo(s) com Documento marcado"
    pg.evaluate("__projudiIA.escrever('Você é assessor. Analise os autos e redija a decisão.')")
    pg.evaluate("__projudiIA.enviar()")
    r = pg.evaluate("__projudiIA.esperarResposta(60000, 1500)")
    env = pg.evaluate("window.__enviado")
    assert not pg.evaluate("window.__semContexto") and pg.evaluate("window.__cliques") == 2, "clicou Voltar (não Continuar sem contexto) e enviou de novo"
    assert "Elabore a minuta" in env and env.startswith("Você é assessor"), env
    assert r["origem"] == "editor" and "Trecho 12" in r["texto"] and len(r["texto"]) > 400, r["texto"][:200]
    print("OK"); b.close()
