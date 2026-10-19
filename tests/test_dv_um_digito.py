"""Processos cujo DV começa com zero: o Projudi mostra "5556191.5" (DV 05). A lista, a chave e o padProc têm de reconhecê-los."""
import glob, os
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent
HTML = """<html><body><table><tr><th></th><th>Processo</th><th>Data</th></tr>
<tr><td><input type=checkbox name=pendencias value=11></td><td><a href="/p?Id_Processo=1">5556191.5</a></td><td>05/10/2026 17:10:55</td></tr>
<tr><td><input type=checkbox name=pendencias value=12></td><td><a href="/p?Id_Processo=2">5640831.4</a></td><td>03/09/2026 16:15:59</td></tr>
<tr><td><input type=checkbox name=pendencias value=13></td><td><a href="/p?Id_Processo=3">5406288.56</a></td><td>31/07/2026 17:55:35</td></tr></table></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"]); pg = b.new_page(); pg.set_content("<html></html>")
    pg.add_script_tag(path=str(RAIZ / "extensao" / "parser.js"))
    html = (Path(__file__).parent / "fixtures" / "nao_analisadas.html").read_text(encoding="utf-8")
    # o Projudi mostra o DV sem o zero à esquerda: "1000001.5" (a cópia do número completo continua no ícone)
    curto = html.replace("1000001-11</a>", "1000001.5</a>").replace("1000001-11.2025.8.09.0166", "1000001-05.2025.8.09.0166")
    procs = pg.evaluate("h => ProjudiParser.parseProcessos(h).processos.map((p) => p.processo)", curto); print(procs)
    assert any(x.startswith("1000001") for x in procs), procs
    # sem o número completo no ícone (só o texto curto): ainda tem de aparecer, com o DV de dois dígitos
    semicone = curto.replace("copiarNumeroProcessoFormatado('1000001-05.2025.8.09.0166')", "x()")
    procs2 = pg.evaluate("h => ProjudiParser.parseProcessos(h).processos.map((p) => p.processo)", semicone); print(procs2)
    assert "1000001.05" in procs2, procs2
    chaves = pg.evaluate("""() => { const t = String.raw`(\\d{1,7})[.\\-](\\d{1,2})(?!\\d)`; return ['5556191.5','5556191-05.2026.8.09.0166','5556191.05','57388.42','5406288.56'].map(s => { const m = s.match(new RegExp(t)); return m ? m[1].padStart(7,'0') + m[2].padStart(2,'0') : s; }); }""")
    print(chaves)
    assert chaves[0] == chaves[1] == chaves[2] == "555619105" and chaves[3] == "005738842" and chaves[4] == "540628856", chaves
    b.close()
print("OK")
