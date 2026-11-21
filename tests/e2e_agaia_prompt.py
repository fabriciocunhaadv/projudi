"""Studio → Agaia: troca o texto de um prompt do Agaia (achado pelo TÍTULO, inclusive na 2ª página da lista) pelo prompt do Studio, terminando em “Texto fornecido: {}”,
guarda cópia do texto antigo, confere depois de salvar, avisa se o título não existe / se há dois iguais, e devolve a cópia (restaurar). Agaia simulado com a estrutura descrita pelo usuário."""
import glob, http.server, json, os, shutil, tempfile, threading, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PORTA = 8793
prompts = {  # id -> dados guardados "no servidor"
    "10": {"titulo": "Prompt Outro A", "texto": "antigo A\nTexto fornecido: {}", "unidade": "1ª Vara"},
    "11": {"titulo": "Prompt Outro B", "texto": "antigo B\nTexto fornecido: {}", "unidade": "1ª Vara"},
    "77": {"titulo": "Fabrício Minha Sentença Cível", "texto": "Texto ANTIGO do Agaia\nsegunda linha antiga\n\nTexto fornecido: {}", "unidade": "Juizado"},
    "12": {"titulo": "Fabrício Juizado Especial Criminal", "texto": "crim", "unidade": "Vara"},
    "13": {"titulo": "Fabrício Juizado Especial Cível", "texto": "civ", "unidade": "Vara"},
    "14": {"titulo": "Fabrício Come Tags", "texto": "texto original sem marcas", "unidade": "Vara"},
    "90": {"titulo": "Duplicado", "texto": "d1", "unidade": "Vara X"},
    "91": {"titulo": "Duplicado", "texto": "d2", "unidade": "Vara Y"},
}
salvos = []
LISTA = """<html><body><h1>Lista de Prompts</h1><table id="t"><thead><tr><th>Unidade</th><th>Tipo</th><th>Título</th><th>Privacidade</th><th>Ações</th></tr></thead><tbody id="tb"></tbody></table>
<ul class="pagination"><li class="page-item"><a href="#" id="prox" class="page-link" onclick="pag2();return false">Próximo</a></li></ul>
<script>
const P = %(rows)s;
function lin(id, p) { return '<tr><td>' + p.unidade + '</td><td>Judicial</td><td>' + p.titulo + '</td><td>Privado</td><td><a href="/agaia/prompts/' + id + '">Mostrar</a> <a href="/agaia/prompts/edit/' + id + '" title="Editar">Editar</a> <a href="#">Remover</a></td></tr>'; }
const ids = Object.keys(P);
document.getElementById('tb').innerHTML = ids.slice(0, 2).map((i) => lin(i, P[i])).join('');
function pag2() { document.getElementById('tb').innerHTML = ids.slice(2).map((i) => lin(i, P[i])).join(''); document.getElementById('prox').parentElement.className += ' disabled'; }
</script></body></html>"""
EDIT = """<html><body><h1>Editar Prompt</h1><form onsubmit="return false">
<label for="titulo">Título</label><input type="text" id="titulo" name="titulo" value="%(titulo)s">
<div class="toolbar"><button type="button">B</button><button type="button">I</button><button type="button">MELHORAR PROMPT</button></div>
<div id="ed" class="ql-editor" contenteditable="true" style="width:600px;height:300px;border:1px solid #000">%(html)s</div>
<button type="button" id="salvar" onclick="gravarPrompt()">Salvar</button> <button type="button">Cancelar</button></form>
<script>
function texto() { const e = document.getElementById('ed'); return [...e.childNodes].map((c) => c.textContent).join('\\n'); }
async function gravarPrompt() { await fetch('/salvar/%(id)s', { method: 'POST', body: texto() }); location.href = '/agaia/prompts/%(id)s'; }
</script></body></html>"""
def corpo_html(t): return "".join("<p>" + (l.replace("&", "&amp;").replace("<", "&lt;") or "<br>") + "</p>" for l in t.split("\n"))
class H(http.server.BaseHTTPRequestHandler):
    def _html(s, h): s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(h.encode())
    def do_GET(s):
        p = urllib.parse.urlparse(s.path).path
        if p == "/agaia/prompts/lista": s._html(LISTA % {"rows": json.dumps(prompts)})
        elif p.startswith("/agaia/prompts/edit/"):
            i = p.rsplit("/", 1)[1]; d = prompts[i]; s._html(EDIT % {"id": i, "titulo": d["titulo"], "html": corpo_html(d["texto"])})
        elif p.startswith("/agaia/prompts/"): s._html("<html><body><h1>Detalhe</h1><button>Lista de Prompts</button><button>Editar</button></body></html>")
        else: s._html("<html><body>home</body></html>")
    def do_POST(s):
        i = s.path.rsplit("/", 1)[1]; n = int(s.headers.get("Content-Length", 0)); t = s.rfile.read(n).decode()
        if i == "14": t = __import__("re").sub(r"<[^>]*>", "", t)      # Agaia que engole as marcas
        prompts[i]["texto"] = t; salvos.append((i, t))
        s.send_response(200); s.end_headers()
    def log_message(*a): pass

def main():
    tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
    m = ext / "manifest.json"; m.write_text(m.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*").replace("https://*.tjgo.jus.br/*", "http://localhost/*"))
    b = ext / "agaia-prompts-bg.js"; t = b.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/", f"http://localhost:{PORTA}/agaia/"); b.write_text(t)
    j = ext / "agaia-prompts.js"; j.write_text(j.read_text().replace("https://simplesefacil.tjgo.jus.br/agaia/*", "http://localhost/agaia/*"))
    srv = http.server.ThreadingHTTPServer(("localhost", PORTA), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        base = f"chrome-extension://{sw.url.split('/')[2]}/"
        ver = ctx.new_page(); ver.goto(base + "ferramentas.html")
        usuario = ctx.new_page(); usuario.goto(f"http://localhost:{PORTA}/agaia/home")
        antes = len(ctx.pages)
        env = lambda titulo, texto: ver.evaluate("async ([t, x]) => await chrome.runtime.sendMessage({ acao: 'agaia-prompt-enviar', titulo: t, texto: x })", [titulo, texto])
        # 1) troca, título só difere em maiúsculas/acentos; o prompt do Studio já traz a linha final no meio: sai uma só, no fim
        studio = "Você é um assessor.\n\nTexto fornecido: {}\nRegra 1\nRegra 2 <b>&</b>"
        r = env("Outros Área Judicial - Minha sentenca civel", studio)
        print("troca:", r, repr(prompts["77"]["texto"]), salvos); assert r["ok"], r
        esperado = "Você é um assessor.\n\nRegra 1\nRegra 2 <b>&</b>\n\nTexto fornecido: {}"
        assert prompts["77"]["texto"].strip() == esperado, repr(prompts["77"]["texto"])
        assert prompts["10"]["texto"].startswith("antigo A") and prompts["11"]["texto"].startswith("antigo B"), "mexeu em outro prompt"
        assert len(ctx.pages) == antes, "abriu aba nova"
        assert "/agaia/prompts/lista" in usuario.url, usuario.url      # terminou de volta na lista, pronto p/ o próximo
        # 2) cópia de segurança guardada com o texto antigo
        bk = ver.evaluate("chrome.storage.local.get('agaia_prompt_backups').then(x => x.agaia_prompt_backups)")
        assert len(bk) == 1 and bk[0]["tituloAgaia"] == "Fabrício Minha Sentença Cível" and "Texto ANTIGO do Agaia" in bk[0]["texto"] and "segunda linha antiga" in bk[0]["texto"], bk
        rc = env("Outros Área Judicial - Juizado Especial Civel", "so civel"); print("civel x criminal:", rc); assert rc["ok"] and rc["tituloAgaia"] == "Fabrício Juizado Especial Cível", rc
        assert prompts["12"]["texto"] == "crim" and prompts["13"]["texto"].startswith("so civel"), "confundiu cível com criminal"
        # 3) título que não existe: avisa, sem criar nada
        n0 = len(prompts); r2 = env("Não existe", "x")
        print("inexistente:", r2); assert not r2["ok"] and r2.get("naoEncontrado") and "Não existe" in r2["erro"], r2
        assert len(prompts) == n0
        # 4) título duplicado: não escolhe no escuro
        r3 = env("Duplicado", "y"); print("duplicado:", r3); assert not r3["ok"] and "2 prompts" in r3["erro"], r3
        assert prompts["90"]["texto"] == "d1" and prompts["91"]["texto"] == "d2"
        rt = env("Outros Área Judicial - Come Tags", "<prompt><titulo>X</titulo>\nregra</prompt>"); print("engole tags:", rt)
        assert not rt["ok"] and rt.get("alterado") and "Devolvi o texto antigo" in rt["erro"], rt
        assert prompts["14"]["texto"].strip() == "texto original sem marcas", repr(prompts["14"]["texto"])
        # 5) vários seguidos (fila): cada um na sua vez
        r4 = ver.evaluate("""async () => await Promise.all([
          chrome.runtime.sendMessage({ acao: 'agaia-prompt-enviar', titulo: 'Prompt Outro A', texto: 'novo A' }),
          chrome.runtime.sendMessage({ acao: 'agaia-prompt-enviar', titulo: 'Prompt Outro B', texto: 'novo B' })])""")
        print("fila:", r4); assert all(x["ok"] for x in r4), r4
        assert prompts["10"]["texto"].strip() == "novo A\n\nTexto fornecido: {}" and prompts["11"]["texto"].strip() == "novo B\n\nTexto fornecido: {}", (prompts["10"], prompts["11"])
        # 6) restaurar a cópia do primeiro envio
        bk = ver.evaluate("chrome.storage.local.get('agaia_prompt_backups').then(x => x.agaia_prompt_backups)")
        orig = [x for x in bk if "Texto ANTIGO do Agaia" in x["texto"]][0]
        r5 = ver.evaluate("async (b) => await chrome.runtime.sendMessage({ acao: 'agaia-prompt-restaurar', titulo: b.tituloAgaia, texto: b.texto })", orig)
        print("restaurar:", r5); assert r5["ok"], r5
        assert prompts["77"]["texto"].strip() == orig["texto"].strip(), repr(prompts["77"]["texto"])
        bk2 = ver.evaluate("chrome.storage.local.get('agaia_prompt_backups').then(x => x.agaia_prompt_backups)")
        assert len(bk2) == len(bk), "restaurar não deve criar outra cópia"
        # 7) página das cópias abre e lista
        pg = ctx.new_page(); pg.goto(base + "agaia-prompts.html"); pg.wait_for_selector(".item")
        assert pg.locator(".item").count() >= 3 and pg.locator("button", has_text="Devolver ao Agaia").count() >= 3
        usuario.goto(f"http://localhost:{PORTA}/agaia/prompts/edit/77"); usuario.wait_for_selector("#ed"); __import__("time").sleep(1)
        pg.click("#diag"); pg.wait_for_function("document.getElementById('diagtxt').value.length > 50")
        dg = pg.evaluate("document.getElementById('diagtxt').value"); assert '"editores"' in dg and "ql-editor" in dg, dg[:300]
        n = pg.locator(".item").count(); pg.locator("button", has_text="Apagar esta cópia").first.click(); pg.locator("button", has_text="Clique de novo").first.click()
        pg.wait_for_function(f"document.querySelectorAll('.item').length == {n - 1}")
        ctx.close()
    print("OK e2e_agaia_prompt")
main()
