"""Esteira no modo Agaia: abre o processo no Agaia (simulado, com a estrutura da tela real), marca opções, escolhe o prompt, entrada Projudi, marca os movimentos UM A UM,
Executar, “Sim, continuar”, espera e devolve a minuta; erro do Agaia (arquivado) fica registrado e a fila segue; verificação com conta NÃO é resolvida; sem login pausa."""
import glob, http.server, json, os, shutil, tempfile, threading, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PORTA = 8791
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
LOGIN = '<html><body><form><input type="password" name="senha"></form></body></html>'
estado = {"cenarios": {}, "pedidos": []}

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        q = urllib.parse.urlparse(s.path); num = urllib.parse.parse_qs(q.query).get("numero_processo", [""])[0]
        estado["pedidos"].append(num)
        cen = estado["cenarios"].get(num, "ok")
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        if cen == "login": s.wfile.write(LOGIN.encode()); return
        s.wfile.write((PAGINA % {"num": num, "cenario": cen, "minuta": json.dumps(MINUTA)}).encode())
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; txt = m.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*")
    m.write_text(txt)
    c = ext / "agaia-cliente.js"; c.write_text(c.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/", f"http://localhost:{PORTA}/agaia/"))
    srv = http.server.ThreadingHTTPServer(("localhost", PORTA), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        usuario = ctx.new_page(); usuario.goto(f"http://localhost:{PORTA}/agaia/home")      # a aba do Agaia que o usuário já deixou aberta (a extensão a reaproveita)
        antes = len(ctx.pages)
        res = ver.evaluate("""async () => {
          const ag = await import('./agaia-cliente.js');
          const it = (p, prompt) => ({ processo: p, prompt: prompt || 'Outros Área Judicial - Fabrício Juizado Especial Cível' });
          const andamento = [];
          const ok = await ag.executarNoAgaia(it('5285460-70.2025.8.09.0166'), { aoAndamento: (t) => andamento.push(t), limiteMs: 60000 });
          return { ok: { ...ok, minutaHtml: (ok.minutaHtml || '').length }, andamento, numero: ag.numeroAgaia('5285460.70'), numero2: ag.numeroAgaia('5285460-70.2025.8.09.0166') };
        }""")
        print("resultado:", res)
        assert res["ok"]["ok"] and "DECISÃO INTERLOCUTÓRIA" in res["ok"]["minutaTexto"] and res["ok"]["minutaHtml"] > 200, res
        assert res["numero"] == "" and res["numero2"] == "5285460.70.2025", res
        assert any("processando" in a for a in res["andamento"]) and any("confirmando" in a for a in res["andamento"]), res["andamento"]
        assert len(ctx.pages) == antes, "abriu aba nova do Agaia"
        pag = [x for x in ctx.pages if "localhost" in x.url and "/agaia/" in x.url][0]
        assert pag.evaluate("[...document.querySelectorAll('.check_movimento')].every(c => c.checked)"), "nem todos os movimentos foram marcados"
        assert pag.evaluate("document.getElementById('consultar_juris_auto').checked && document.getElementById('incluir_contexto_ampliado_acuracia').checked && !document.getElementById('reanalisar_juris_auto').checked"), "opções extras"
        assert pag.evaluate("document.getElementById('e_5d0e').selectedOptions[0].text").startswith("Outros Área Judicial - Fabrício Juizado Especial"), "prompt"
        # erro do Agaia: arquivado -> registra o texto exato
        estado["cenarios"]["5285461.71.2025"] = "arquivado"
        r2 = ver.evaluate("async () => { const ag = await import('./agaia-cliente.js'); return await ag.executarNoAgaia({ processo: '5285461-71.2025.8.09.0166', prompt: 'Outros Área Judicial - Fabrício Juizado Especial Civel' }, { limiteMs: 60000 }); }")
        print("arquivado:", r2); assert not r2["ok"] and "arquivado" in r2["erro"].lower(), r2
        # verificação com conta: NÃO resolve
        estado["cenarios"]["5285462.72.2025"] = "captcha"
        r3 = ver.evaluate("async () => { const ag = await import('./agaia-cliente.js'); return await ag.executarNoAgaia({ processo: '5285462-72.2025.8.09.0166', prompt: 'Outros Área Judicial - Fabrício Juizado Especial Civel' }, { limiteMs: 60000 }); }")
        print("captcha:", r3); assert not r3["ok"] and r3.get("verificacao"), r3
        # sessão expirada
        estado["cenarios"]["5285463.73.2025"] = "login"
        r4 = ver.evaluate("async () => { const ag = await import('./agaia-cliente.js'); return await ag.executarNoAgaia({ processo: '5285463-73.2025.8.09.0166', prompt: 'x' }, { limiteMs: 60000 }); }")
        print("login:", r4); assert not r4["ok"] and r4.get("sessao"), r4
        # número sem ano
        r5 = ver.evaluate("async () => { const ag = await import('./agaia-cliente.js'); return await ag.executarNoAgaia({ processo: '5285460.70', prompt: 'x' }); }")
        print("sem ano:", r5); assert not r5["ok"] and "ano" in r5["erro"], r5
        print("OK"); ctx.close()
    srv.shutdown()

if __name__ == "__main__":
    main()
