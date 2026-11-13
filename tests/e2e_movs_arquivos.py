"""3.0.0: a extensão abre a lista de arquivos de cada movimentação (que o Projudi só carrega ao clicar no clipe) e põe no quadro. Rodar: python3 tests/e2e_movs_arquivos.py"""
import glob, json, os, tempfile, pathlib
from playwright.sync_api import sync_playwright
RAIZ = pathlib.Path(__file__).resolve().parent.parent; ext = str(RAIZ / "extensao"); tmp = pathlib.Path(tempfile.mkdtemp())
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
LINHA = lambda n, cod, tipo, compl: f"""<tr movi_codigo="{cod}" class="filtro-entrada"><td class="colunaMinima"> {n}</td><td class="filtro_coluna_movimentacao"><span class="filtro_tipo_movimentacao"> {tipo}</span><br> {compl}</td><td>0{n}/11/2026 10:00:00</td><td> Fulano</td><td class="colunaMinima"><a href="javascript:buscarArquivosMovimentacaoJSON('X{n}', 'BuscaProcesso', 'Id', 6, 'false')"> </a></td><td></td></tr><tr id="linha_X{n}" carregado="não"><td colspan="6" id="pai_X{n}" class="Linha"></td></tr>"""
PAGINA = f"""<html><body><p>Processo 5428441-88.2026.8.09.0166</p><table><tbody id="tabListaProcesso">
{LINHA(3, 30, "Mídia Publicada", "Envio de mídia")}{LINHA(2, 20, "Juntada -&gt; Petição", "rol")}<tr movi_codigo="10" class="filtro-entrada"><td class="colunaMinima"> 1</td><td class="filtro_coluna_movimentacao"><span class="filtro_tipo_movimentacao"> Concluso</span></td><td>01/11/2026 09:00:00</td><td> Sistema</td><td class="colunaMinima"></td><td></td></tr>
</tbody></table>
<script>
window.aberturas = [];
const DADOS = {{X3: ['audiencia.mp4', 'ata de audiencia.html'], X2: ['rol de testemunhas.pdf']}};
function buscarArquivosMovimentacaoJSON(id) {{ window.aberturas.push(id); setTimeout(() => {{ document.getElementById('pai_' + id).innerHTML = '<ul class="lista_arquivos">' + DADOS[id].map((n, i) => '<li><a href="BuscaProcesso?Id=' + id + i + '">' + n + '</a></li>').join('') + '</ul>'; }}, 300); }}
</script></body></html>"""
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    ctx.route("https://projudi.tjgo.jus.br/**", lambda r: r.fulfill(body=PAGINA, content_type="text/html; charset=utf-8") if r.request.url.endswith("/processo-teste") else r.fulfill(status=404, body=""))
    proc = ctx.new_page(); proc.goto("https://projudi.tjgo.jus.br/processo-teste"); proc.wait_for_timeout(3500)
    ext_pg = ctx.new_page(); ext_pg.goto(base + "pauta.html")
    tab_id = ext_pg.evaluate("""async () => (await chrome.tabs.query({ url: 'https://projudi.tjgo.jus.br/*' }))[0].id""")
    antes = ext_pg.evaluate("""async () => (await chrome.storage.local.get('movs:5428441-88.2026.8.09.0166'))['movs:5428441-88.2026.8.09.0166']""")
    assert antes and len(antes["movs"]) == 3 and not any(m.get("arquivos") for m in antes["movs"]), "antes: movimentações guardadas, ainda sem lista de arquivos"
    r = ext_pg.evaluate("""async (t) => { const m = await import('./movimentacoes-quadro.js'); const res = await m.completarArquivosDoQuadro(t, 20000); const g = (await chrome.storage.local.get('movs:5428441-88.2026.8.09.0166'))['movs:5428441-88.2026.8.09.0166']; const q = await m.quadroDoProcesso('Processo Nº: 5428441-88.2026.8.09.0166'); return { res, movs: g && g.movs, q }; }""", tab_id)
    print(json.dumps(r, ensure_ascii=False)[:900])
    assert r["res"] and r["res"]["ok"] and r["res"]["abertas"] == 2, r["res"]
    por_n = {m["n"]: m.get("arquivos") for m in r["movs"]}
    assert por_n[3] == ["audiencia.mp4", "ata de audiencia.html"] and por_n[2] == ["rol de testemunhas.pdf"] and not por_n[1], por_n
    assert "arquivos: 1=audiencia.mp4; 2=ata de audiencia.html" in r["q"] and "arquivos: 1=rol de testemunhas.pdf" in r["q"], r["q"]
    assert sorted(proc.evaluate("window.aberturas")) == ["X2", "X3"], "abre só as movimentações com arquivo (a de sistema, sem clipe, não)"
    r2 = ext_pg.evaluate("""async (t) => (await import('./movimentacoes-quadro.js')).completarArquivosDoQuadro(t, 20000)""", tab_id)
    assert r2 and r2["ok"] and r2["abertas"] == 0, "segunda vez: nada a abrir"
    assert len(proc.evaluate("window.aberturas")) == 2, "não clica de novo no que já está carregado"
    # orçamento: 40 movimentações que demoram a carregar; com limite de 3 s a leitura PARA (parcial) e não deixa nada rodando
    LENTA = PAGINA.replace("{LINHAS}", "")
    linhas = "".join(LINHA(n, 100 + n, "Juntada", "x") for n in range(10, 50))
    lenta = PAGINA.replace('</tbody>', linhas + '</tbody>').replace("setTimeout(() => {", "setTimeout(() => {").replace("}, 300); }", "}, 1500); }").replace("DADOS = {", "DADOS = new Proxy({X3: ['a.mp4'], X2: ['b.pdf']}, {get: (o, k) => o[k] || ['x.pdf']}); const DADOS_ = {")
    p2 = ctx.new_page(); p2.route("https://projudi.tjgo.jus.br/lenta", lambda rr: rr.fulfill(body=lenta, content_type="text/html; charset=utf-8")); p2.goto("https://projudi.tjgo.jus.br/lenta"); p2.wait_for_timeout(3000)
    t2 = ext_pg.evaluate("""async () => (await chrome.tabs.query({ url: 'https://projudi.tjgo.jus.br/lenta' }))[0].id""")
    r3 = ext_pg.evaluate("""async (t) => (await import('./movimentacoes-quadro.js')).completarArquivosDoQuadro(t, 3000)""", t2)
    print(r3); assert r3 and r3["parcial"] and r3["ms"] < 12000, "estourou o orçamento: parou e avisou"
    n1 = len(p2.evaluate("window.aberturas")); p2.wait_for_timeout(4000); n2 = len(p2.evaluate("window.aberturas"))
    assert n1 == n2 and n1 < 40, f"nada continua rodando na página depois do corte ({n1} -> {n2})"
    ctx.close()
print("OK")
