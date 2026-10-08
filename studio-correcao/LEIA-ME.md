# Correção: processos auditados sumindo na Lupa do Magistrado

Dois arquivos do Assessor Judicial alterados (copie por cima dos originais, mesmos caminhos):

- `src/utils/auditDb.ts` — `subscribeToAudits` agora JUNTA a lista da nuvem com a do navegador (por id) em vez de substituir tudo.
- `src/lib/firestoreUtils.ts` — `saveAuditToDb` corta `processText`/`assessorDraft`/`previousDraft` acima de 200 mil caracteres na cópia da nuvem (limite do Firestore: 1 MiB por documento). A cópia completa fica no navegador.

## Lupa mais rápida (`server.ts`, base: assessor-judicial-fabr_cio_5)
- Linha 1439 (`/api/audit-assessor-draft`): `primaryModel` de `gemini-3.8-flash` para `gemini-3.1-flash-lite`. O restante do arquivo é o mesmo da versão fabr_cio_5. Se você já alterou o `server.ts` depois, aplique só essa troca de uma linha.
