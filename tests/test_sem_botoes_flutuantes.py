"""Os botões flutuantes “Diagnóstico da tela (extensão)” (app) e “Copiar esta tela / Copiar lista aberta (extensão)” (Projudi) foram retirados da extensão."""
import json
from pathlib import Path
RAIZ = Path(__file__).parent.parent / "extensao"
m = json.loads((RAIZ / "manifest.json").read_text())
scripts = [j for c in m["content_scripts"] for j in c["js"]]
assert "copiar-tela.js" not in scripts and "studio-diag.js" not in scripts, scripts
assert not (RAIZ / "copiar-tela.js").exists() and not (RAIZ / "studio-diag.js").exists()
texto = " ".join(p.read_text(errors="ignore") for p in RAIZ.glob("*.js"))
assert "Diagnóstico da tela (extensão)" not in texto and "Copiar lista aberta (extensão)" not in texto and "Copiar esta tela (extensão)" not in texto
print("OK")
