# Correção: processos auditados sumindo na Lupa do Magistrado

Dois arquivos do Assessor Judicial alterados (copie por cima dos originais, mesmos caminhos):

- `src/utils/auditDb.ts` — `subscribeToAudits` agora JUNTA a lista da nuvem com a do navegador (por id) em vez de substituir tudo.
- `src/lib/firestoreUtils.ts` — `saveAuditToDb` corta `processText`/`assessorDraft`/`previousDraft` acima de 200 mil caracteres na cópia da nuvem (limite do Firestore: 1 MiB por documento). A cópia completa fica no navegador.
