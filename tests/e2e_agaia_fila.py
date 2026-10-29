"""FILA da esteira no modo Agaia (3 processos): o 1º conclui e é lançado no Histórico do Studio (simulado); o 2º dá erro do Agaia (arquivado), o texto fica registrado e a fila SEGUE; o 3º conclui. Antes:  abre o processo no Agaia (simulado, com a estrutura da tela real), marca opções, escolhe o prompt, entrada Projudi, marca os movimentos UM A UM,
Executar, “Sim, continuar”, espera e devolve a minuta; erro do Agaia (arquivado) fica registrado e a fila segue; verificação com conta NÃO é resolvida; sem login pausa."""
import glob, http.server, json, os, shutil, tempfile, threading, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PORTA = 8793
MINUTA = "<p><strong>DECISÃO INTERLOCUTÓRIA</strong></p><p>I. RELATÓRIO</p><p>" + ("Trata-se de cumprimento de sentença. " * 12) + "</p><p>III. DISPOSITIVO</p><p>Intimem-se.</p>"
PAGINA = """<html><head><meta charset="utf-8"><title>Gerência de Prompts - AGAIA</title></head><body>
<div id="sistem_message"></div>
<form id="form_execucao_moderno" onsubmit="return false">
 <input type="checkbox" id="consultar_juris_auto"><input type="checkbox" id="reanalisar_juris_auto"><input type="checkbox" id="incluir_contexto_ampliado_acuracia">
 <input type="text" id="e_67d8" class="js-ef-f" placeholder="Informe o número do processo 9999999.99.9999" value="%(num)s">
 <select id="e_5d0e" name="f_8374"><option value="">-- Selecione um prompt --</option>
  <option value="630">Outros Área Judicial - Sentença </option><option value="15426">Outros Área Judicial - Fabrício Juizado Especial Civel</option><option value="15429">Outros Área Judicial - Fabrício Juizado Faz.Pub. </option></select>
 <input type="radio" id="tipo_pdf" name="tipo" value="pdf"><input type="radio" id="tipo_movimentos" name="tipo" value="movimentos" onclick="carregarMov()">
 <div id="selecao_upload_dados"></div>
</form>
<button id="executarIA" style="display:none" onclick="executar()">Executar</button>
<div id="resultado_conteudo"><div>Aguardando Execução<br>Preencha os dados e execute o prompt para visualizar o relatório estruturado aqui.</div></div>
<small id="jurisprudencia_execucao_status" style="display:none">Buscando jurisprudências, ementas e precedentes relacionados ao caso...</small>
<div id="form_execucao_lock_overlay"></div>
<div class="modal" id="mdl" style="display:none;position:fixed;top:20%%;left:20%%;background:#fff;border:1px solid #000;padding:10px"><div class="modal-body" id="mdl-corpo"></div><div class="modal-footer" id="mdl-botoes"></div></div>
<div id="em-exec" style="display:none;position:fixed;top:0;left:0;background:#222;color:#fff"><h4>Em execução pela AGAIA...</h4><p>Por favor, aguarde</p></div>
<script>
const CENARIO = "%(cenario)s";
function modal(corpo, botoes) { const m = document.getElementById('mdl'); document.getElementById('mdl-corpo').innerHTML = corpo; document.getElementById('mdl-botoes').innerHTML = botoes; m.style.display = 'block'; m.classList.add('show'); }
function fechar() { const m = document.getElementById('mdl'); m.style.display = 'none'; m.classList.remove('show'); }
function carregarMov() {
  if (CENARIO === 'arquivado') { document.getElementById('sistem_message').innerHTML = '<div class="alert alert-danger">Processo arquivado: o Agaia não executa prompts em processos arquivados.</div>'; return; }
  let h = '<table>'; for (let i = 1; i <= 12; i++) h += '<tr><td>' + (i %% 3 ? '<input type="checkbox" class="check_movimento" onchange="atualizar()">' : '') + '</td><td>Movimento ' + i + '</td></tr>';
  document.getElementById('selecao_upload_dados').innerHTML = h + '</table><button onclick="alert(1)">Todos</button>';
  document.getElementById('executarIA').style.display = 'inline-block';
}
window.marcadosOrdem = [];
function atualizar() { window.marcadosOrdem.push(document.querySelectorAll('.check_movimento:checked').length); }
function executar() {
  if (CENARIO === 'captcha') { modal('Aviso: Dependendo do tamanho do processo... Digite o resultado exibido na imagem. 10 - 2 <input id="resp">', '<button>Confirmar</button>'); return; }
  modal('O conteúdo do prompt menciona jurisprudência/ementa, mas não há vínculo em JurisAGAIA. Deseja continuar a execução mesmo sem JurisAGAIA?', '<button id="nao">Não, quero ajustar</button><button id="sim" onclick="confirmou()">Sim, continuar</button>');
}
function confirmou() {
  fechar(); document.getElementById('em-exec').style.display = 'block';
  setTimeout(() => { document.getElementById('em-exec').style.display = 'none'; document.getElementById('resultado_conteudo').innerHTML = %(minuta)s; document.getElementById('form_execucao_lock_overlay').classList.add('is-active'); document.getElementById('jurisprudencia_execucao_status').style.display = 'block'; setTimeout(() => document.getElementById('jurisprudencia_execucao_status').style.display = 'none', 1500); }, 2500);
}
</script></body></html>"""
STUDIO = """<html><head><meta charset="utf-8"><title>Assessor Judicial</title></head><body><div id="tour-input-panel"></div><script>
window.__cadastros = [];
window.addEventListener('assessor:cadastrar-minuta', (ev) => { const d = JSON.parse(ev.detail); window.__cadastros.push(d); document.documentElement.dataset.agaiaCadastro = JSON.stringify({ reqId: d.reqId, ok: true, id: 'agaia-teste-' + window.__cadastros.length }); });
</script></body></html>"""
LOGIN = '<html><body><form><input type="password" name="senha"></form></body></html>'
estado = {"cenarios": {}, "pedidos": []}

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        q = urllib.parse.urlparse(s.path)
        if not q.path.startswith("/agaia"):
            s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(STUDIO.encode()); return
        num = urllib.parse.parse_qs(q.query).get("numero_processo", [""])[0]
        estado["pedidos"].append(num)
        cen = estado["cenarios"].get(num, "ok")
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        if cen == "login": s.wfile.write(LOGIN.encode()); return
        s.wfile.write((PAGINA % {"num": num, "cenario": cen, "minuta": json.dumps(MINUTA)}).encode())
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; txt = m.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*").replace("https://judicial-mysql.assessor.net.br/*", "http://localhost/*")
    m.write_text(txt)
    c = ext / "agaia-cliente.js"; c.write_text(c.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/", f"http://localhost:{PORTA}/agaia/"))
    c = ext / "studio-cliente.js"; c.write_text(c.read_text().replace('"https://judicial-mysql.assessor.net.br/"', f'"http://localhost:{PORTA}/"'))
    srv = http.server.ThreadingHTTPServer(("localhost", PORTA), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    estado["cenarios"]["5285461.71.2025"] = "arquivado"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        studio = ctx.new_page(); studio.goto(f"http://localhost:{PORTA}/"); studio.wait_for_selector("[data-projudi-ext=studio-envio]", state="attached", timeout=20000)
        ag = ctx.new_page(); ag.goto(f"http://localhost:{PORTA}/agaia/home")
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        er = ctx.new_page(); er.goto(base + "esteira.html"); er.wait_for_selector("body[data-executor='1']", timeout=20000); er.wait_for_timeout(2500)
        ver.evaluate("""async () => {
          const m = await import('./esteira-banco.js'); const prompt = 'Outros Área Judicial - Fabrício Juizado Especial Cível';
          for (const [p, srv] of [['5285460-70.2025.8.09.0166', 'Montes Claros de Goias - Juizado Especial Civel - GO'], ['5285461-71.2025.8.09.0166', 'Montes Claros de Goias - Juizado Especial Civel - GO'], ['5285464-74.2025.8.09.0166', 'Montes Claros de Goias - Juizado Especial Civel - GO']])
            await m.enfileirar({ processo: p, serventia: srv, prompt, modo: 'agaia', pdfNome: '(Agaia)' }, new Uint8Array([0]));
        }""")
        # 4º: a esteira foi recarregada depois de o Agaia terminar: o resultado guardado é aproveitado, SEM abrir o processo de novo
        ver.evaluate("""async () => {
          const m = await import('./esteira-banco.js'); const id = await m.enfileirar({ processo: '5285470-80.2025.8.09.0166', serventia: 'Montes Claros de Goias - Juizado Especial Civel - GO', prompt: 'Outros Área Judicial - Fabrício Juizado Especial Cível', modo: 'agaia', pdfNome: '(Agaia)' }, new Uint8Array([0]));
          const k = 'esteira_' + id; await chrome.storage.local.set({ [k]: { ...(await chrome.storage.local.get(k))[k], agaiaPedido: { reqId: 'retomada1', tabId: 999999 } }, agaia_res_retomada1: { ok: true, minutaTexto: 'DECISÃO INTERLOCUTÓRIA\\n' + 'Texto guardado da execução anterior. '.repeat(10), minutaHtml: '<p>x</p>', prompt: 'p' } });
        }""")
        lista = lambda: ver.evaluate("import('./esteira-banco.js').then(async m => (await m.todos()).map(x => ({ p: x.processo, e: x.estado, erro: x.erro || '', av: x.aviso || '', min: (x.minuta || '').length, pend: !!x.cadastroPendente })))")
        for _ in range(120):
            l = lista()
            if all(x["e"] in ("concluido", "erro") for x in l): break
            er.wait_for_timeout(1500)
        print(json.dumps(l, ensure_ascii=False))
        assert l[0]["e"] == "concluido" and l[0]["min"] > 200 and not l[0]["pend"] and "entregue ao Studio" in l[0]["av"], l[0]
        assert l[1]["e"] == "erro" and "arquivado" in l[1]["erro"].lower(), l[1]
        assert l[2]["e"] == "concluido" and l[2]["min"] > 200, l[2]
        assert l[3]["e"] == "concluido" and l[3]["min"] > 200, l[3]
        cad = studio.evaluate("window.__cadastros.map(d => ({ p: d.processo, s: d.serventia, pr: d.prompt, o: d.origem, t: d.minutaTexto.length }))")
        print("cadastrado no Studio:", cad)
        assert len(cad) == 3 and cad[0]["o"] == "Agaia" and "Juizado Especial" in cad[0]["pr"] and "Montes Claros" in cad[0]["s"], cad
        assert "5285470.80.2025" not in estado["pedidos"], "reabriu no Agaia um processo cuja execução já tinha terminado: " + str(estado["pedidos"])
        assert [x for x in estado["pedidos"] if x] == ["5285460.70.2025", "5285461.71.2025", "5285464.74.2025"], estado["pedidos"]
        print("OK"); ctx.close()
    srv.shutdown()

if __name__ == "__main__":
    main()
