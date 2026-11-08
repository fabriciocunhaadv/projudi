// Rodar: node tests/teste_leis_core.mjs
import assert from "node:assert";
import { urlPermitida, motivoDeRecusa, leisValidas, nomeDoArquivo } from "../extensao/leis-core.js";
assert.ok(urlPermitida("https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm"));
for (const ruim of ["http://www.planalto.gov.br/ccivil_03/x.htm", "https://evil.com/ccivil_03/x.htm", "https://www.planalto.gov.br.evil.com/ccivil_03/x", "https://www.planalto.gov.br/outra/x.htm", "https://u:p@www.planalto.gov.br/ccivil_03/x.htm", "javascript:alert(1)", ""]) assert.ok(!urlPermitida(ruim), ruim);
const grande = new Uint8Array(50000).fill(65);
assert.equal(motivoDeRecusa(200, grande), null);
assert.match(motivoDeRecusa(404, grande), /HTTP 404/); assert.match(motivoDeRecusa(200, new Uint8Array(100)), /pequena/);
const negado = new TextEncoder().encode("<html>Acesso Negado. Em caso de duvida bloqueio.de.aplicacoes@presidencia.gov.br ".padEnd(2000, " ") + "</html>");
assert.match(motivoDeRecusa(200, negado), /bloqueou/);
const lista = leisValidas([{ id: "cpc", nome: "CPC", url: "https://www.planalto.gov.br/ccivil_03/l13105.htm" }, { id: "cpc", url: "https://www.planalto.gov.br/ccivil_03/dup.htm" }, { id: "x", url: "https://evil.com/a" }, { url: "https://www.planalto.gov.br/ccivil_03/semid.htm" }]);
assert.equal(lista.length, 1); assert.equal(lista[0].id, "cpc");
assert.equal(leisValidas(Array.from({ length: 100 }, (_, i) => ({ id: "l" + i, url: "https://www.planalto.gov.br/ccivil_03/l" + i + ".htm" }))).length, 40);
assert.equal(nomeDoArquivo("https://www.planalto.gov.br/ccivil_03/leis/l9099.htm?x=1"), "l9099.htm");
console.log("OK leis-core");
