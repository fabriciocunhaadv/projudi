"""SEEU: o diagnóstico das telas sai limpo (sem scripts, senha e token _tj) e o botão do SEEU existe no menu. Rodar: /usr/bin/python3 tests/e2e_seeu_diag.py"""
import json, os, re
from playwright.sync_api import sync_playwright
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extensao"))
diag = open(os.path.join(RAIZ, "seeu-diag.js"), encoding="utf-8").read()
HTML = """<html><head><title>Conclusões</title><script>var segredo='ABC123';</script><style>.x{}</style></head><body>
<form><input name="Processo" value=""><input type="password" name="senha" value="MINHA-SENHA-SECRETA"><input type="hidden" name="_tj" value="abcdef0123456789"><input type="hidden" name="idArea" value="42">
<a href="visualizacaoProcesso.do?_tj=0f1e2d3c4b5a69788796a5b4c3d2e1f0&x=1">Abrir processo</a><button>Pré Analisar</button></form></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    pg = b.new_page(); pg.route("**/*", lambda r: r.fulfill(body=HTML, content_type="text/html; charset=utf-8"))
    pg.goto("http://seeu.exemplo.test/seeu/x?_tj=aaaabbbbcccc&jsessionid=XYZ123"); pg.add_script_tag(content=diag)
    r = pg.evaluate("coletarFrameSeeu()")
    h = r["html"]; print(r["url"], len(h))
    assert "MINHA-SENHA-SECRETA" not in h and "ABC123" not in h and "0f1e2d3c4b5a69788796a5b4c3d2e1f" not in h and "abcdef0123456789" not in h, "vazou segredo"
    assert "_tj=aaaabbbbcccc" not in r["url"] and "XYZ123" not in r["url"], r["url"]
    assert "Pré Analisar" in h and 'name="Processo"' in h and 'name="idArea"' in h and "visualizacaoProcesso.do" in h, "perdeu os campos e botões"
    assert "<script" not in h and "<style" not in h
    assert r["topo"] is True
    b.close()
pop = open(os.path.join(RAIZ, "popup.html"), encoding="utf-8").read()
assert 'id="seeu"' in pop and "btn-seeu" in pop and "button.seeu" in pop, "botão do SEEU no menu"
assert 'abrir("seeu.html")' in open(os.path.join(RAIZ, "popup.js"), encoding="utf-8").read()
mf = json.load(open(os.path.join(RAIZ, "manifest.json"), encoding="utf-8"))
assert "https://seeu.pje.jus.br/*" in mf["optional_host_permissions"] and "https://seeu.pje.jus.br/*" not in mf.get("host_permissions", []), "permissão do SEEU é opcional (a loja não desativa a extensão ao atualizar)"
print("OK")
