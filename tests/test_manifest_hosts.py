"""A extensão só age no servidor oficial (judicial.assessor.net.br); a ligação com assessor-judicial.ai.studio foi removida."""
import json, pathlib
m = json.loads((pathlib.Path(__file__).parent.parent / "extensao" / "manifest.json").read_text())
NOVO, ANTIGO = "https://judicial.assessor.net.br/*", "https://assessor-judicial.ai.studio/*"
assert NOVO in m["host_permissions"], "falta em host_permissions"
assert ANTIGO not in m["host_permissions"], "o endereço antigo ainda está nas permissões"
grupos = [c for c in m["content_scripts"] if "studio-base.js" in c["js"] or "studio-main.js" in c["js"]]
assert len(grupos) == 2, grupos
for c in grupos:
    assert NOVO in c["matches"], f"falta em {c['js']}"
    assert ANTIGO not in c["matches"], f"endereço antigo em {c['js']}"
assert "assessor-judicial.ai.studio" not in (pathlib.Path(__file__).parent.parent / "extensao" / "studio-cliente.js").read_text()
print("OK", m["version"])
