"""Lançar no Projudi, de ponta a ponta contra um Projudi SIMULADO (https://projudi.tjgo.jus.br atendido pelo teste): a aba do Projudi já está na pré-análise;
o Tipo de Arquivo vem por sugestões; o Modelo só pela lupa, que NAVEGA a própria aba para a página “Busca de Modelo” (Consultar → linha → Selecionar) e volta ao formulário;
a página tem um quadro interno e um botão Excluir que nunca pode ser apertado. Não valida a tela real."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
MODELO = ('<p style="text-align:center"><strong>PODER JUDICIÁRIO</strong></p><p>Processo nº: 5914870-27.2025.8.09.0166</p>'
          '<p style="text-align:center"><strong>DECISÃO</strong></p><p>I.C.</p><p><strong>Atenda-se.</strong></p><p>MCG, data do sistema</p><p>Rafael Machado de Souza</p>')
st = {"tipo": "", "modelo": "", "excluiu": False, "consultas": 0}
TIPOS = ["Decisão", "Despacho", "Sentença", "Decisão Interlocutória"]
MODELOS = [(11, "Decisão Cível", "Vara Cível", "Decisão"), (12, "Decisão Padrão", "Vara de Família", "Decisão"), (13, "Despacho Padrão", "Vara de Família", "Despacho"), (14, "Sentença Padrão", "Vara de Família", "Sentença")]

def form():
    ed = ("window.__ck='';window.CKEDITOR={instances:{e:{getData(){return window.__ck},setData(h){window.__ck=h},updateElement(){},fire(){}}}};window.__ck=%s;" % json.dumps(MODELO)) if st["modelo"] else ""
    return f"""<html><head><meta charset="utf-8"><title>Projudi</title></head><body>
<div id="menu"><span>Modelo</span></div><h2>» Pré-Analisar Autos Conclusos</h2><div>5914870.27</div>
<iframe srcdoc="<p>outro quadro</p>" style="width:50px;height:20px"></iframe>
<div class="l"><label>Tipo de Arquivo</label> <i class="fa-solid fa-magnifying-glass" title="Pesquisar"></i> <input id="tipo" type="text" value="{st['tipo']}"></div>
<div class="l"><label>Modelo</label> <i class="fa-solid fa-magnifying-glass" title="Pesquisar" onclick="location.href='/busca-modelo'"></i> <input id="modelo" type="text" readonly value="{st['modelo']}"></div>
<ul class="ui-autocomplete" id="sug"></ul>
<script>{ed}
const tipo=document.getElementById('tipo'), sug=document.getElementById('sug');
tipo.addEventListener('input',async()=>{{ const r=await (await fetch('/api/tipos?q='+encodeURIComponent(tipo.value))).json(); sug.innerHTML=r.map(t=>'<li class="ui-menu-item"><a>'+t+'</a></li>').join(''); }});
sug.addEventListener('click',async e=>{{ const li=e.target.closest('li'); if(!li) return; tipo.value=li.textContent; sug.innerHTML=''; await fetch('/api/set-tipo?t='+encodeURIComponent(tipo.value)); }});
</script></body></html>"""

BUSCA = """<html><head><meta charset="utf-8"><title>Busca</title></head><body>
<h2>» |Autos Conclusos| Busca de Modelo</h2><fieldset><legend>CONSULTA DE MODELO</legend>
<label>Modelo</label><input type="text" placeholder="Modelo" id="q"><button id="c" type="button">Consultar</button></fieldset>
<table id="t"><tr><th></th><th>Id</th><th>Modelo</th><th>Serventia</th><th>Tipo Modelo</th><th>Selecionar</th><th>Excluir</th></tr></table>
<script>document.getElementById('c').onclick=async()=>{ const r=await (await fetch('/api/modelos?q='+encodeURIComponent(document.getElementById('q').value))).json();
 document.getElementById('t').innerHTML='<tr><th></th><th>Id</th><th>Modelo</th><th>Serventia</th><th>Tipo Modelo</th><th>Selecionar</th><th>Excluir</th></tr>'+r.map(m=>'<tr><td></td><td>'+m[0]+'</td><td>'+m[1]+'</td><td>'+m[2]+'</td><td>'+m[3]+'</td><td><button title="Selecionar" onclick="location.href=\\'/escolher?m='+encodeURIComponent(m[1])+'\\'"><i class="fa-check"></i></button></td><td><button title="Excluir" onclick="fetch(\\'/api/excluir\\')"><i class="fa-trash"></i></button></td></tr>').join(''); };</script></body></html>"""

MOLDURA = """<html><head><meta charset="utf-8"><title>Processo Judicial</title></head><body><div id="cab">Processo Judicial</div><div id="menu"><a href="/">Página Inicial</a> Processos Conclusões</div>
<iframe id="Principal" name="Principal" src="/home" style="width:100%;height:600px"></iframe></body></html>"""
LISTA = """<html><body><h2>Conclusos</h2><table><tr><td><a href="BuscaProcesso?Id_Processo=9">5914870-27</a></td><td><form id="f" action="/form" method="get" target="_blank"><button title="Pré-Analisar" type="button" onclick="document.getElementById('f').submit()">P</button></form></td></tr></table></body></html>"""

def atender(route):
    u = urlparse(route.request.url); q = parse_qs(u.query)
    def ok(body, tipo="text/html; charset=utf-8"): route.fulfill(status=200, headers={"content-type": tipo}, body=body)
    if u.path == "/": ok(MOLDURA)
    elif u.path == "/home": ok("<html><body><h2>Página inicial</h2></body></html>")
    elif u.path == "/PreAnalisarConclusao": ok(LISTA)
    elif u.path == "/form": ok(form())
    elif u.path == "/busca-modelo": ok(BUSCA)
    elif u.path == "/api/tipos": ok(json.dumps([t for t in TIPOS if q.get("q", [""])[0].lower() in t.lower()]), "application/json")
    elif u.path == "/api/set-tipo": st["tipo"] = q["t"][0]; ok("{}", "application/json")
    elif u.path == "/api/modelos": st["consultas"] += 1; ok(json.dumps([m for m in MODELOS if q.get("q", [""])[0].lower() in m[1].lower()]), "application/json")
    elif u.path == "/api/excluir": st["excluiu"] = True; ok("{}", "application/json")
    elif u.path == "/escolher": st["modelo"] = q["m"][0]; ok("<html><body>ok<script>location.replace('/form')</script></body></html>")
    else: route.fulfill(status=404, body="")

tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False,
        args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    ctx.route("https://projudi.tjgo.jus.br/**", atender)
    MIN = {"processo": "5914870-27.2025.8.09.0166", "texto": "DECISÃO INTERLOCUTÓRIA\n" + "Trata-se de pedido de habilitação nos autos. " * 6,
           "html": "<h3>DECISÃO INTERLOCUTÓRIA</h3><p>Trata-se de pedido de <b>habilitação</b> nos autos.</p><h3>DISPOSITIVO</h3><p>Defiro.</p>"}
    def quadro(aba):
        return next(f for f in aba.frames if f.url.endswith("/form"))
    def conferir(aba, moldura):
        assert st["tipo"] == "Decisão" and st["modelo"] == "Decisão Padrão", st      # não pegou “Decisão Cível” (outro modelo) nem “Decisão Interlocutória” (outro tipo)
        assert st["excluiu"] is False, "NUNCA pode apertar Excluir"
        ck = quadro(aba).evaluate("window.__ck")
        assert "habilitação" in ck and "DISPOSITIVO" in ck and "Defiro" in ck, ck
        assert ck.count("DECISÃO") == 1 and "Atenda-se" not in ck and "I.C." not in ck and "MCG, data do sistema" in ck and "PODER JUDICIÁRIO" in ck, ck
        if moldura:      # o cabeçalho e os menus continuam na aba; só o quadro navegou
            assert aba.url == "https://projudi.tjgo.jus.br/", aba.url
            assert aba.evaluate("!!document.getElementById('Principal') && document.getElementById('cab').innerText === 'Processo Judicial'")
    # A) aba na moldura, em outra tela: vai à lista de conclusos DENTRO do quadro, aperta Pré-Analisar (abre no próprio quadro) e segue
    aba = ctx.new_page(); aba.goto("https://projudi.tjgo.jus.br/")
    r = sw.evaluate("m => lancarNoProjudi(m, null)", MIN); print("A", r); assert r["ok"], r; conferir(aba, True)
    # B) aba solta já na pré-análise (sem moldura): usa a tela como está, sem navegar a aba
    st.update({"tipo": "", "modelo": "", "excluiu": False}); aba.goto("https://projudi.tjgo.jus.br/form")
    r = sw.evaluate("m => lancarNoProjudi(m, null)", MIN); print("B", r); assert r["ok"], r
    assert st["tipo"] == "Decisão" and st["modelo"] == "Decisão Padrão" and st["excluiu"] is False and "habilitação" in aba.evaluate("window.__ck"), st
    # C) aba solta em OUTRA tela (sem cabeçalho/menus): a extensão recupera a moldura (início do Projudi) antes de navegar no quadro
    st.update({"tipo": "", "modelo": "", "excluiu": False}); aba.goto("https://projudi.tjgo.jus.br/home")
    r = sw.evaluate("m => lancarNoProjudi(m, null)", MIN); print("C", r); assert r["ok"], r; conferir(aba, True)
    # sem aba do Projudi aberta: não cria aba nova
    aba.close(); r2 = sw.evaluate("m => lancarNoProjudi(m, null)", {**MIN, "html": ""})
    assert not r2["ok"] and "não há aba do Projudi" in r2["erro"], r2
    ctx.close()
print("OK")
