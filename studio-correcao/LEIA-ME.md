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

## Cota do localStorage estourando (logs `[safeStorage] Storage quota reached`)
Causa: `saveLocalHistory` gravava até 50 análises COMPLETAS (com auditoria, sinopse e textos) numa única chave; `getHistory` roda a cada 10 s (App.tsx) e relê o Firestore inteiro e tenta regravar sempre. O mesmo estouro derruba o rascunho da sessão e já havia derrubado as auditorias da Lupa no navegador.
Arquivos (copie por cima, mesmos caminhos):
- `src/utils/historyDb.ts`: cache local enxuto (20 itens, sem auditoria/sinopse/textos dos autos, teto de ~0,9 MB), não regrava se nada mudou e, se estourar, para por 5 minutos (o Firestore continua sendo a fonte da verdade).
- `src/utils/safeStorage.ts`: avisos no console no máximo 1 vez por minuto por chave; ao estourar a cota, também limpa os caches de histórico (reconstruíveis).
- `src/utils/sessionDraft.ts`: rascunho com teto de 400 mil caracteres; se não couber, remove o antigo em vez de ficar falhando.
- `server.ts`: `history.json` do servidor limitado a 300 análises (era 1000, lido/gravado inteiro a cada análise).
Mudança manual em `src/App.tsx` (linha ~381): `const timer = setInterval(fetchHistory, 10000);` → `const timer = setInterval(fetchHistory, 60000);` (cada leitura do histórico é uma leitura completa do Firestore).
Limpeza imediata no navegador (F12 → Console) — só o cache do histórico, que o Firestore reconstrói:
`Object.keys(localStorage).filter(k=>k.startsWith('assessor_fabricio_history_cache_')).forEach(k=>localStorage.removeItem(k))`

## Menos navegador, mais Firestore (histórico)
- `src/lib/firebase.ts`: o Firestore passa a usar cache persistente próprio (IndexedDB, sem o limite de ~5 MB do localStorage) com várias abas (`persistentLocalCache` + `persistentMultipleTabManager`). Se o navegador não suportar, cai no `getFirestore` de antes.
- `src/utils/historyDb.ts`: com usuário logado, o histórico NÃO é mais gravado no localStorage (só sem login). Substitui a versão anterior deste arquivo.
- `src/lib/firestoreUtils.ts`: `getHistoryFromDb` lê só as 200 análises mais recentes de cada coleção (`orderBy('date','desc')`, `limit(200)`), em vez da coleção inteira a cada consulta (antes: a cada 10 s, até 4 coleções). Análises antigas sem o campo `date` ficam de fora da lista.
- Continua valendo: trocar o `setInterval(fetchHistory, 10000)` do `App.tsx` por 60000 (ou usar `onSnapshot`).

## Correção: Etapa 1 demorando (503 em cascata)
No log, cada modelo testava as 6 chaves (~15–50 s cada) antes de passar ao próximo, gastando 4+ min.
O 503 ("alta demanda") é do **modelo**, não da chave. Agora (`generateWithFallbackAndRetry`):
- 503/timeout: tenta no máximo **2 chaves** por modelo e passa ao próximo;
- o modelo sobrecarregado fica em **resfriamento (45–60 s)** para todas as chamadas seguintes (pulado direto);
- modelo com 429 em todas as chaves também é pulado enquanto durar a cota;
- pausas entre chaves/modelos reduzidas (0,3–0,5 s). Contexto do processo continua integral.

## Correção: papéis da Etapa 1 e da Etapa 2
- **Etapa 1** recebe tudo o que é do gabinete: prompt temático, Caderno de Teses, Base de Conhecimento, taxonomia e Minuta Paradigma (vinculada pelo usuário no lançamento). É ela quem decide o tipo de ato (inclusive embargos).
- **Etapa 2** só revisa: confronto com os autos, auditoria forense, súmulas/precedentes (+ grounding), coerência com a cadeia decisória e preclusão. Não recebe mais teses, paradigma, base de conhecimento nem o prompt temático (que a levava a "forçar" embargos).
- O tipo de ato da Etapa 2 passa a ser o `actType` entregue pela Etapa 1 (log: "Etapa 2 segue o tipo de ato entregue pela Etapa 1").
- Despacho na Etapa 2 não sai mais curto (4 a 8 parágrafos motivados).

## Saúde dos modelos + rascunho
- Modelo que falha em sequência (503/timeout/429 em todas as chaves) fica em resfriamento crescente (45 s → 90 s → 3 min → 6 min → 10 min) e é pulado nas próximas análises; volta ao normal no primeiro sucesso. Com isso 3.8/3.7/3.6 deixam de gastar ~1–2 min por etapa quando estão indisponíveis para suas chaves.
- "Cumprimento de Sentença" na questão pendente não classifica mais o ato como sentença.
- `sessionDraft.ts`: ao estourar o localStorage, limpa caches dispensáveis e salva um rascunho mínimo (sem o texto dos autos).
