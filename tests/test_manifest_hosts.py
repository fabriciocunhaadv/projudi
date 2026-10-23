"""O Studio pode estar no endereço principal (AI Studio) ou no servidor reserva: a extensão tem de agir nos dois (permissão + os dois grupos de scripts do Studio)."""
import json, pathlib
m = json.loads((pathlib.Path(__file__).parent.parent / "extensao" / "manifest.json").read_text())
HOSTS = ["https://assessor-judicial.ai.studio/*", "https://judicial.assessor.net.br/*"]
for h in HOSTS:
    assert h in m["host_permissions"], f"falta em host_permissions: {h}"
grupos = [c for c in m["content_scripts"] if "studio-base.js" in c["js"] or "studio-main.js" in c["js"]]
assert len(grupos) == 2, grupos
for c in grupos:
    for h in HOSTS: assert h in c["matches"], f"falta em {c['js']}: {h}"
print("OK", m["version"])
