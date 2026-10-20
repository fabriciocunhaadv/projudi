"""Mesa de Audiência (simulada): enviar o PDF (Nova > Selecionar PDF), erro de cota devolvido à esteira, retomar sem duplicar, e ler as abas de uma audiência."""
import base64, glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><button id="btn-header-hearing-workbench-tools" title="Mesa de Audiências &amp; Instrução Judicial" onclick="abrir()">Mesa de Audiências</button><div id="mesa" class="mesa-escura"></div>
<script>
window.cliques=0; window.reanalises=0;
function aba(n){ const d=document.getElementById('painel'); const T={1:'<span>Resumo Fático da Lide</span><textarea id="r"></textarea>',2:'<div>Testemunha Fulana TESTEMUNHA AUTOR</div>',3:'<textarea>Deliberação X art. 147 do Código Penal</textarea>',4:'<textarea>Sentença Y</textarea>',5:'<textarea>Ata Z</textarea>'}; d.innerHTML=T[n]; if(n==1 && window.resumo) document.getElementById('r').value=window.resumo; }
function abrir(){ document.getElementById('mesa').innerHTML='<h3>PAUTA DE AUDIÊNCIAS</h3><input placeholder="Buscar processo ou parte..."><button id="nova">+ Nova</button><div class="rounded-xl cursor-pointer p-3" id="cartao" onclick="document.getElementById(\\'cab\\').style.display=\\'block\\'">5305719-52.2026.8.09.0166 PREPARADA</div><div id="cab" style="display:none"><div><label>Autor:</label><input value="Sebastiana"></div><div><label>Réu:</label><input value="INSS"></div><input placeholder="Nº do Processo (CNJ)..." value="5305719-52.2026.8.09.0166"><button onclick="aba(1)">1. Briefing</button><button onclick="aba(2)">2. Roteiro (1)</button><button onclick="aba(3)">3. Deliberações</button><button onclick="aba(4)">4. Sentença</button><button onclick="aba(5)">5. Ata</button><div id="painel"></div></div><div id="det"></div>';
 document.getElementById('nova').onclick=()=>{ window.cliques++; document.getElementById('det').innerHTML='<input type="date" value="2026-10-19"><input type="time" value="13:30"><input type="file" multiple accept=".pdf,.txt"><button data-testid="btn-ata-preliminar" onclick="ata()">Ata preliminar</button><button id="rean" onclick="reanalisar()">Reanalisar com IA</button><div>Peças analisadas: <span id="pecas"></span></div><div id="msg"></div><div id="bruto"></div><div id="res"></div>';
  const f=document.querySelector('input[type=file]'); f.addEventListener('change',()=>{ window.nome=f.files[0].name; document.getElementById('pecas').textContent=f.files[0].name; processar(); }); } }
function processar(){ document.getElementById('msg').textContent='Extraindo autos (1/1)'; document.getElementById('bruto').innerHTML='<textarea>'+'texto bruto dos autos '.repeat(20)+'</textarea>';
  setTimeout(()=>{ document.getElementById('msg').textContent=''; if(window.modo==='cota'){ document.getElementById('msg').textContent='Limite temporário de cota/requisições da API Gemini atingido no Google (Erro 429 Rate Limit / Quota Exceeded).'; } else { window.resumo='Resumo fático extraído pela IA '+'x'.repeat(80); document.getElementById('res').innerHTML='<span>Resumo Fático da Lide</span><textarea>'+window.resumo+'</textarea>'; } },2500); }
function ata(){ document.getElementById('msg').textContent='Preparando a ata...'; setTimeout(()=>{ document.getElementById('msg').textContent=''; if(window.ataModo==='ok'){ const v=document.createElement('div'); v.setAttribute('data-testid','ata-preliminar-viewer'); v.textContent='ATA'; document.body.appendChild(v); } },2500); }
function reanalisar(){ window.reanalises++; document.getElementById('msg').textContent=''; window.modo='ok'; processar(); }
</script></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { window.__st = Object.assign(window.__st || {}, o); return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    pdf = base64.b64encode(b"%PDF-1.4 teste").decode()
    pg.evaluate("([b64]) => { window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [pdf])
    envia = lambda req, extra="": pg.evaluate("([r, e]) => window.__ouvinte(Object.assign({ acao: 'studio-analisar', modo: 'mesa', reqId: r, arquivoId: 'a1', nome: '5305719.52-OCR.pdf' }, JSON.parse(e || '{}')), {}, () => {})", [req, extra])
    # 1) sucesso: o texto bruto (caixa grande) NÃO conta; só o Resumo Fático
    envia("m1"); pg.wait_for_function("window.__st && window.__st.studio_res_m1", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m1"); print(r)
    assert r["ok"] and pg.evaluate("window.cliques") == 1 and pg.evaluate("window.nome") == "5305719.52-OCR.pdf", r
    # 2) cota: o erro volta COM o texto do app (a esteira reconhece "cota"/"429"), sem marcar sucesso
    pg.evaluate("window.modo = 'cota'; window.resumo = ''; document.getElementById('res').innerHTML=''")
    envia("m2", '{"nome":"seg-OCR.pdf"}'); pg.wait_for_function("window.__st.studio_res_m2", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m2"); print(r)
    assert not r["ok"] and "Limite temporário de cota" in r["erro"] and "429" in r["erro"] and r["semRetry"], r
    # 3) retomar: reanalisa a audiência aberta, sem criar outra (sem novo clique em Nova)
    pg.evaluate("document.getElementById('pecas').textContent='seg-OCR.pdf'")
    envia("m3", '{"nome":"seg-OCR.pdf","retomar":true}'); pg.wait_for_function("window.__st.studio_res_m3", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m3"); print(r)
    assert r["ok"] and pg.evaluate("window.reanalises") == 1 and pg.evaluate("window.cliques") == 2, r
    # 4) ler a Mesa: abas 1 a 5 do processo
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'mesa-ler', reqId: 'l1', processo: '5305719.52', texto: 'x' }, {}, () => {})")
    pg.wait_for_function("window.__st.studio_res_l1", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_l1"); print({k: (v if k != 'abas' else list(v)) for k, v in r.items()})
    assert r["ok"] and r["cabecalho"]["autor"] == "Sebastiana" and "art. 147" in r["abas"]["deliberacoes"] and "Sentença Y" in r["abas"]["sentenca"] and "Fulana" in r["abas"]["roteiro"], r
    # 5) data e hora da pauta: a audiência nova usa a data/hora reais (não hoje 13:30)
    pg.evaluate("window.modo = 'ok'; window.resumo = ''; document.getElementById('res').innerHTML=''")
    envia("m5", '{"nome":"pauta-OCR.pdf","audData":"2026-11-18","audHora":"14:30"}'); pg.wait_for_function("window.__st.studio_res_m5", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m5"); print(r)
    assert r["ok"], r
    dh = pg.evaluate("[document.querySelector('input[type=date]').value, document.querySelector('input[type=time]').value]")
    assert dh == ["2026-11-18", "14:30"], dh
    # 6) ata que NÃO abre (IA falhou): o briefing já está pronto, a fila segue com aviso e sem esperar 10 minutos
    pg.evaluate("window.modo = 'ok'; window.ataModo = 'falha'; window.resumo = ''; document.getElementById('res').innerHTML=''")
    import time as _t; t0 = _t.time()
    envia("m6", '{"nome":"ata-falha-OCR.pdf","comAta":true}'); pg.wait_for_function("window.__st.studio_res_m6", timeout=90000)
    r = pg.evaluate("window.__st.studio_res_m6"); print(r, round(_t.time() - t0), "s")
    assert r["ok"] and "NÃO foi gerada" in r["mensagem"] and _t.time() - t0 < 60, r
    # 7) ata que abre: devolve na hora
    pg.evaluate("window.ataModo = 'ok'; window.resumo = ''; document.getElementById('res').innerHTML=''; document.querySelectorAll('[data-testid=ata-preliminar-viewer]').forEach(e => e.remove())")
    envia("m7", '{"nome":"ata-ok-OCR.pdf","comAta":true}'); pg.wait_for_function("window.__st.studio_res_m7", timeout=90000)
    r = pg.evaluate("window.__st.studio_res_m7"); print(r)
    assert r["ok"] and "ata preliminar" in r["mensagem"] and "NÃO" not in r["mensagem"], r
    print("OK")
    # 8) audiência do processo já existe e tem briefing: reaproveita (não cria outra, não gasta IA)
    antes = pg.evaluate("window.cliques")
    pg.evaluate("window.resumo = 'Resumo fático já extraído pela IA ' + 'x'.repeat(80); document.getElementById('res').innerHTML = '<span>Resumo Fático da Lide</span><textarea>' + window.resumo + '</textarea>'")
    envia("m8", '{"nome":"x-OCR.pdf","processo":"5305719.52","audData":"2026-11-02","audHora":"09:15"}'); pg.wait_for_function("window.__st.studio_res_m8", timeout=60000)
    r = pg.evaluate("window.__st.studio_res_m8"); print(r)
    assert r["ok"] and r.get("reaproveitada") and pg.evaluate("window.cliques") == antes, r
    assert pg.evaluate("document.querySelector('input[type=date]').value") == "2026-11-02"
    print("OK")
    b.close()
print("OK")
