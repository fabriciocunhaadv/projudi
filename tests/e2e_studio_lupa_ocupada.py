"""Lupa com processo grande: o app mantém o botão "Auditar Minuta" DESABILITADO e com o texto "Etapa 2 de 3 — conferindo… (40%)" enquanto audita.
A extensão tem de ESPERAR (antes: dava a auditoria por terminada cedo, ou falhava com "não achei o botão Auditar Minuta" e a fila seguia).
Rodar: /usr/bin/python3 tests/e2e_studio_lupa_ocupada.py"""
import glob, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).parent.parent / "extensao"
ETAPA = "Etapa 2 de 3 — conferindo a minuta contra os fatos e os autos... (40%)"
PAG = """<html><body><button id="btn-sidebar-minute-auditor" onclick="document.getElementById('m').style.display='block'">Auditoria Ouro</button>
<div id="m" class="fixed" style="display:none"><h2>Lupa do Magistrado &amp; Auditor de Minutas</h2>
<button id="tn" onclick="document.getElementById('f').style.display='block';document.getElementById('hist').style.display='none'">Nova Auditoria</button><button onclick="document.getElementById('hist').style.display='block'">Processos Auditados</button>
<div id="hist" style="display:none">Nenhum processo auditado encontrado</div>
<div id="f" style="display:none"><select><option>Outros Área Judicial - Cível</option></select>
<input type="text" placeholder="Ex: 5012345-88.2026.8.09.0051"><button id="limpar" onclick="document.getElementById('min').value='';document.getElementById('ta2').value=''">Limpar Tudo (Novo Cadastro)</button><textarea id="min">AUDITORIA ANTERIOR</textarea>
<button onclick="document.getElementById('up').style.display='block';document.getElementById('ta2').style.display='none'">Upload PDF</button><button onclick="document.getElementById('ta2').style.display='block';document.getElementById('up').style.display='none'">Colar Texto</button>
<div id="up" style="display:none"><input type="file" class="hidden"></div><textarea id="ta2" style="display:block">AUTOS ANTERIORES</textarea>
<button id="btn-lupa-auditar-minuta"><span>Auditar Minuta com Rigor do Magistrado</span></button></div></div>
<script>
const ETAPA = %ETAPA%;
const btn = () => document.getElementById('btn-lupa-auditar-minuta');
window.ocupar = (ms, registra) => { const b = btn(); b.disabled = true; b.innerHTML = '<span>' + ETAPA + '</span>'; setTimeout(() => { b.disabled = false; b.innerHTML = '<span>Auditar Minuta com Rigor do Magistrado</span>'; if (registra) document.getElementById('hist').textContent = 'Processos Auditados 1 ' + registra; window.terminou = Date.now(); }, ms); };
btn().onclick = () => { window.auditou = { min: document.getElementById('min').value, t: Date.now() }; window.ocupar(%LONGA%, document.querySelector('input[type=text]').value || '5001234-56.2026.8.09.0166'); };
</script></body></html>"""

def nova(p, longa):
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
    pg = b.new_page(); pg.set_content(PAG.replace("%ETAPA%", repr(ETAPA)).replace("%LONGA%", str(longa)))
    pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set() { return Promise.resolve() } } } }")
    pg.add_script_tag(path=str(RAIZ / "studio-base.js")); return b, pg

def pedir(pg):
    pg.evaluate("() => { window.__r = null; window.auditou = null; }")
    pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'lupa', arquivoId: '', nome: 'x-OCR.pdf', prompt: 'Outros Área Judicial - Cível', processo: '5001234-56.2026.8.09.0166', minuta: 'Minuta do assessor.', dados: { texto: '[Página 1]\\nAutos em texto. ' + 'z'.repeat(300) }, texto: '[Página 1]\\nAutos em texto. ' + 'z'.repeat(300) }, {}, (r) => { window.__r = r })")

with sync_playwright() as p:
    # 1) O app já está auditando (processo grande de antes): o botão chega desabilitado com o texto da etapa. A extensão espera, em vez de falhar em 15 s.
    b, pg = nova(p, 3000)
    pg.evaluate("window.ocupar(20000, '5001234-56.2026.8.09.0166')")      # 20 s ocupado, depois registra e libera
    t0 = time.time(); pedir(pg)
    pg.wait_for_function("window.__r", timeout=120000); r = pg.evaluate("window.__r"); dt = time.time() - t0
    print("1) auditoria em andamento antes do pedido:", dt, r)
    assert dt >= 18 and (r.get("ok") or "não achei o botão" not in str(r.get("erro") or r.get("mensagem"))), (dt, r)
    assert "não achei o botão" not in str(r), r
    b.close()
    # 2) Auditoria longa DEPOIS do clique, com o texto da etapa parado por mais de 12 s: a extensão não pode dar por terminada antes de o botão voltar.
    b, pg = nova(p, 26000)
    t0 = time.time(); pedir(pg)
    pg.wait_for_function("window.__r", timeout=150000); r = pg.evaluate("window.__r"); dt = time.time() - t0
    print("2) auditoria longa (texto da etapa parado):", round(dt), r)
    terminou = pg.evaluate("window.terminou"); assert terminou, "a auditoria simulada nem terminou"
    assert r.get("ok"), r
    assert pg.evaluate("Date.now()") >= terminou, "a extensão respondeu antes de a auditoria terminar"
    assert (time.time() - t0) >= 24, ("respondeu cedo demais, antes do fim da auditoria", dt)
    b.close()
print("OK")
