"""Testa extensao/ia-agente.js contra páginas simuladas (estilo ChatGPT com contenteditable e estilo textarea com input file)."""
import base64, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
raiz = Path(__file__).resolve().parent.parent / "extensao"
agente = (raiz / "ia-agente.js").read_text()
PAG_A = """<html><body><div id=msgs></div>
<div id=prompt-textarea contenteditable=true role=textbox style="width:400px;height:40px;border:1px solid"></div>
<button aria-label="Anexar arquivos" id=bx>+</button><input type=file id=f style="display:none" accept=".pdf">
<button data-testid=send-button id=env disabled>Enviar</button><div id=chip></div>
<script>
const ed=document.getElementById('prompt-textarea'),env=document.getElementById('env');
ed.addEventListener('input',()=>env.disabled=!ed.innerText.trim());
document.getElementById('f').addEventListener('change',e=>document.getElementById('chip').textContent=e.target.files[0].name);
env.onclick=()=>{const txt=ed.innerText;ed.innerText='';const stop=document.createElement('button');stop.dataset.testid='stop-button';stop.textContent='Parar';document.body.appendChild(stop);
const m=document.createElement('div');m.dataset.messageAuthorRole='assistant';document.getElementById('msgs').appendChild(m);
let i=0;const t=setInterval(()=>{m.textContent+='Minuta parte '+(++i)+'. ';if(i==4){clearInterval(t);stop.remove();}},700);window.__enviado=txt;};
</script></body></html>"""
PAG_B = """<html><body><div class=answer-box></div><textarea id=t style="width:300px;height:60px"></textarea><input type=file id=f accept="application/pdf">
<button type=submit id=s>Enviar</button><div id=chip></div>
<script>document.getElementById('f').onchange=e=>document.getElementById('chip').textContent=e.target.files[0].name;
document.getElementById('s').onclick=()=>{const m=document.createElement('div');m.className='assistant-msg';document.body.appendChild(m);setTimeout(()=>m.textContent='Resposta pronta do modelo '.repeat(10),1500);window.__enviado=document.getElementById('t').value;};</script></body></html>"""
PAG_C = """<html><body style="margin:0"><div style="display:flex;width:1200px"><div style="width:600px"><div id=msgs></div><textarea id=t style="width:300px"></textarea><input type=file id=f accept=".pdf"><button type=submit id=s>Enviar</button><div id=chip></div></div>
<div id=painel style="width:600px"></div></div>
<script>document.getElementById('f').onchange=e=>document.getElementById('chip').textContent=e.target.files[0].name;
document.getElementById('s').onclick=()=>{const m=document.createElement('div');m.className='assistant-msg';window.__enviado=document.getElementById('t').value;m.textContent='Revise e valide o conteudo antes de qualquer uso processual.';document.getElementById('msgs').appendChild(m);
setTimeout(()=>{document.getElementById('painel').innerHTML='<div><button>Baixar</button><h3>Decisao de regularizacao</h3><p>PODER JUDICIARIO</p>'+'<p>Fundamentacao longa da minuta. </p>'.repeat(60)+'<p>ReescreverBuscar julgadosPerguntar</p><p>Dispositivo final.</p></div>';},2500);};</script></body></html>"""
b64 = base64.b64encode(b"%PDF-1.4 fake").decode()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'], proxy={'server':'http://127.0.0.1:1'})
    for nome, pag, host in [("A-contenteditable", PAG_A, "chatgpt.com"), ("B-textarea", PAG_B, "ia.jusbrasil.com.br"), ("C-painel-lateral", PAG_C, "ia.jusbrasil.com.br")]:
        c = b.new_context(); pg = c.new_page()
        pg.route("**/*", (lambda pag: (lambda r: r.fulfill(body=pag, content_type="text/html")))(pag))
        pg.goto(f"http://{host}/x", wait_until='commit'); pg.wait_for_selector('body'); pg.add_script_tag(content=agente)
        d = pg.evaluate("__projudiIA.diagnosticar()"); print(nome, d)
        assert d["pronto"], d
        pg.evaluate("__projudiIA.anexar('12345-OCR.pdf', %r)" % b64)
        pg.evaluate("__projudiIA.escrever('Faça a minuta do processo.\\nLinha 2')")
        pg.evaluate("__projudiIA.enviar()")
        r = pg.evaluate("__projudiIA.esperarResposta(60000, 2500)")
        if nome.startswith("C"):
            assert r["origem"] == "painel" and "Dispositivo final" in r["texto"] and len(r["texto"]) > 800, r["texto"][:200]
            assert "Reescrever" not in r["texto"] and "Buscar julgados" not in r["texto"] and "Baixar" not in r["texto"], "lixo da tela ficou no texto"
        else: assert "Minuta parte 4" in r["texto"] or "Resposta pronta" in r["texto"], r
        assert "Faça a minuta" in pg.evaluate("window.__enviado"), "prompt não chegou"
        print(nome, "OK:", r["texto"][:50])
    b.close()
