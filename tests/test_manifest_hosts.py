"""A extensão age SOMENTE no app com MySQL (judicial-mysql.assessor.net.br), sem coringa, e sem o endereço principal nem o antigo assessor-judicial.ai.studio."""
import json, pathlib
m = json.loads((pathlib.Path(__file__).parent.parent / "extensao" / "manifest.json").read_text())
MYSQL, PRINCIPAL, ANTIGO = "https://judicial-mysql.assessor.net.br/*", "https://judicial.assessor.net.br/*", "https://assessor-judicial.ai.studio/*"
assert MYSQL in m["host_permissions"], "falta em host_permissions"
for h in (PRINCIPAL, ANTIGO):
    assert h not in m["host_permissions"], f"não deve estar nas permissões: {h}"
assert not [h for h in m["host_permissions"] if "*.assessor.net.br" in h], "não usar coringa para o domínio do app"
grupos = [c for c in m["content_scripts"] if "studio-base.js" in c["js"] or "studio-main.js" in c["js"]]
assert len(grupos) == 2, grupos
for c in grupos:
    assert c["matches"] == [MYSQL], c["matches"]
src = (pathlib.Path(__file__).parent.parent / "extensao" / "studio-cliente.js").read_text()
assert "assessor-judicial.ai.studio" not in src and "https://judicial.assessor.net.br" not in src
print("OK", m["version"])
