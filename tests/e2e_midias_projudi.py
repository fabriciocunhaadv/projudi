"""Vídeos da audiência no processo do Projudi: a extensão abre a movimentação "Mídia Publicada" (carregamento sob demanda, como no Projudi), acha os links .mp4/.webm, baixa com a sessão e guarda no navegador."""
import glob, json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
MP4 = bytes([0, 0, 0, 24]) + b"ftypmp42" + bytes(2000)
WEBM = bytes([0x1A, 0x45, 0xDF, 0xA3]) + bytes(3000)
PAGINA = """<html><body><table><tbody id="tabListaProcesso">
<tr movi_codigo="55" class="filtro-entrada"><td class="colunaMinima"> 52</td><td class="filtro_coluna_movimentacao"><span class="filtro_tipo_movimentacao"> Mídia Publicada</span><br> Envio de Mídia Gravada em 09/11/2026 - 14:00 - Audiência de Instrução e Julgamento</td><td>09/11/2026 14:00:31</td><td> Gabriela</td>
 <td class="colunaMinima"><a href="javascript:buscarArquivosMovimentacaoJSON('X1', 'BuscaProcesso', 'Id_MovimentacaoArquivo', 6, 'false')"> </a></td><td></td></tr>
<tr id="linha_X1" carregado="não"><td colspan="6" id="pai_X1" class="Linha"></td></tr>
<tr movi_codigo="50" class="filtro-entrada"><td class="colunaMinima"> 50</td><td class="filtro_coluna_movimentacao"><span class="filtro_tipo_movimentacao"> Juntada -&gt; Petição</span><br> rol de testemunha</td><td>05/11/2026</td><td> Iram</td>
 <td class="colunaMinima"><a href="javascript:buscarArquivosMovimentacaoJSON('X2', 'BuscaProcesso', 'Id_MovimentacaoArquivo', 6, 'false')"> </a></td><td></td></tr>
<tr id="linha_X2" carregado="não"><td colspan="6" id="pai_X2" class="Linha"></td></tr>
</tbody></table>
<script>
window.aberturas = [];
function buscarArquivosMovimentacaoJSON(id) { window.aberturas.push(id); setTimeout(() => { document.getElementById('pai_' + id).innerHTML = id === 'X1'
  ? '<ul class="lista_arquivos"><li><a target="_blank" href="BuscaProcesso?PaginaAtual=6&Id_MovimentacaoArquivo=A1&hash=1">video2511434007.mp4</a></li><li><a href="BuscaProcesso?PaginaAtual=6&Id_MovimentacaoArquivo=A2&hash=2">video1511434007.webm</a></li><li><a href="BuscaProcesso?Id_MovimentacaoArquivo=A3">certidao.pdf</a></li></ul>'
  : '<ul class="lista_arquivos"><li><a href="BuscaProcesso?Id_MovimentacaoArquivo=A4">rol.pdf</a></li></ul>'; }, 400); }
</script></body></html>"""
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    def rota(r):
        u = r.request.url
        if u.endswith("/processo-teste"): r.fulfill(body=PAGINA, content_type="text/html; charset=utf-8")
        elif "Id_MovimentacaoArquivo=A1" in u: r.fulfill(body=MP4, content_type="video/mp4")
        elif "Id_MovimentacaoArquivo=A2" in u: r.fulfill(body=b"<html><body><video><source src='/arquivo-real.webm'></video></body></html>", content_type="text/html")      # moldura que só embute o player
        elif u.endswith("/arquivo-real.webm"): r.fulfill(body=WEBM, content_type="video/webm")
        else: r.fulfill(status=404, body="")
    ctx.route("https://projudi.tjgo.jus.br/**", rota)
    proc = ctx.new_page(); proc.goto("https://projudi.tjgo.jus.br/processo-teste")
    ext_pg = ctx.new_page(); ext_pg.goto(base + "pauta.html")
    tab_id = ext_pg.evaluate("""async () => (await chrome.tabs.query({ url: 'https://projudi.tjgo.jus.br/*' }))[0].id""")
    r = ext_pg.evaluate("""async (tabId) => {
      const m = await import('./midias-projudi.js'); const b = await import('./esteira-banco.js'); const passos = [];
      const meta = await m.coletarMidiasDoProcesso(tabId, '5428441-88.2026.8.09.0166', (t) => passos.push(t));
      const k = m.chaveDoProcesso('5428441-88.2026.8.09.0166');
      const v0 = await b.lerMidia(k, 0), v1 = await b.lerMidia(k, 1);
      const guardado = (await chrome.storage.local.get('midias_' + k))['midias_' + k];
      return { meta, passos, t0: v0 && v0.length, t1: v1 && v1.length, guardado: !!guardado };
    }""", tab_id)
    print(json.dumps(r, ensure_ascii=False)[:600])
    assert [m["nome"] for m in r["meta"]] == ["video2511434007.mp4", "video1511434007.webm"], r["meta"]
    assert r["meta"][0]["tipo"] == "video/mp4" and r["meta"][1]["tipo"] == "video/webm", "tipos"
    assert r["t0"] == len(MP4) and r["t1"] == len(WEBM), "os bytes baixados (inclusive a moldura que embute o player) ficam guardados"
    assert r["guardado"], "metadados guardados"
    abertas = proc.evaluate("window.aberturas")
    assert abertas == ["X1"], "abre só a movimentação de mídia (a de petição não é aberta): " + str(abertas)
    # sem vídeo: erro claro
    proc2 = ctx.new_page(); proc2.route("https://projudi.tjgo.jus.br/vazio", lambda rr: rr.fulfill(body=PAGINA.replace("Mídia Publicada", "Juntada").replace("Mídia Gravada", "x").replace("Audiência de Instrução e Julgamento", "x"), content_type="text/html; charset=utf-8")); proc2.goto("https://projudi.tjgo.jus.br/vazio")
    tab2 = ext_pg.evaluate("""async () => (await chrome.tabs.query({ url: 'https://projudi.tjgo.jus.br/vazio' }))[0].id""")
    msg = ext_pg.evaluate("""async (t) => { const m = await import('./midias-projudi.js'); try { await m.coletarMidiasDoProcesso(t, '1', () => {}); return 'sem erro'; } catch (e) { return e.message; } }""", tab2)
    print(msg); assert "não achei vídeo" in msg
    ctx.close()
print("OK")
