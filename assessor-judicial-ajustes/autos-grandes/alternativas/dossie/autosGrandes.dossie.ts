// AUTOS GRANDES (chaves gratuitas): quando o pedido da Etapa 1 passa do limite de entrada da cota gratuita do Google
// (erro 429 "generate_content_free_tier_input_token_count", hoje 250 mil tokens), os autos são lidos em PARTES,
// cada parte vira um dossiê fático-probatório fiel, e a Etapa 1 roda uma vez sobre o dossiê consolidado.
// Nada é cortado dos autos: todas as partes são lidas integralmente.
// Este arquivo não importa nada do servidor: as funções do servidor entram por parâmetro.

export const CHARS_POR_TOKEN = 3.2;
export const LIMITE_ENTRADA_PADRAO = 250000;
const FRACAO_POR_PARTE = 0.6;            // cada parte usa, no máximo, 60% do limite (sobra para instruções e margem de estimativa)
const MIN_CHARS_AUTOS_GRANDES = 60000;   // abaixo disso o texto não é tratado como "autos grandes"

export const ehErroEntradaGrande = (e: any) => !!e && (e.codigo === "ENTRADA_GRANDE_GRATUITA" || String(e?.message || "").includes("free_tier_input_token_count"));

export function limiteDoErro(e: any): number {
    const m = String(e?.detalhe || e?.message || "").match(/limit:\s*(\d{4,9})/i);
    return m ? Number(m[1]) : (Number(e?.limite) || LIMITE_ENTRADA_PADRAO);
}

// Divide o texto em partes de até maxChars, preferindo cortar em início de página "[Página N de M]", depois em parágrafo, depois em linha.
export function dividirTextoEmPartes(texto: string, maxChars: number): string[] {
    const partes: string[] = [];
    let resto = texto;
    while (resto.length > maxChars) {
        const janelaIni = Math.floor(maxChars * 0.7);
        const janela = resto.slice(janelaIni, maxChars);
        let corte = -1;
        const reg = /\n\[Página \d+ de \d+\]/g;
        let m: RegExpExecArray | null;
        while ((m = reg.exec(janela))) corte = janelaIni + m.index + 1;
        if (corte < 0) { const p = janela.lastIndexOf("\n\n"); if (p >= 0) corte = janelaIni + p + 2; }
        if (corte < 0) { const p = janela.lastIndexOf("\n"); if (p >= 0) corte = janelaIni + p + 1; }
        if (corte < 0) corte = maxChars;
        partes.push(resto.slice(0, corte));
        resto = resto.slice(corte);
    }
    if (resto.trim().length > 0) partes.push(resto);
    return partes;
}

const paginasDe = (t: string): string => {
    const nums = Array.from(t.matchAll(/\[Página (\d+) de (\d+)\]/g)).map(x => Number(x[1]));
    return nums.length ? `páginas ${Math.min(...nums)} a ${Math.max(...nums)}` : "";
};

const SISTEMA_PARTE = `Você é assessor fático-processual de um gabinete judicial brasileiro (TJGO). Você recebe UMA PARTE de autos muito extensos, que foram divididos em partes sequenciais porque não cabem de uma vez no limite da API.
Sua tarefa é produzir o DOSSIÊ FÁTICO-PROBATÓRIO DESTA PARTE, que substituirá o texto original na análise final. O dossiê precisa permitir redigir relatório e fundamentação sem reler os autos.

REGRAS:
1. Siga a ordem cronológica dos movimentos. Para cada movimento, petição, decisão, certidão, laudo ou documento relevante, registre: o que é, quem praticou, data, e o conteúdo essencial, SEMPRE com a localização "(Mov. X, Arq. Y, Pág. Z)" conforme os marcadores presentes no texto.
2. TRANSCREVA LITERALMENTE, entre aspas, os trechos decisivos: pedidos, causa de pedir, dispositivos de decisões e sentenças, conclusões de laudos, cláusulas contratuais, certidões de citação/intimação/decurso de prazo, manifestações do Ministério Público, cálculos e valores.
3. Preserve exatamente nomes, números de processo, datas, valores, percentuais e prazos. Não arredonde nem corrija.
4. NÃO invente, NÃO infira, NÃO conclua, NÃO julgue o mérito e NÃO sugira decisão. Registre apenas o que está no texto. Se algo estiver ilegível ou ausente, diga isso expressamente.
5. Registre ao final desta parte: (a) pendências e requerimentos ainda sem decisão; (b) prazos em curso e atos determinados e não cumpridos; (c) a situação em que esta parte termina.
6. Seja tão extenso quanto necessário para não perder nenhum fato relevante, sem repetir texto irrelevante (cabeçalhos, assinaturas, repetições de certidões burocráticas).
Responda em texto corrido organizado por tópicos, sem JSON.`;

export type OpcoesGerar = Record<string, any>;
export type FuncGerar = (opts: OpcoesGerar) => Promise<any>;

export interface DadosAutosGrandes {
    userPrompt: string;          // o prompt completo da Etapa 1 (com os autos dentro)
    textos: string[];            // os textos de autos que estão dentro de userPrompt (ex.: [accumulatedPdfText, safeProcessText])
    partesRef?: any[];           // array de partes da Etapa 1: a posição 0 será trocada pelo prompt reduzido (para a expansão do portão de profundidade)
}

export function localizarAutos(userPrompt: string, textos: string[]): { principal: string; extras: string[] } | null {
    const grandes = textos.filter(t => typeof t === "string" && t.length >= MIN_CHARS_AUTOS_GRANDES && userPrompt.includes(t)).sort((a, b) => b.length - a.length);
    if (!grandes.length) return null;
    const principal = grandes[0];
    const extras = grandes.slice(1).filter(t => !principal.includes(t));
    return { principal, extras };
}

export async function montarDossie(a: {
    gerar: FuncGerar;
    baseOpcoes: OpcoesGerar;     // keyPool, apiKey, isNativeAllowed, res...
    autos: string;
    limite: number;
    pausaMs?: number;            // espera entre tentativas por cota (padrão 62 s: a janela do Google é de 1 minuto)
    log?: (m: string) => void;
}): Promise<{ memos: string[]; partes: number }> {
    const log = a.log || (() => {});
    const pausa = a.pausaMs ?? Number(process.env.AUTOS_GRANDES_PAUSA_MS || 62000);
    const maxChars = Math.max(60000, Math.floor(a.limite * FRACAO_POR_PARTE * CHARS_POR_TOKEN));
    // partes de tamanho parecido (em vez de 150 mil + 150 mil + o que sobrar): duas partes menores cabem na mesma janela de 1 minuto do mesmo modelo
    const nPartes = Math.max(1, Math.ceil(a.autos.length / maxChars));
    const alvoChars = Math.min(maxChars, Math.ceil((a.autos.length / nPartes) * 1.08));
    const partes = dividirTextoEmPartes(a.autos, alvoChars);
    log(`[Autos Grandes] ${a.autos.length} caracteres (~${Math.round(a.autos.length / CHARS_POR_TOKEN / 1000)} mil tokens) divididos em ${partes.length} parte(s) de até ~${Math.round(alvoChars / CHARS_POR_TOKEN / 1000)} mil tokens.`);
    const memos: string[] = [];
    for (let i = 0; i < partes.length; i++) {
        const pag = paginasDe(partes[i]);
        const instrucao = `PARTE ${i + 1} DE ${partes.length} DOS AUTOS${pag ? ` (${pag})` : ""}. ${i > 0 ? "As partes anteriores já foram extraídas em dossiês próprios; não repita o que não esteja nesta parte. " : ""}${i < partes.length - 1 ? "Os autos continuam na parte seguinte; não conclua a análise." : "Esta é a última parte dos autos."}\n\nTEXTO DESTA PARTE:\n"""\n${partes[i]}\n"""`;
        let memo = "";
        for (let tent = 1; tent <= 4 && !memo; tent++) {
            try {
                const resp: any = await a.gerar({
                    ...a.baseOpcoes,
                    primaryModel: "gemini-3.6-flash",
                    fallbackModel: "gemini-3.8-flash",
                    // tentativas 1 a 3: só modelos profundos (se a janela de cota estiver cheia, espera e repete); a última aceita todos
                    customModelQueue: tent < 4 ? ["gemini-3.6-flash", "gemini-3.8-flash"] : ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"],
                    maxCycles: 1,
                    timeoutMs: 240000,
                    contents: [{ role: "user", parts: [{ text: instrucao }] }],
                    config: { systemInstruction: SISTEMA_PARTE, temperature: 0.0, maxOutputTokens: 24000 }
                });
                memo = String(resp?.text || "").trim();
                if (memo.length < 200) memo = "";      // resposta vazia/curta demais: tenta de novo
            } catch (e: any) {
                if (ehErroEntradaGrande(e)) throw e;  // a parte sozinha não cabe: não adianta repetir
                log(`[Autos Grandes] Parte ${i + 1}/${partes.length}, tentativa ${tent}: ${String(e?.message || e).slice(0, 160)}`);
            }
            if (!memo && tent < 4) {
                log(`[Autos Grandes] Aguardando ${Math.round(pausa / 1000)}s para a cota por minuto se renovar (parte ${i + 1}/${partes.length}).`);
                await new Promise(r => setTimeout(r, pausa));
            }
        }
        if (!memo) throw new Error(`Não foi possível extrair a parte ${i + 1} de ${partes.length} dos autos grandes (cota ou indisponibilidade da IA). Tente novamente em alguns minutos.`);
        memos.push(`### PARTE ${i + 1} DE ${partes.length}${pag ? ` — ${pag}` : ""}\n${memo}`);
        log(`[Autos Grandes] Parte ${i + 1}/${partes.length} extraída (${memo.length} caracteres).`);
    }
    return { memos, partes: partes.length };
}

export function reduzirPrompt(userPrompt: string, localizados: { principal: string; extras: string[] }, memos: string[], totalChars: number): string {
    const dossie = `[DOSSIÊ FÁTICO-PROBATÓRIO CONSOLIDADO DOS AUTOS INTEGRAIS]
Os autos integrais (~${Math.round(totalChars / CHARS_POR_TOKEN / 1000)} mil tokens) excedem o limite de entrada da API gratuita. Foram lidos integralmente em ${memos.length} partes sequenciais e extraídos fielmente abaixo, com as localizações (Mov./Arq./Pág.) e as transcrições literais. Trate este dossiê como o conteúdo integral dos autos: cite as localizações nele registradas e não invente nada além do que ele traz.

${memos.join("\n\n")}`;
    let out = userPrompt.split(localizados.principal).join(dossie);
    for (const x of localizados.extras) out = out.split(x).join("(conteúdo consolidado no dossiê acima)");
    return out;
}

// Envolve a geração da Etapa 1: tenta normalmente; se o Google recusar por limite de entrada da cota gratuita, usa os autos grandes.
export async function gerarComAutosGrandes(
    gerar: FuncGerar,
    opts: OpcoesGerar & { autosGrandes?: DadosAutosGrandes },
    ganchos: { log?: (m: string) => void; pausaMs?: number } = {}
): Promise<any> {
    const { autosGrandes, ...resto } = opts;
    try {
        return await gerar(resto);
    } catch (e: any) {
        if (!autosGrandes || !ehErroEntradaGrande(e)) throw e;
        const log = ganchos.log || ((m: string) => console.log(m));
        const loc = localizarAutos(autosGrandes.userPrompt, autosGrandes.textos);
        if (!loc) throw e;
        log(`[Autos Grandes] O Google recusou o pedido pelo limite de entrada gratuito (${limiteDoErro(e)} tokens). Lendo os autos em partes...`);
        const { memos } = await montarDossie({
            gerar, baseOpcoes: { apiKey: resto.apiKey, keyPool: resto.keyPool, isNativeAllowed: resto.isNativeAllowed, res: resto.res },
            autos: loc.principal + (loc.extras.length ? "\n\n" + loc.extras.join("\n\n") : ""),
            limite: limiteDoErro(e), pausaMs: ganchos.pausaMs, log
        });
        const reduzido = reduzirPrompt(autosGrandes.userPrompt, loc, memos, loc.principal.length + loc.extras.reduce((n, x) => n + x.length, 0));
        const contents = JSON.parse(JSON.stringify(resto.contents || []));
        if (contents[0]?.parts?.[0]) contents[0].parts[0] = { text: reduzido };
        if (Array.isArray(autosGrandes.partesRef) && autosGrandes.partesRef.length > 0) autosGrandes.partesRef[0] = { text: reduzido };
        log(`[Autos Grandes] Dossiê pronto (${memos.length} partes). Executando a Etapa 1 sobre o dossiê...`);
        return await gerar({ ...resto, contents });
    }
}
