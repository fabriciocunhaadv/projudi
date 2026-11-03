"""Botão “Lançar no Projudi”: antes de lançar, pergunta em qual serventia (as não ocultas); a escolha segue na mensagem e Cancelar não lança nada."""
import glob
from pathlib import Path
from playwright.sync_api import sync_playwright
exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
SRC = (Path(__file__).parent.parent / "extensao" / "studio-base.js").read_text(encoding="utf-8")
HTML = '''<div id="tour-meta-parties-box">Processo 5270373-40.2026.8.09.0166</div><div class="font-serif"><div>x</div><div><h3>III - DECISÃO</h3><div class="markdown-body"><p>%s</p></div></div></div>
<h3>Resultado &amp; Análise</h3>''' % ("z" * 400)
JS = """()=>{window.__msgs=[];window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(m){window.__msgs.push(m); if(m.acao==='lancar-serventias') return Promise.resolve({ok:true,sugerida:'https://projudi.tjgo.jus.br/B',serventias:[{serventia:'Juizado Especial da Fazenda Pública - GO',perfil:'Juiz',url:'https://projudi.tjgo.jus.br/A'},{serventia:'Vara da Fazenda Pública - GO',perfil:'Juiz',url:'https://projudi.tjgo.jus.br/B'}]}); return Promise.resolve({ok:true,tipo:'Decisão',modelo:'Decisão Padrão'});}},storage:{local:{get:async()=>({}),set:async()=>{}}}}}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]); pg = b.new_page(viewport={"width":1000,"height":560})
    pg.set_content(HTML); pg.evaluate(JS); pg.add_script_tag(content=SRC); pg.wait_for_timeout(2500)
    sh = "document.querySelector('[data-projudi-ext=lancar-projudi]').shadowRoot"
    pg.evaluate(f"{sh}.querySelector('button.p').click()"); pg.wait_for_timeout(600)
    ops = pg.evaluate(f"[...{sh}.querySelectorAll('.sv button')].map(b=>[b.textContent,b.className])"); print(ops)
    assert len(ops) == 3 and ops[0][0].startswith("Juizado") and ops[1][1] == "s", ops   # (1ª = título é <b>, então os botões são 3 com Cancelar)
    pg.evaluate(f"{sh}.querySelectorAll('.sv button')[0].click()"); pg.wait_for_timeout(600)
    m = pg.evaluate("window.__msgs.filter(x=>x.acao==='lancar-projudi')"); print(m and m[0].get('serventiaUrl'))
    assert m and m[0]["serventiaUrl"] == "https://projudi.tjgo.jus.br/A"
    pg.wait_for_timeout(300); pg.evaluate("window.__msgs.length=0")
    pg.evaluate(f"{sh}.querySelector('button.p').click()"); pg.wait_for_timeout(500)
    pg.evaluate(f"{sh}.querySelector('.sv .c').click()"); pg.wait_for_timeout(500)
    assert not pg.evaluate("window.__msgs.filter(x=>x.acao==='lancar-projudi').length"), "Cancelar não pode lançar"
    b.close()
print("OK")
