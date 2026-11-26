"""Claude lê os autos com ferramentas: o 1º texto é só um anúncio (“Vou ler integralmente…” + “Executando um comando”); a extensão NÃO pode devolver isso como minuta: espera a minuta de verdade. Também: capturar a minuta que já está na conversa aberta."""
from pathlib import Path
from playwright.sync_api import sync_playwright
raiz = Path(__file__).resolve().parent.parent / "extensao"
agente = (raiz / "ia-agente.js").read_text()
MINUTA = "PODER JUDICIÁRIO DO ESTADO DE GOIÁS. DECISÃO. Trata-se de ação declaratória de relação de parentesco. " * 8
PAG = """<html><body><div id=msgs></div><div contenteditable=true role=textbox id=prompt-textarea style="width:400px;height:40px;border:1px solid"></div>
<button aria-label="Anexar arquivos" id=bx>+</button><input type=file id=f style="display:none" accept=".pdf"><button data-testid=send-button id=env>Enviar</button>
<script>
const ed=document.getElementById('prompt-textarea');
document.getElementById('env').onclick=()=>{window.__enviado=ed.innerText;ed.innerText='';
 const m=document.createElement('div');m.dataset.messageAuthorRole='assistant';document.getElementById('msgs').appendChild(m);
 m.textContent='Vou ler integralmente o PDF dos autos antes de redigir a minuta. Executando um comando';       // anúncio; sem botão de parar (a IA está rodando ferramentas)
 setTimeout(()=>{m.textContent='Estou lendo os autos (580 páginas). Executando um comando';},3000);
 setTimeout(()=>{m.textContent=%r;},9000);};         // a minuta de verdade, só depois de 9 s
</script></body></html>""" % MINUTA
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'], proxy={'server':'http://127.0.0.1:1'})
    pg = b.new_context().new_page()
    pg.route("**/*", lambda r: r.fulfill(body=PAG, content_type="text/html"))
    pg.goto("http://chatgpt.com/x", wait_until='commit'); pg.wait_for_selector('body'); pg.add_script_tag(content=agente)
    pg.evaluate("__projudiIA.escrever('Faça a minuta.')"); pg.evaluate("__projudiIA.enviar()")
    r = pg.evaluate("__projudiIA.esperarResposta(60000, 2500)")
    print("texto devolvido:", r["texto"][:80], len(r["texto"]))
    assert len(r["texto"]) > 400 and "Executando" not in r["texto"] and "Vou ler integralmente" not in r["texto"], "devolveu o anúncio/ferramenta como se fosse a minuta"
    assert "PODER JUDICI" in r["texto"].upper()
    b.close()
print("OK")
