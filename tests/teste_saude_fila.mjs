// Fila de eventos da extensão (saude-fila.js). Rodar: node tests/teste_saude_fila.mjs
import assert from "node:assert";
const mem = {};
globalThis.chrome = { runtime: { getManifest: () => ({ version: "9.9.9" }) }, storage: { local: { get: async (k) => (typeof k === "string" ? { [k]: mem[k] } : {}), set: async (o) => Object.assign(mem, o) } } };
const { reportarSaude, instalarSaude } = await import("../extensao/saude-fila.js");
await reportarSaude("ocr", "erro", "Falhou o OCR na página 12");
await reportarSaude("ocr", "erro", "Falhou o OCR na página 37");      // mesma mensagem (só muda o número): dentro dos 10 min, não repete
await reportarSaude("esteira", "erro", "Agaia: o Agaia não terminou no tempo previsto");
assert.equal(mem.saudeFila.length, 2, "duplicata (só muda o número) deve ser silenciada");
assert.equal(mem.saudeFila[0].versao, "9.9.9"); assert.equal(mem.saudeFila[0].modulo, "ocr"); assert.ok(mem.saudeFila[0].id && mem.saudeFila[0].ts);
for (let i = 0; i < 100; i++) await reportarSaude("m" + i, "aviso", "mensagem " + "x".repeat(i % 7) + i % 7 * 0 + "a".repeat(i));
assert.ok(mem.saudeFila.length <= 60, "a fila tem limite");
await reportarSaude("x", "erro", "   "); assert.ok(!mem.saudeFila.some((e) => e.modulo === "x"), "mensagem vazia é ignorada");
instalarSaude("teste");      // fora do navegador não pode quebrar
console.log("OK saude-fila");
