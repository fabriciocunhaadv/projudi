import { dividirTextoEmPartes, localizarAutos, reduzirPrompt } from "/tmp/claude-0/work/app/src/utils/autosGrandes";
const pag = (i: number) => `[Página ${i} de 300]\n` + "linha de texto do processo. ".repeat(100) + "\n\n";
let t = ""; for (let i = 1; i <= 300; i++) t += pag(i);
const MAX = 200000;
const p = dividirTextoEmPartes(t, MAX);
console.assert(p.join("") === t, "a junção das partes deve ser idêntica ao texto original");
console.assert(p.every(x => x.length <= MAX), "cada parte respeita o máximo");
console.assert(p.slice(1).every(x => x.startsWith("[Página ")), "cortes em início de página");
console.assert(p.length === Math.ceil(t.length / MAX) || p.length === Math.ceil(t.length / MAX) + 1, "quantidade de partes razoável: " + p.length);
// texto sem marcadores de página nem quebras: ainda divide
const cru = "x".repeat(450000); const q = dividirTextoEmPartes(cru, MAX);
console.assert(q.join("") === cru && q.every(x => x.length <= MAX), "texto cru dividido sem perda");
// localizarAutos e reduzirPrompt
const prompt = "INTRO\nTEXTO DOS AUTOS:\n\"\"\"\n" + t + "\n\"\"\"\nCONTEÚDO:\n\"\"\"\n" + t + "\n\"\"\"\nFIM";
const loc = localizarAutos(prompt, [t, t.slice(0, 100000), "pequeno"]);
console.assert(loc && loc.principal === t && loc.extras.length === 0, "texto contido não vira extra");
const red = reduzirPrompt(prompt, loc!, ["### PARTE 1\nA", "### PARTE 2\nB"], t.length);
console.assert(red.startsWith("INTRO") && red.endsWith("FIM") && !red.includes("Página 150 de 300") && red.includes("### PARTE 2"), "prompt reduzido");
console.assert(red.length < 3000, "prompt reduzido é pequeno: " + red.length);
console.log("unit OK, partes:", p.length, p.map(x => x.length));
