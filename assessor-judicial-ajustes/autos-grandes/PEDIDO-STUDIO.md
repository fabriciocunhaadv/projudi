# Autos grandes com chave gratuita — pedido para o Studio (2 passos)

O que faz: quando o Google recusar um pedido da Etapa 1 por passar do limite de ENTRADA gratuito (250 mil tokens, erro `free_tier_input_token_count`), o servidor lê os autos em partes (cada uma abaixo do limite), monta um dossiê fático-probatório e roda a Etapa 1 sobre o dossiê. Nada dos autos é cortado. Para chave paga ou para processos pequenos, nada muda: o caminho normal continua igual.

Testado contra um servidor Google simulado (limite 250 mil por minuto e por modelo): processo pequeno (1 chamada), processo grande como texto, processo grande como PDF, e um cenário de cota apertada com esperas. Em todos, os 4 fatos plantados (início, meio, laudo e final dos autos) chegaram à minuta.

## PASSO 1 — criar o arquivo novo (cole no Studio)

> Crie um arquivo NOVO em `src/utils/autosGrandes.ts` com EXATAMENTE o conteúdo abaixo, sem alterar uma vírgula, sem resumir e sem mexer em nenhum outro arquivo neste passo. (cole aqui o conteúdo completo do arquivo `autosGrandes.ts` desta pasta)

## PASSO 2 — 3 edições pequenas no server.ts (cole no Studio, só depois do passo 1 concluído)

> No `server.ts`, faça APENAS estas 3 edições pontuais. Não altere nenhuma outra linha, não reescreva nem resuma o arquivo; devolva-o inteiro e completo.
>
> 1) Logo abaixo da linha `import { extractFromCoverPage } from './src/utils/judicialMetadataExtractor';` acrescente a linha:
> `import { gerarComAutosGrandes } from './src/utils/autosGrandes';`
>
> 2) Dentro da função `generateWithFallbackAndRetry`, no bloco `catch`, imediatamente ANTES do comentário `// Se for erro de cota / rate limit (429):` e do `if (isQuotaError) {` que o segue, acrescente exatamente este bloco:
> ```
>                     // Pedido maior que o limite de ENTRADA da cota gratuita do Google: nenhuma chave nem modelo gratuito aceita; interrompe já (sem rodar o pool inteiro)
>                     // (só quando o próprio pedido passa do limite; se for apenas a janela do minuto cheia, segue o rodízio normal)
>                     const limEntradaGratuita = Number(errMsg.match(/limit:\s*(\d{4,9})/i)?.[1] || 250000);
>                     if (isQuotaError && errMsg.includes("free_tier_input_token_count") && estTokensChamada > limEntradaGratuita * 0.95) {
>                         const erEntrada: any = new Error(`Este pedido tem cerca de ${Math.round(estTokensChamada / 1000)} mil tokens e a cota gratuita do Google aceita no máximo ${Math.round(limEntradaGratuita / 1000)} mil tokens de entrada. Use uma chave com faturamento ativado ou reduza os autos (free_tier_input_token_count).`);
>                         erEntrada.codigo = "ENTRADA_GRANDE_GRATUITA";
>                         erEntrada.detalhe = errMsg.slice(0, 600);
>                         throw erEntrada;
>                     }
> ```
>
> 3) Na rota `/api/generate-minute`, na chamada da ETAPA 1 (logo depois de `console.log("[Assessor Judicial] Disparando ETAPA 1: Assessor Fático ...")`), troque APENAS a primeira linha da chamada:
> `stage1Response = await generateWithFallbackAndRetry({`
> por estas DUAS linhas:
> ```
>     stage1Response = await gerarComAutosGrandes(generateWithFallbackAndRetry, {
>         autosGrandes: { userPrompt, textos: [accumulatedPdfText, safeProcessText], partesRef: stage1ContentsParts },
> ```
> Todo o restante da chamada (apiKey, keyPool, modelos, config e o `});` final) permanece exatamente igual.

Depois de publicar, me avise: confiro no git se o `server.ts` veio completo (5881 linhas + 11) e se o diff é igual ao `server.ts.diff` desta pasta.
