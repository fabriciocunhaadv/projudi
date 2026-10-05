"""Lê a minuta do painel "Resultado & Análise" do app (estrutura real do diagnóstico) sem pegar as caixas de auditoria/teses."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
PAG = """<html><body><div id="root"><div class="bg-white border border-slate-200 rounded-xl"><div class="p-3.5 border-b flex"><div class="flex items-center gap-2"><h3>Resultado &amp; Análise</h3></div><div id="tour-result-actions"><button title="Copiar texto formatado">Copiar</button></div></div>
<div id="tour-result-tabs"><button>Minuta do Ato</button></div><div class="p-5"><div class="max-w-4xl font-serif select-text">
<div class="text-center"><p>PODER JUDICIÁRIO DO ESTADO DE GOIÁS</p><p>PODER JUDICIÁRIO DO ESTADO DE GOIÁS</p><div class="pt-2"><span>SENTENÇA</span></div></div>
<div id="tour-meta-parties-box">Identificação dos Autos &amp; Polos Processo nº: 5001234 CADERNO DE TESES</div>
<div class="space-y-1.5"><h3>I - RELATÓRIO</h3><div class="markdown-body"><p>Trata-se de <strong>embargos</strong> de <em>declaração</em>.</p><p>Os autos vieram conclusos.</p><p style="white-space:pre-line">Linha um.

Linha dois.</p></div></div>
<div class="space-y-1.5 pt-2"><h3>II - FUNDAMENTAÇÃO</h3><div class="markdown-body"><h3>1. DA ADMISSIBILIDADE</h3><p>O recurso é tempestivo.</p><blockquote><p>"Art. 1.022."</p></blockquote></div></div>
<div class="space-y-1.5 pt-2"><h3>III - DISPOSITIVO</h3><div class="markdown-body"><p>Diante do exposto, REJEITO os embargos. Cumpra-se.</p></div></div>
<div class="text-center pt-6">Gabinete Judicial.</div></div></div></div></div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content(PAG)
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener() {} } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js"))
    t = pg.evaluate("window.__projudiMinutaDoPainel()"); h = pg.evaluate("window.__projudiMinutaHtml()"); b.close()
print(t)
linhas = t.split("\n")
assert linhas[0] == "PODER JUDICIÁRIO DO ESTADO DE GOIÁS" and linhas.count("PODER JUDICIÁRIO DO ESTADO DE GOIÁS") == 1 and linhas[1] == "SENTENÇA", linhas
assert "I - RELATÓRIO" in linhas and "1. DA ADMISSIBILIDADE" in linhas and linhas[-1] == "Gabinete Judicial."
assert "CADERNO DE TESES" not in t and "Identificação" not in t
from importlib import import_module
import subprocess, json
print(h)
assert "<b>embargos</b>" in h and "<i>declaração</i>" in h and "<blockquote><p>\"Art. 1.022.\"</p></blockquote>" in h and "<h3>SENTENÇA</h3>" in h and "CADERNO" not in h
assert "Linha um.<br><br>Linha dois." in h, h
print("OK")
