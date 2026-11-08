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
// ---- teste de acesso pelo navegador
import { urlDeTestePermitida, sitesValidos, origensDosSites, analisarResposta } from "../extensao/leis-core.js";
assert.ok(urlDeTestePermitida("https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=26") && urlDeTestePermitida("https://www.tjgo.jus.br/"));
for (const ruim of ["http://www.tjgo.jus.br/", "https://evil.com/", "https://www.tjgo.jus.br.evil.com/", "https://u:p@www.tjgo.jus.br/", "file:///etc/passwd"]) assert.ok(!urlDeTestePermitida(ruim), ruim);
const sv = sitesValidos([{ id: "a", url: "https://www.stj.jus.br/x" }, { id: "b", url: "https://evil.com/y" }]); assert.equal(sv.length, 1);
assert.deepEqual(origensDosSites([{ url: "https://www.stj.jus.br/x?y=1" }, { url: "https://www.stj.jus.br/z" }]), ["https://www.stj.jus.br/*"]);
const enc = (s) => new TextEncoder().encode(s);
let a = analisarResposta({ status: 200, contentType: "text/html", bytes: enc("<html><body><p>Supremo Tribunal Federal</p><p>Súmulas &amp; teses</p></body></html>") });
assert.ok(!a.bloqueio && a.amostra.includes("Súmulas & teses"), JSON.stringify(a));
a = analisarResposta({ status: 403, contentType: "text/html", bytes: enc("<html><body>Attention Required! | Cloudflare. Please enable cookies.</body></html>") }); assert.ok(a.bloqueio, "página de Cloudflare = bloqueio");
a = analisarResposta({ status: 200, contentType: "text/html; charset=windows-1252", bytes: Uint8Array.from([...Buffer.from("<p>Presid", "latin1"), 0xEA, ...Buffer.from("ncia da Rep", "latin1"), 0xFA, ...Buffer.from("blica</p>", "latin1")]) }); assert.ok(a.amostra.includes("Presidência da República"), a.amostra);
a = analisarResposta({ status: 200, contentType: "application/pdf", bytes: enc("%PDF-1.4 xxxx") }); assert.equal(a.amostra, "(arquivo PDF)");
console.log("OK teste de acesso (núcleo)");
// ---- busca de fontes pendentes
import { urlsFederais, paginaTemOAto, analisarListagem, acharArquivoNaPagina, sitesParaFonte, itensValidos } from "../extensao/leis-core.js";
assert.ok(urlsFederais({ tipo: "lei", numero: "14905", ano: 2024 })[0].endsWith("/_ato2023-2026/2024/lei/l14905.htm"));
assert.ok(urlsFederais({ tipo: "lei", numero: "9099", ano: 1995 })[0].endsWith("/leis/l9099.htm"));
assert.ok(urlsFederais({ tipo: "lei", numero: "10406", ano: 2002 })[0].endsWith("/leis/2002/l10406.htm"));
assert.ok(urlsFederais({ tipo: "decreto", numero: "10932", ano: 2022 })[0].endsWith("/_ato2019-2022/2022/decreto/d10932.htm"));
assert.deepEqual(urlsFederais({ tipo: "portaria", numero: "1", ano: 2020 }), [], "sem padrão: nada a tentar");
assert.ok(urlsFederais({ tipo: "lei", numero: "14905", ano: 2024 }).every((u) => u.startsWith("https://www.planalto.gov.br/ccivil_03/")));
assert.ok(paginaTemOAto("<p>LEI Nº 14.905</p><p>Art. 1º A Lei...</p>", { numero: "14905" }) && !paginaTemOAto("<p>sem artigos 14.905</p>", { numero: "14905" }) && !paginaTemOAto("<p>Art. 1º x</p>", { numero: "999" }));
const listagem = `<ul><li><a href="/cidadao/legislacao/leis/812">Lei nº 1.233 de 02/03/2014 - Dispõe sobre o IPTU</a></li>
 <li><a href="/cidadao/legislacao/leis/815">Lei Municipal nº 1.234 de 10/03/2015 - Dispõe sobre taxas</a></li>
 <li><a href="/arquivos/lei-1234-2015.pdf">Baixar PDF</a></li>
 <li><a class="pg" href="?pagina=2">Próxima</a></li></ul>`;
let an = analisarListagem(listagem, "https://acessoainformacao.montesclarosdegoias.go.leg.br/cidadao/legislacao/leis", { tipo: "lei", numero: "1234", ano: 2015 });
assert.equal(an.candidatos.length, 2, JSON.stringify(an.candidatos)); assert.ok(an.candidatos[0].url.endsWith("/leis/815") || an.candidatos[0].url.endsWith("lei-1234-2015.pdf"));
assert.ok(an.proxima.endsWith("?pagina=2"), "link da próxima página"); assert.ok(!an.candidatos.some((c) => c.url.endsWith("/812")), "lei de outro número não entra");
assert.equal(analisarListagem(listagem, "https://x.gov.br/a", { tipo: "lei", numero: "1234", ano: 2016 }).candidatos.length, 0, "ano diferente não entra");
assert.ok(acharArquivoNaPagina('<a href="/doc/1234.pdf">Texto integral</a>', "https://x.gov.br/leis/815").endsWith("/doc/1234.pdf"));
const fb = [{ esfera: "municipal", ente: "Montes Claros de Goiás", url: "https://acessoainformacao.montesclarosdegoias.go.leg.br/cidadao/legislacao/leis" }, { esfera: "estadual", ente: "Goiás", url: "https://leisestaduais.com.br/go" }, { esfera: "estadual", ente: "X", url: "https://evil.com/x" }];
assert.equal(sitesParaFonte({ esfera: "municipal", ente: "Montes Claros de Goiás" }, fb).length, 1); assert.equal(sitesParaFonte({ esfera: "municipal", ente: "Goiânia" }, fb).length, 0, "outro município: sem site");
assert.equal(sitesParaFonte({ esfera: "estadual", ente: "Goiás" }, fb).length, 1); assert.equal(sitesParaFonte({ esfera: "indefinida" }, fb).length, 2, "indefinida tenta os sites permitidos"); assert.equal(sitesParaFonte({ esfera: "federal" }, fb).length, 0);
assert.equal(itensValidos([{ id: "a", tipo: "lei", numero: "1.234", ano: "2015", esfera: "municipal" }, { id: "a" }, {}]).length, 1);
console.log("OK busca de fontes (núcleo)");
