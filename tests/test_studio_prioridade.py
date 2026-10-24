"""Dois apps abertos: a extensão usa o principal; só o MySQL aberto: usa o MySQL; nenhum: abre o principal."""
import json, pathlib, shutil, subprocess, tempfile
raiz = pathlib.Path(__file__).parent.parent / "extensao"
tmp = pathlib.Path(tempfile.mkdtemp()); shutil.copy(raiz / "studio-cliente.js", tmp / "studio-cliente.mjs")
js = r"""
import { abasDoStudioEmOrdem, DOMINIOS_STUDIO, STUDIO_URL } from 'file://%s/studio-cliente.mjs';
const P = 'https://judicial.assessor.net.br/', M = 'https://judicial-mysql.assessor.net.br/';
const t = (id, url) => ({ id, url });
const ids = (l) => abasDoStudioEmOrdem(l).map((a) => a.id).join(',');
const r = {
  dois_mysql_na_frente: ids([t(1, M + 'x'), t(2, P + 'y')]),
  so_mysql: ids([t(5, M)]),
  so_principal: ids([t(7, P + 'a')]),
  varias: ids([t(3, M), t(4, P), t(6, P + 'z')]),
  nenhuma: ids([t(9, 'https://outro.com/')]),
  vazio: ids([]), semlista: ids(undefined),
  padrao: STUDIO_URL, ordem: DOMINIOS_STUDIO,
};
console.log(JSON.stringify(r));
""" % tmp
saida = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True).stdout)
assert saida["dois_mysql_na_frente"] == "2,1", saida      # principal primeiro, mesmo que a aba do MySQL seja a primeira da lista
assert saida["so_mysql"] == "5" and saida["so_principal"] == "7", saida
assert saida["varias"] == "4,6,3", saida                  # as do principal (na ordem) e depois a do MySQL
assert saida["nenhuma"] == "" and saida["vazio"] == "" and saida["semlista"] == "", saida
assert saida["padrao"] == "https://judicial.assessor.net.br/" and saida["ordem"][0] == saida["padrao"], saida
print("OK", saida)
