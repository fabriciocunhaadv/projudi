"""Botão “Lançar no Projudi” no FIM da minuta: com o espaço reservado pelo Studio (slot-lancar-projudi), o botão sai da tela flutuante e fica depois da assinatura (só aparece ao rolar até lá); sem o espaço continua flutuante."""
import glob
from pathlib import Path
from playwright.sync_api import sync_playwright
exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
SRC = (Path(__file__).parent.parent / "extensao" / "studio-base.js").read_text(encoding="utf-8")
HTML = '''<div class="font-serif"><div>x</div><div><h3>D</h3><div class="markdown-body">%s</div>
<div class="text-center">Mineiros - GO, data da assinatura digital. Juiz(a) de Direito</div>
<div data-testid="slot-lancar-projudi" id="vaga"></div></div></div>
<div id="mysql" style="position:fixed;right:15px;bottom:14px;width:130px;height:24px;background:green;color:#fff">MySQL - Hostinger</div>''' % "".join(f"<p>{'z'*400}</p>" for _ in range(30))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]); pg = b.new_page(viewport={"width":1000,"height":560})
    pg.set_content(HTML)
    pg.evaluate("window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(){}},storage:{local:{get:async()=>({}),set:async()=>{}}}}")
    pg.add_script_tag(content=SRC); pg.wait_for_timeout(1500)
    info = pg.evaluate("""()=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]'); const w=h.shadowRoot.querySelector('.w'); const b=h.shadowRoot.querySelector('button.p').getBoundingClientRect(); return {dentroDaVaga: !!h.closest('#vaga'), pos:getComputedStyle(w).position, topo:b.top, alt:innerHeight, disp:getComputedStyle(w).display}}""")
    print("no topo da minuta:", info)
    assert info["dentroDaVaga"] and info["pos"] == "static" and info["disp"] == "flex", "o botão está no espaço do fim da minuta, no fluxo da página"
    assert info["topo"] > info["alt"], "no topo da minuta o botão NÃO aparece na tela (está lá embaixo)"
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(500)
    fim = pg.evaluate("""()=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]'); const b=h.shadowRoot.querySelector('button.p').getBoundingClientRect(); const m=document.querySelector('#mysql').getBoundingClientRect(); const assin=[...document.querySelectorAll('div')].find(d=>/assinatura digital/.test(d.textContent)&&d.children.length===0).getBoundingClientRect(); return {visivel:b.top>=0&&b.bottom<=innerHeight, centro:Math.abs((b.left+b.right)/2-innerWidth/2)<60, abaixoDaAssinatura:b.top>=assin.bottom-1, cobreSelo:!(b.right<=m.left||m.right<=b.left||b.bottom<=m.top||m.bottom<=b.top)}}""")
    print("no fim da minuta:", fim)
    assert fim["visivel"] and fim["abaixoDaAssinatura"] and not fim["cobreSelo"], "ao rolar até o fim, o botão aparece depois da assinatura e não cobre o selo do app"
    # o Studio recriou a minuta (a vaga sumiu): volta a ser flutuante, sem sumir
    pg.evaluate("document.getElementById('vaga').remove()"); pg.wait_for_timeout(2600)
    sem = pg.evaluate("""()=>{const h=document.querySelector('[data-projudi-ext=lancar-projudi]'); const w=h.shadowRoot.querySelector('.w'); return {conectado:h.isConnected, pos:getComputedStyle(w).position}}""")
    print("sem a vaga:", sem); assert sem["conectado"] and sem["pos"] == "fixed", "sem o espaço reservado, o botão volta a flutuar (Studio antigo, Turbo)"
    b.close()
print("OK")
