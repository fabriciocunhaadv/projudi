#!/usr/bin/env python3
"""Gera publicacao-teste/projudi-extensao-TESTE-<versao>.zip: a MESMA extensão, mas ligada ao app de TESTE (construcao-nova).
Diferenças em relação ao pacote da loja (empacotar.py):
  - nome "Conclusões Projudi (TESTE)" e ID próprio (sem "key"), para conviver com a extensão oficial;
  - as telas do Studio (content scripts) passam a ser https://ai.studio/apps/<id do app de teste> (e *.run.app, se o app rodar numa moldura) em vez de *.ai.studio;
  - se não houver aba do app de teste aberta, a esteira avisa em vez de abrir o Studio PUBLICADO.
Instalar: descompacte o .zip numa pasta e use chrome://extensions → Modo do desenvolvedor → Carregar sem compactação.
Use UMA das duas extensões por vez no Projudi (desative a oficial enquanto testa), senão os botões aparecem em dobro."""
import json, zipfile
from pathlib import Path

APP_ID = "ce9bc744-6a53-4141-a2bf-80e69447e6b3"      # app "assessor-judicial-construcao-nova" no AI Studio
PAGINAS_TESTE = [f"https://ai.studio/apps/{APP_ID}*", f"https://aistudio.google.com/apps/{APP_ID}*"]      # a página do editor/preview (a aba que o Chrome mostra)
raiz = Path(__file__).parent / "extensao"
m = json.loads((raiz / "manifest.json").read_text())
versao = m["version"]
saida = Path(__file__).parent / "publicacao-teste"; saida.mkdir(exist_ok=True)
m.pop("key", None)
m["name"] = "Conclusões Projudi (TESTE)"
m["action"]["default_title"] = "Conclusões Projudi (TESTE)"
if "COLE_AQUI" in json.dumps(m.get("oauth2", {})):
    m.pop("oauth2", None); m["permissions"] = [x for x in m.get("permissions", []) if x != "identity"]
m["host_permissions"] = [h for h in m["host_permissions"] if h not in ("https://judicial.assessor.net.br/*", "https://judicial-mysql.assessor.net.br/*")] + ["https://ai.studio/*", "https://*.run.app/*", "https://aistudio.google.com/*"]
for cs in m["content_scripts"]:
    if "https://judicial.assessor.net.br/*" in cs["matches"]:
        cs["matches"] = PAGINAS_TESTE + ["https://*.run.app/*"]      # a página do AI Studio com o app de teste (o app roda num quadro *.run.app dentro dela)
        cs["all_frames"] = True
alvo = saida / f"projudi-extensao-TESTE-{versao}.zip"
with zipfile.ZipFile(alvo, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(raiz.rglob("*")):
        if f.is_dir() or f.name.startswith(".") or f.suffix in {".md", ".map"}: continue
        rel = str(f.relative_to(raiz))
        if f.name == "manifest.json" and f.parent == raiz:
            z.writestr(rel, json.dumps(m, indent=2, ensure_ascii=False))
        elif rel == "studio-cliente.js":
            t = f.read_text()
            velho = 'if (!aba) aba = await chrome.tabs.create({ url: STUDIO_URL, active: false });'
            assert velho in t, "studio-cliente.js mudou: ajuste empacotar_teste.py"
            z.writestr(rel, t.replace(velho, 'if (!aba) throw new Error("Abra o app de TESTE (endereço ais-…run.app) numa aba e deixe-a aberta; esta extensão de teste não abre o Studio publicado.");'))
        else:
            z.writestr(rel, f.read_bytes())
for velho in saida.glob("projudi-extensao-TESTE-*.zip"):
    if velho != alvo: velho.unlink()
print("Gerado:", alvo, f"({alvo.stat().st_size / 1048576:.1f} MB)")
