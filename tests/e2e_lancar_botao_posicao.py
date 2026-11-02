"""Botão flutuante “Lançar no Projudi”: fica à esquerda do “Editar com o chat Gemini” (chat fechado) ou do “Recolher” (chat aberto), centralizado, sem cobrir o selo do app; a mensagem tem “×”."""
import glob
from pathlib import Path
from playwright.sync_api import sync_playwright
exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
SRC = (Path(__file__).parent.parent / "extensao" / "studio-base.js").read_text(encoding="utf-8")
HTML = '''<div class="font-serif"><div>x</div><div><h3>D</h3><div class="markdown-body"><p>%s</p></div></div></div>
<div id="barra"><button id="abrir" onclick="document.getElementById('barra').style.display='none';document.getElementById('painel').style.display='block'" style="margin-left:600px">Editar com o chat Gemini</button></div>
<div id="painel" style="display:none"><span>Assistente</span><button data-testid="fechar-chat-gemini" style="margin-left:700px" onclick="this.parentElement.style.display='none';document.getElementById('barra').style.display='block'">Recolher</button></div>
<div id="mysql" style="position:fixed;right:15px;bottom:14px;width:130px;height:24px;background:green;color:#fff">MySQL - Hostinger</div>''' % ("z"*400)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]); pg = b.new_page(viewport={"width":1000,"height":560})
    pg.set_content(HTML)
    pg.evaluate("window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(){}},storage:{local:{get:async()=>({}),set:async()=>{}}}}")
    pg.add_script_tag(content=SRC); pg.wait_for_timeout(1200)
    rect = lambda sel: pg.evaluate("""(sel)=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]').shadowRoot; const e=sel==='btn'?h.querySelector('button.p'):document.querySelector(sel); const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom}}""", sel)
    ov = lambda a,b: not (a['r']<=b['l'] or b['r']<=a['l'] or a['b']<=b['t'] or b['b']<=a['t'])
    btn=rect('btn'); chat=rect('#abrir'); print('fechado', btn, chat); assert btn['r']<=chat['l'] and abs((btn['t']+btn['b'])/2-(chat['t']+chat['b'])/2)<3
    pg.click('#abrir'); pg.wait_for_timeout(700)
    btn=rect('btn'); rec=rect('[data-testid=fechar-chat-gemini]'); my=rect('#mysql'); print('aberto', btn, rec, my)
    assert btn['r']<=rec['l'] and abs((btn['t']+btn['b'])/2-(rec['t']+rec['b'])/2)<3 and not ov(btn,rec) and not ov(btn,my)
    # mensagem com × e fechamento
    pg.evaluate("""()=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]').shadowRoot; h.querySelector('.r').style.display='block'; h.querySelector('.t').textContent='Pronto: mensagem de teste'}""")
    x = pg.evaluate("""()=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]').shadowRoot; const x=h.querySelector('.x'); const r=x.getBoundingClientRect(); x.click(); return [r.width, getComputedStyle(h.querySelector('.r')).display]}""")
    print('x', x); assert x[0] >= 16
    b.close()
print('OK')
