"""Leitura da Mesa no formato REAL do app (títulos com ícone, caixas de texto com o conteúdo no valor, cartões de testemunha) -> dados da pauta."""
import glob, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
EXT = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-header-hearing-workbench-tools" title="Mesa de Audiências">Mesa</button>
<div class="mesa-escura"><div><h2>Mesa de Audiências</h2><button>Salvar Ficha</button></div>
<div><span>PAUTA DE AUDIÊNCIAS</span><button>Nova</button><input placeholder="Buscar processo ou parte..."></div>
<div class="rounded-xl cursor-pointer p-3" id="cartao" onclick="">5305719-52.2026.8.09.0166 PREPARADA<p>MARIA TESTE vs INSS</p></div>
<div><input placeholder="Nº do Processo (CNJ)..." value="5305719-52.2026.8.09.0166"><div><span>Autor:</span><input value="MARIA TESTE"></div><div><span>Réu:</span><input value="INSS"></div><div><span>Assunto:</span><input value="Aposentadoria por idade rural"></div></div>
<div><button onclick="aba(1)">1. Briefing</button><button onclick="aba(2)">2. Roteiro (2)</button><button onclick="aba(3)">3. Deliberações</button><button onclick="aba(4)">4. Sentença</button><button onclick="aba(5)">5. Ata</button></div>
<div id="painel"></div></div>
<script>
const T = {
1: `<div><div><h3>Carregar PDF dos autos</h3><p>Solte os PDFs dos autos.</p></div><button>Abrir ata preliminar</button><button>Reanalisar com IA</button><span>Peças analisadas:</span><span>5305719.52-OCR.pdf</span><button id="bbruto" onclick="bruto()">Ver / Editar Texto Bruto dos Autos</button><div id="areabruto"></div></div>
<div><div><h4><svg></svg>Resumo Fático da Lide</h4><button>Copiar</button></div><textarea id="t1"></textarea></div>
<div><div><h4><svg></svg>Pedido Contraposto / Reconvenção</h4><button>Copiar</button></div><textarea id="t2"></textarea></div>
<div><h4><svg></svg>Alertas &amp; Armadilhas Processuais Detectadas</h4><ul><li>Divergência de Enquadramento Legal: a inicial fundamenta ora em segurada especial, ora em empregada rural; examinar como empregada rurícola.</li><li>Anotação do CBO 5143-05 (Limpador de Vidros): a CTPS física cita Serviços Gerais, mas o CNIS acusa limpador de vidros.</li><li>Participação das Testemunhas por Videoconferência: ambas residem fora da sede do Juízo (Querência/MT e Jussara/GO) e foram autorizadas a serem ouvidas pelo Zoom (link: https://tjgo.zoom.us/j/5072073163).</li><li>Redesignação da Audiência: o ato que estava agendado para 03/09/2026 foi remarcado para o dia 15/10/2026, às 14:00h, ante o nascimento prematuro dos filhos gêmeos do patrono da autora.</li></ul></div></div>`,
2: `<div><h4>ROL DE DEPOENTES &amp; TESTEMUNHAS DA INSTRUÇÃO</h4><div><input placeholder="Nome do Depoente / Testemunha..."><select><option>Testemunha do Autor</option><option>Testemunha do Réu</option></select><input placeholder="Fato a esclarecer..."></div>
<div><div><span>JORCINEIDE DAMAS DE OLIVEIRA</span><span>TESTEMUNHA AUTOR</span><select><option>Aguardando</option><option>Inquirido</option></select><button>Perguntas IA</button></div><p><strong>Objeto da oitiva:</strong> Rotina de trabalho da autora nas propriedades rurais.</p><textarea></textarea></div>
<div><div><span>CRISTIANA GERUSA FRANÇA</span><span>TESTEMUNHA AUTOR</span><select><option>Aguardando</option></select></div><p><strong>Objeto da oitiva:</strong> Condição de rurícola da autora.</p><textarea></textarea></div></div>`,
3: `<div>Deliberações</div>`, 4: `<div>Sentença</div>`, 5: `<div>Ata</div>` };
let bAberto=false; function bruto(){ bAberto=!bAberto; document.getElementById('bbruto').textContent = bAberto ? 'Ocultar Texto Bruto dos Autos' : 'Ver / Editar Texto Bruto dos Autos'; document.getElementById('areabruto').innerHTML = bAberto ? '<textarea placeholder="Texto das peças processuais..." id="tb"></textarea>' : ''; if(bAberto) document.getElementById('tb').value = window.BRUTO || ''; }
function aba(n){ document.getElementById('painel').innerHTML = T[n]; if(n==1){ document.getElementById('t1').value = 'A autora, nascida em 08/12/1970, pleiteia aposentadoria por idade rural. O INSS indeferiu (DER 10/12/2025) por falta de qualidade de trabalhadora rural.'; document.getElementById('t2').value = 'Não há pedido contraposto nem reconvenção.'; } }
aba(1);
</script></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(viewport={"width": 1280, "height": 900}); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
    pg.set_content(PAG)
    pg.evaluate("(t) => { window.BRUTO = t }", (Path(__file__).parent / "fixtures" / "autos_sintetico.txt").read_text(encoding="utf-8"))
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { window.__st = Object.assign(window.__st || {}, o); return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(EXT / "studio-base.js"))
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'mesa-ler', reqId: 'l1', processo: '5305719.52', texto: 'x' }, {}, () => {})")
    pg.wait_for_function("window.__st && window.__st.studio_res_l1", timeout=60000)
    lido = pg.evaluate("window.__st.studio_res_l1"); assert lido["ok"], lido
    brief = lido["abas"]["briefing"]; print(brief[:600].replace("\n", " | "))
    assert "\n" in brief and "Resumo Fático da Lide\n" in brief and "pleiteia aposentadoria" in brief, "o texto das abas tem de manter as linhas e os valores das caixas"
    import http.server, socketserver, threading
    os.chdir(EXT); srv = socketserver.TCPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler); threading.Thread(target=srv.serve_forever, daemon=True).start()
    pg2 = b.new_page(); pg2.add_init_script("window.chrome = { storage: { local: { get: async () => ({ esteira_ordem: [] }), set: async () => {} }, onChanged: { addListener() {} } }, runtime: { getURL: (x) => x, onMessage: { addListener() {} } }, tabs: {} };")
    pg2.goto(f"http://127.0.0.1:{srv.server_address[1]}/pauta-doc.html"); pg2.wait_for_timeout(800)
    dados = pg2.evaluate("async (l) => (await import('/pauta-dados.js')).dadosPautaMesa(l, { autor: 'MARIA TESTE DA SILVA', reu: 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS', processo: '5305719.52' })", lido)
    print("ROTEIRO:", repr(lido["abas"]["roteiro"][:700]))
    print(json.dumps(dados, ensure_ascii=False)[:1500])
    nomes = [t["nome"] for t in dados["testemunhas"]]
    assert nomes == ["JORCINEIDE DAMAS DE OLIVEIRA", "CRISTIANA GERUSA FRANÇA"], nomes
    ev = " | ".join(e["texto"] for e in dados["eventos"]); print(ev)
    assert dados["autos"] and "Audiência designada mov. 10 (03/09/2026" in ev and "redesignada mov. 35 (15/10/2026" in ev, ev
    assert dados["situacaoAutor"].startswith("Intimada (adv.) mov. 38") and "mov. 39" in dados["situacaoReu"], dados
    assert "OAB/GO 38.894" in dados["advAutor"] and "OAB/GO 12.345" in dados["advReu"], dados
    assert dados["testemunhas"][0]["situacao"].startswith("Intimado(a) mov. 40"), dados["testemunhas"]
    assert "Redesignação da Audiência" not in ev and "redesignada mov. 35 (15/10/2026" in ev and "Videoconferência" in ev, ev
    assert "zoom.us" not in ev and "CBO" not in ev and "Divergência" not in ev, "só alertas da audiência, sem link e sem tese de mérito"
    assert all(len(e["texto"]) <= 205 for e in dados["eventos"])
    assert not erros, erros
    print("OK"); b.close()
