#!/usr/bin/env python3
"""Gera publicacao/projudi-extensao-<versao>.zip pronto para enviar à Chrome Web Store.
Remove o campo "key" do manifest (a loja não aceita), não leva testes/arquivos de desenvolvimento e confere a versão."""
import json, subprocess, sys, zipfile
from pathlib import Path

raiz = Path(__file__).parent / "extensao"
m = json.loads((raiz / "manifest.json").read_text())
versao = m["version"]
saida = Path(__file__).parent / "publicacao"; saida.mkdir(exist_ok=True)
anterior = saida / "ultima-versao.txt"
if anterior.exists() and anterior.read_text().strip() == versao and "--forcar" not in sys.argv:
    sys.exit(f"A versão {versao} já foi empacotada. Aumente \"version\" em extensao/manifest.json (a loja só aceita número maior) ou use --forcar.")
m.pop("key", None)                  # a loja não aceita "key" (ela mesma gera o ID)
if "COLE_AQUI" in json.dumps(m.get("oauth2", {})):      # login do Google ainda não configurado: tira o bloco e a permissão do pacote da loja
    m.pop("oauth2", None); m["permissions"] = [x for x in m.get("permissions", []) if x != "identity"]
    print("AVISO: oauth2.client_id ainda é o texto de exemplo; o pacote vai SEM login do Google (o Docs usa o plano B: colar a minuta).")
alvo = saida / f"projudi-extensao-{versao}.zip"
with zipfile.ZipFile(alvo, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(raiz.rglob("*")):
        if f.is_dir() or f.name.startswith(".") or f.suffix in {".md", ".map"}: continue
        z.writestr(str(f.relative_to(raiz)), json.dumps(m, indent=2, ensure_ascii=False) if f.name == "manifest.json" and f.parent == raiz else f.read_bytes())
anterior.write_text(versao)
print("Gerado:", alvo, f"({alvo.stat().st_size / 1048576:.1f} MB)")
