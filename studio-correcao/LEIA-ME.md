# Correção: processos auditados sumindo na Lupa do Magistrado

Dois arquivos do Assessor Judicial alterados (copie por cima dos originais, mesmos caminhos):

- `src/utils/auditDb.ts` — `subscribeToAudits` agora JUNTA a lista da nuvem com a do navegador (por id) em vez de substituir tudo.
- `src/lib/firestoreUtils.ts` — `saveAuditToDb` corta `processText`/`assessorDraft`/`previousDraft` acima de 200 mil caracteres na cópia da nuvem (limite do Firestore: 1 MiB por documento). A cópia completa fica no navegador.

## Lupa mais rápida (`server.ts`, base: assessor-judicial-fabr_cio_5)
- Linha 1439 (`/api/audit-assessor-draft`): `primaryModel` de `gemini-3.8-flash` para `gemini-3.1-flash-lite`. O restante do arquivo é o mesmo da versão fabr_cio_5. Se você já alterou o `server.ts` depois, aplique só essa troca de uma linha.
- Linhas 624–625 (`/api/chat-agaia`, o chat/refino da minuta, "Assistente do Fabricio"): `primaryModel` para `gemini-3.1-flash-lite` e `fallbackModel` para `gemini-flash-latest` (antes 3.8 e 3.7).
- O Copiloto lateral (`/api/lateral-agent-chat`, linha ~772) já usava `gemini-3.1-flash-lite`; não foi alterado.
- Reserva no 3.8: linha 625 (chat da minuta) e linha 1440 (Lupa) com `fallbackModel: "gemini-3.8-flash"`; se o 3.1 falhar, tenta o 3.8 e depois o restante da esteira (3.7, 3.6, 3.5, latest, lite).
- Chat da minuta (linha 626, nova): `customModelQueue: ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-latest"]` — principal 3.1 e duas reservas (3.8 e 3.7), com o latest como último recurso. Com `customModelQueue` o servidor usa só essa fila (ignora primaryModel/fallbackModel).
- Copiloto lateral: o rótulo "Gemini 3.8 Flash" do cabeçalho (`src/components/LateralAgentDrawer.tsx`, linha 472) era texto fixo; o modelo real da rota já era o 3.1. Rótulo trocado para "Gemini 3.1 Flash-Lite", e o rótulo padrão de `modelUsed` no `server.ts` (rota `/api/lateral-agent-chat`) também.
- Esteira principal (`/api/generate-minute`): etapa 1 (linha 4482) e etapa 2 (linha ~5057) com `customModelQueue: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]` — profundidade primeiro, reservas mais rápidas depois. Para priorizar velocidade, ponha `gemini-3.1-flash-lite` no início do array.

## server.ts COMPLETO reescrito (substitui o seu) — somente modelos Flash
Base: assessor-judicial-fabr_cio_5 + todas as alterações combinadas. Principais mudanças:
- Controle de consumo por chave e por modelo (`TPM_POR_MODELO`, `prepararChaves`, `registrarUso`, `cotaAte`): usa a chave com mais folga, lembra 429 (com o retryDelay do Google) e só espera se nenhuma chave tem folga. Conta também tentativas que estouraram o tempo.
- Etapas 1 e 2: fila 3.8 → 3.7 → 3.6 → 3.5 → 3.1 Lite → latest, `timeoutMs` proporcional ao tamanho do prompt (60 s + 1 s por 10 mil tokens, máx. 300 s), `maxCycles: 2`.
- Sem espera fixa entre etapas (etapa 2 após "Prosseguir" não espera; com várias chaves também não).
- Etapa 2 recebe começo e fim dos autos (antes só os 10 mil caracteres iniciais).
- Fecho da etapa 1 usa a comarca da unidade (não mais "Mineiros").
- Chat da minuta: 3.1 → 3.8 → 3.7 → latest, `timeoutMs: 45000`, `maxCycles: 1`. Lupa: 3.1 → 3.8 → 3.7 → latest, `timeoutMs: 120000`, `maxCycles: 2` (para priorizar rigor, ponha 3.8 em 1º no `customModelQueue` da Lupa).
- Padrão geral (Mesa de Audiências, Mutirão): 3.1 primeiro, depois 3.8, 3.7, 3.6, 3.5, latest, lite.
- Grounding com 3.1 Lite. Rótulos mostram o modelo realmente usado (`usedModel`).
- Ajuste os limites de `TPM_POR_MODELO` ao painel de cada projeto (valores atuais: Flash 3M/min, Lite 10M/min; margem de 15%). Para chaves gratuitas com limite menor, defina `FREE_TPM_LIMIT` no ambiente (vale só para modelos fora da tabela) ou reduza a tabela.
