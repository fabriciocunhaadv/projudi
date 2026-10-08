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
