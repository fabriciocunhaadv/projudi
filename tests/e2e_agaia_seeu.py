"""SEEU → Agaia: a extensão abre a tela do Agaia, marca a área SEEU, informa o número SEM formatação, escolhe o prompt, “Através de PDF”, anexa o PDF do SEEU, Executar, “Sim, continuar”,
espera e devolve a minuta. Cenários: sem caixa de concordância (como a tela real do SEEU) e com a caixa (precisa da declaração do usuário)."""
import glob, http.server, json, os, shutil, tempfile, threading, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PORTA = 8793
NUM = "0001234-56.2024.8.09.0051"
MINUTA = "<p><strong>SENTENÇA</strong></p><p>I. RELATÓRIO</p><p>" + ("Trata-se de execução penal do SEEU. " * 14) + "</p><p>III. DISPOSITIVO</p><p>Intimem-se.</p>"
FORM_JUDICIAL = '<form id="form_execucao_legacy"><input type="hidden" name="area_id" value="1"><input type="text" id="numero_processo" placeholder="Informe o número do processo sem formatação"></form>'
FORM_SEEU = """<form id="form_execucao_legacy" onsubmit="return false"><input type="hidden" name="area_id" value="3">
<input type="text" name="numero_processo" id="numero_processo" class="form-control" placeholder="Informe o número do processo sem formatação" value="">
<select name="prompt_id" id="prompt_id" class="form-control" required><option value="630" selected>Outros Área Judicial - Sentença </option><option value="7464">Outros Área Judicial - Fabrício - JECRIM</option><option value="15428">Outros Área Judicial - Fabrício Juizado Especial Criminal</option></select>
<input type="radio" id="tipo_pdf" name="tipo" value="pdf" onclick="mostrarPdf()"><label>Através de PDF</label><input type="radio" id="tipo_texto" name="tipo" value="texto"><label>Através de texto Aberto</label>
<div id="selecao_upload_dados"></div>
<button type="submit" id="executarIA" onclick="executar()">Executar</button></form>"""
PAGINA = """<html><head><meta charset="utf-8"><title>Gerência de Prompts - AGAIA</title></head><body>
<input type="radio" name="area" id="area_Judicial" value="1" checked onchange="trocar()"><input type="radio" name="area" id="area_SEEU" value="3" onchange="trocar()">
<div id="sistem_message"></div><div id="componente_form_execucao_prompt">%(judicial)s</div>
<div id="resultado_conteudo"><div>Aguardando Execução<br>Preencha os dados e execute o prompt para visualizar o relatório estruturado aqui.</div></div>
<div class="modal" id="mdl" style="display:none;position:fixed;top:20%%;left:20%%;background:#fff;border:1px solid #000;padding:10px"><div class="modal-header">Confirmação de execução</div><div class="modal-body" id="mdl-corpo"></div><div class="modal-footer" id="mdl-botoes"></div></div>
<div id="em-exec" style="display:none"><h4>Em execução pela AGAIA...</h4></div>
<script>
const CEN = "%(cenario)s"; window.__log = [];
function trocar() { setTimeout(() => { if (document.getElementById('area_SEEU').checked) document.getElementById('componente_form_execucao_prompt').innerHTML = %(seeu)s; }, 400); }
function mostrarPdf() { document.getElementById('selecao_upload_dados').innerHTML = '<fieldset><legend>Juntar PDFs:</legend><a href="#" id="addpdf">Adicionar PDF</a><div id="lista_documentos"></div><input type="file" id="inputPdfFile" accept="application/pdf" class="d-none" onchange="addPdf(event)"></fieldset>'; }
function addPdf(e) { const f = e.target.files[0]; window.__log.push('pdf:' + f.name + ':' + f.size); document.getElementById('lista_documentos').innerHTML = '<div>' + f.name + '</div>';
  if (CEN === 'concordo') setTimeout(() => { document.getElementById('selecao_upload_dados').insertAdjacentHTML('beforeend', '<label><input type="checkbox" id="concordo"> Eu avaliei a extração realizada pela AGAIA. Concordo com o texto extraído, não identifiquei inconformidades com a LGPD e autorizo seu envio para a IA</label>'); }, 1500); }
function executar() {
  if (CEN === 'concordo' && !(document.getElementById('concordo') || {}).checked) { window.__log.push('executou sem concordar'); return; }
  window.__log.push('numero:' + document.getElementById('numero_processo').value + ';prompt:' + document.getElementById('prompt_id').selectedOptions[0].text.trim());
  const m = document.getElementById('mdl'); document.getElementById('mdl-corpo').textContent = 'O conteúdo do prompt menciona jurisprudência/ementa, mas não há vínculo em JurisAGAIA. Deseja continuar a execução mesmo sem JurisAGAIA?';
  document.getElementById('mdl-botoes').innerHTML = '<button id="nao">Não, quero ajustar</button><button id="sim" onclick="confirmou()">Sim, continuar</button>'; m.style.display = 'block'; m.classList.add('show'); }
function confirmou() { const m = document.getElementById('mdl'); m.style.display = 'none'; m.classList.remove('show'); window.__log.push('confirmou'); document.getElementById('em-exec').style.display = 'block';
  setTimeout(() => { document.getElementById('em-exec').style.display = 'none'; document.getElementById('resultado_conteudo').innerHTML = %(minuta)s; }, 2500); }
</script></body></html>"""
estado = {"cenario": "semcaixa", "pedidos": []}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        estado["pedidos"].append(s.path)
        s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers()
        s.wfile.write((PAGINA % {"judicial": FORM_JUDICIAL, "seeu": json.dumps(FORM_SEEU), "cenario": estado["cenario"], "minuta": json.dumps(MINUTA)}).encode())
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    c = ext / "agaia-cliente.js"; c.write_text(c.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/", f"http://localhost:{PORTA}/agaia/"))
    srv = http.server.ThreadingHTTPServer(("localhost", PORTA), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        usuario = ctx.new_page(); usuario.goto(f"http://localhost:{PORTA}/agaia/home")
        def rodar(cenario, aceite, proc=NUM):
            estado["cenario"] = cenario
            return ver.evaluate("""async ([proc, aceite]) => {
              const ag = await import('./agaia-cliente.js');
              const bytes = new Uint8Array(3000).fill(37);
              const r = await ag.executarNoAgaia({ processo: proc, prompt: 'Outros Área Judicial - Sentença' }, { limiteMs: 60000, seeu: true, pdf: { bytes, nome: 'seeu.pdf' }, aceiteSigilo: aceite });
              return { ...r, minutaHtml: (r.minutaHtml || '').length, n: ag.numeroSeeu(proc), formatado: ag.numeroSeeu('5285460-70.2025.8.09.0166'), curto: ag.numeroSeeu('5285460.70') };
            }""", [proc, aceite])
        r = rodar("semcaixa", False); print("semcaixa:", {k: r[k] for k in ("ok", "erro", "prompt", "n") if k in r})
        assert r["ok"] and "SENTENÇA" in r["minutaTexto"] and r["minutaHtml"] > 200, r
        assert r["n"] == "00012345620248090051", "número do SEEU sem formatação (20 dígitos)"
        pag = [x for x in ctx.pages if "localhost" in x.url and "/agaia/" in x.url][0]
        log = pag.evaluate("window.__log"); print(log)
        assert any(l.startswith("numero:00012345620248090051;prompt:Outros Área Judicial - Sentença") for l in log), log
        assert any(l.startswith("pdf:seeu.pdf:3000") for l in log) and "confirmou" in log, log
        assert any("/agaia/prompts?back_url=" in x for x in estado["pedidos"]), estado["pedidos"]
        # com caixa de concordância: sem a declaração do usuário, não executa; com ela, executa
        r = rodar("concordo", False); print("concordo sem aceite:", r.get("erro"))
        assert not r["ok"] and "concordância" in r["erro"], r
        r = rodar("concordo", True); assert r["ok"] and "SENTENÇA" in r["minutaTexto"], r
        assert "executou sem concordar" not in pag.evaluate("window.__log")
        # número sem 20 dígitos: recusa com explicação
        r = rodar("semcaixa", False, "5285460.70"); assert not r["ok"] and "20 dígitos" in r["erro"], r
        ctx.close()
    print("OK: SEEU → Agaia")
main()
