// AUTOS GRANDES com chave gratuita: o Google recusa pedidos acima do limite de ENTRADA gratuito (hoje 250 mil tokens, erro "free_tier_input_token_count").
// Só quando isso acontece, a Etapa 1 é refeita uma vez com o texto dos autos em "sanduíche": início (petição inicial e primeiros atos) + fim (atos mais recentes),
// como o sistema já fazia antes. Chave paga e processos que cabem no limite não passam por aqui.

const CHARS_POR_TOKEN = 3.2;
const MIN_CHARS_AUTOS = 60000;

const ehErroEntradaGrande = (e: any) => !!e && (e.codigo === "ENTRADA_GRANDE_GRATUITA" || String(e?.message || "").includes("free_tier_input_token_count"));
const limiteDoErro = (e: any) => Number(String(e?.detalhe || e?.message || "").match(/limit:\s*(\d{4,9})/i)?.[1]) || 250000;
const pagina = (t: string, ini: boolean) => { const m = Array.from(t.matchAll(/\[Página (\d+) de \d+\]/g)); return m.length ? Number(m[ini ? 0 : m.length - 1][1]) : 0; };

export async function gerarComAutosGrandes(gerar: (o: any) => Promise<any>, opts: any): Promise<any> {
    const { autosGrandes, ...resto } = opts;
    try {
        return await gerar(resto);
    } catch (e: any) {
        if (!autosGrandes || !ehErroEntradaGrande(e)) throw e;
        const prompt: string = autosGrandes.userPrompt;
        const grandes: string[] = (autosGrandes.textos || []).filter((t: any) => typeof t === "string" && t.length >= MIN_CHARS_AUTOS && prompt.includes(t)).sort((a: string, b: string) => b.length - a.length);
        if (!grandes.length) throw e;
        const principal = grandes[0], extras = grandes.slice(1).filter(t => !principal.includes(t));
        const sys = resto.config?.systemInstruction;
        const est = Math.ceil((JSON.stringify(resto.contents || "").length + String(typeof sys === "string" ? sys : JSON.stringify(sys || "")).length) / CHARS_POR_TOKEN);
        const limite = limiteDoErro(e);
        const fixo = est - (principal.length + extras.reduce((n, x) => n + x.length, 0)) / CHARS_POR_TOKEN;      // tudo que não são os autos
        const permitido = Math.max(120000, Math.floor((limite * 0.85 - fixo) * CHARS_POR_TOKEN));      // caracteres de autos que cabem
        if (principal.length <= permitido) throw e;
        let ini = principal.slice(0, Math.floor(permitido * 0.4));
        let fim = principal.slice(principal.length - Math.ceil(permitido * 0.6));
        const c1 = ini.lastIndexOf("\n\n"); if (c1 > ini.length * 0.8) ini = ini.slice(0, c1);
        const c2 = fim.indexOf("\n[Página"); if (c2 >= 0 && c2 < fim.length * 0.2) fim = fim.slice(c2 + 1);
        const pA = pagina(ini, false), pB = pagina(fim, true), pN = pagina(principal, false);
        const aviso = `\n\n[AVISO DO SISTEMA: os autos têm cerca de ${Math.round(principal.length / CHARS_POR_TOKEN / 1000)} mil tokens e passam do limite de entrada da API gratuita (${Math.round(limite / 1000)} mil). Foram enviados o INÍCIO (petição inicial e primeiros atos${pA ? `, até a página ${pA}` : ""}) e o FIM (atos mais recentes${pB ? `, da página ${pB}${pN ? ` à ${pN}` : ""}` : ""}). O trecho intermediário NÃO foi enviado: não presuma nada sobre ele e, se algo essencial puder depender dele, registre expressamente que esse trecho não foi analisado.]\n\n`;
        let reduzido = prompt.split(principal).join(ini + aviso + fim);
        for (const x of extras) reduzido = reduzido.split(x).join("(conteúdo já incluído acima)");
        console.log(`[Autos Grandes] Pedido recusado pelo limite de entrada gratuito (~${Math.round(est / 1000)} mil tokens > ${Math.round(limite / 1000)} mil). Refazendo com início + fim dos autos (${Math.round((ini.length + fim.length) / 1000)} mil de ${Math.round(principal.length / 1000)} mil caracteres).`);
        const contents = JSON.parse(JSON.stringify(resto.contents || []));
        if (contents[0]?.parts?.[0]) contents[0].parts[0] = { text: reduzido };
        if (Array.isArray(autosGrandes.partesRef) && autosGrandes.partesRef.length > 0) autosGrandes.partesRef[0] = { text: reduzido };
        return await gerar({ ...resto, contents });
    }
}
