"""A extensão age nos dois servidores oficiais do app (principal e MySQL), sem coringa, e não tem mais a ligação com assessor-judicial.ai.studio."""
import json, pathlib
m = json.loads((pathlib.Path(__file__).parent.parent / "extensao" / "manifest.json").read_text())
PRINCIPAL, MYSQL, ANTIGO = "https://judicial.assessor.net.br/*", "https://judicial-mysql.assessor.net.br/*", "https://assessor-judicial.ai.studio/*"
for dom in (PRINCIPAL, MYSQL):
    assert dom in m["host_permissions"], f"falta em host_permissions: {dom}"
assert ANTIGO not in m["host_permissions"], "o endereço antigo ainda está nas permissões"
assert not [h for h in m["host_permissions"] if "*.assessor.net.br" in h], "não usar coringa para o domínio do app"
grupos = [c for c in m["content_scripts"] if "studio-base.js" in c["js"] or "studio-main.js" in c["js"]]
assert len(grupos) == 2, grupos
for c in grupos:
    for dom in (PRINCIPAL, MYSQL):
        assert dom in c["matches"], f"falta {dom} em {c['js']}"
    assert ANTIGO not in c["matches"], f"endereço antigo em {c['js']}"
    assert not [x for x in c["matches"] if "*.assessor.net.br" in x], "coringa em " + str(c["js"])
assert "assessor-judicial.ai.studio" not in (pathlib.Path(__file__).parent.parent / "extensao" / "studio-cliente.js").read_text()
print("OK", m["version"])
