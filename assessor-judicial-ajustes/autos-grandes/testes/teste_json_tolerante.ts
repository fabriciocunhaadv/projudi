const CAMPOS_TEXTO_MINUTA = ["processNumber", "author", "defendant", "judicialUnit", "pendingMatter", "actType", "proceduralPhase", "priorDecisionsSummary", "relatorio", "fundamentacao", "dispositivo", "title", "fullFormattedText"];
function extrairCamposTolerante(t: string): any | null {
    const rx = new RegExp(`"(${CAMPOS_TEXTO_MINUTA.join("|")})"\\s*:\\s*"`, "g");
    const marcas: { k: string; ini: number; fim: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t))) marcas.push({ k: m[1], ini: m.index, fim: m.index + m[0].length });
    if (marcas.length < 2 || !marcas.some(x => ["relatorio", "fundamentacao", "dispositivo"].includes(x.k))) return null;
    const out: any = {};
    marcas.forEach((x, i) => {
        let v = t.slice(x.fim, i + 1 < marcas.length ? marcas[i + 1].ini : t.length);
        v = v.replace(/[\s,]*$/, "").replace(/"\s*[}\]\s]*$/, "");
        v = v.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        if (!(x.k in out)) out[x.k] = v;
    });
    return (out.relatorio || out.fundamentacao || out.dispositivo) ? out : null;
}

function safeParseJson(str: any) {
    if (!str || typeof str !== 'string') return null;
    let clean = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    // Elimina repetições fugitivas de chaves no final (loop de repetição de token)
    clean = clean.replace(/(\}\s*){6,}$/, '}');
    try {
        return JSON.parse(clean);
    } catch (e1) {
        try {
            const firstBrace = clean.indexOf('{');
            const lastBrace = clean.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                const sub = clean.substring(firstBrace, lastBrace + 1);
                return JSON.parse(sub);
            }
        } catch (_) {}

        // JSON inválido por aspas soltas dentro dos textos: recupera os campos pelas chaves (antes o reparo por contagem de aspas misturava relatório e fundamentação)
        try { const tol = extrairCamposTolerante(clean); if (tol) return tol; } catch (_) {}

        // Recuperador de JSON truncado / não-fechado
        try {
            const firstBrace = clean.indexOf('{');
            if (firstBrace === -1) return null;
            let candidate = clean.substring(firstBrace);
            candidate = candidate.replace(/(\}\s*){6,}$/, '');
            let inString = false;
            let escaped = false;
            const stack: string[] = [];
            for (let i = 0; i < candidate.length; i++) {
                const ch = candidate[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    inString = !inString;
                    continue;
                }
                if (!inString) {
                    if (ch === '{' || ch === '[') {
                        stack.push(ch);
                    } else if (ch === '}') {
                        if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
                    } else if (ch === ']') {
                        if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
                    }
                }
            }
            let repaired = candidate;
            if (inString) repaired += '"';
            while (stack.length > 0) {
                const open = stack.pop();
                repaired += (open === '{' ? '}' : ']');
            }
            repaired = repaired.replace(/,\s*([\}\]])/g, '$1');
            return JSON.parse(repaired);
        } catch (_) {}

        return null;
    }
}


const quebrado = `{ "processNumber": "6037369-47.2024.8.09.0166", "author": "KELLYS", "relatorio": "Trata-se de fase de cumprimento. Consta "mov. 64" e o termo "sisbajud". Autos conclusos no Mov. 66.", "fundamentacao": "### 1. DA REGULARIDADE PROCESSUAL\\n\\nO procedimento é válido. Cita-se o art. 52, "IX".", "dispositivo": "1. Defiro.\\n2. Intime-se." }`;
const r = safeParseJson(quebrado);
console.log(JSON.stringify(r, null, 1));
const ok = r && r.relatorio.endsWith("Mov. 66.") && !r.relatorio.includes("fundamentacao") && r.fundamentacao.startsWith("### 1.") && r.fundamentacao.includes("\n") && r.dispositivo === "1. Defiro.\n2. Intime-se." && r.processNumber.startsWith("6037369");
console.log(ok ? "OK" : "FALHOU");
const valido = safeParseJson('[ {"relatorio":"a","fundamentacao":"b","dispositivo":"c"} ]'); console.log(Array.isArray(valido) ? "lista preservada em safeParseJson (ok)" : "mudou");
