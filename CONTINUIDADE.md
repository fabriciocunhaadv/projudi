# Continuidade do desenvolvimento — Extensão "Conclusões Projudi" + Studio "Assessor Judicial"

> Documento para abrir uma conversa nova e retomar o trabalho. Diga à IA: "leia CONTINUIDADE.md e continue". Atualize-o ao fim de cada etapa.

## Quem e como
- Usuário: advogado/magistrado (Montes Claros de Goiás). Falar em **português simples**, sem jargão.
- Regras: pedir autorização antes de mexer no monitor/erros e em mudanças grandes; desfazer o que ele não gostar; **não** contornar proteção anti-bot (Planalto/Cloudflare); **não** usar LexNode (usa Grounding do Gemini); vídeos de uso ficam em outra conversa.

## Repositórios
1. **Extensão** (este repo, branch `claude/determined-bardeen-xtc9lq`, pasta `extensao/`). Pacote da loja: `python3 empacotar.py` → `publicacao/projudi-extensao-<versão>.zip` (o usuário envia à Chrome Web Store; versão atual **1.0.95**; sempre aumentar `version`).
2. **Studio** `fabriciocunhaadv/assessor-judicial-mysql` (React+Vite+TS, Express, MySQL Hostinger, Gemini). Deploy a partir da `main`. Local: `/home/user/assessor-judicial-mysql`.

## Pontes extensão ↔ Studio
Atributos em `document.documentElement.dataset.*` + eventos (`projudi:leis-pedido`, `projudi:lei-entrega`, `projudi:fonte-entrega`, `projudi:teste-entrega`, `projudi:saude`, `projudi:pedir-prompt`/`projudi:prompt-resposta`, `assessor:cadastrar-minuta`). Script `extensao/studio-base.js` roda na aba do Studio; `studio-cliente.js` fala com ele (`cadastrarNoStudio`, `lerPromptDoStudio`, `analisarNoStudio`).

## Esteira (extensao/esteira.js)
Itens com `modo`: `analise|lupa|turbo|mesa|agaia|ia`. Fluxo: baixar PDF com OCR → fila → motor. Minuta externa (Agaia/IA) entra no Histórico do Studio com selo da origem (`origemExterna`).

## Feito nesta fase (tudo publicado, salvo o último item)
Reenvio de análise guardada; monitor **Saúde** (retenção 30 dias, avisos 7/3/1, limpeza); busca de leis do Planalto e teste de acesso pelo navegador (permissões opcionais); Grounding na 1ª etapa com selo; **Fontes pendentes** (global, só Super Admin); layout de Súmulas/Teses/Informativos e Central de fontes; banco resiliente (keepAlive/retry).
**IA externa (plano B, v1.0.91)**: modo `ia` — a extensão abre ChatGPT / Gemini / Claude / IA do Jusbrasil, anexa o PDF (com OCR), cola o prompt do Studio, espera a minuta e lança no Histórico. Arquivos: `ia-agente.js` (roda na aba da IA; perfis + heurísticas), `ia-externa-cliente.js` (orquestra), integração em `esteira.js`, `painel.js` (radio "IA externa", botões *Autorizar este site* e *Diagnosticar tela da IA*), `manifest.json` (optional hosts). Studio: `src/App.tsx` (ponte do prompt), `minutaExterna.ts`, `HistoryModal.tsx`. Teste: `tests/e2e_ia_agente.py` (páginas simuladas).

**Central de decisões (Super Admin, aba "Central")**: lista priorizada do que precisa de atenção (alertas da Saúde, erros novos/reincidentes, fontes pendentes, aviso de limpeza) + erros agrupados com status (novo/investigando/resolvido/ignorado; resolvido que volta = reincidente) e nota; botão que copia o pedido para o Claude; "Dispensar 7 dias". Só LÊ os registros existentes; **não altera nenhum motor**. Tabela própria `central_estado`, limpa em 30 dias junto com a Saúde (`aoLimparSaude`). Código Studio: `server/centralDecisoes.ts`, `src/utils/centralRegras.ts`, `src/components/CentralDecisoesPanel.tsx`; testes `testes/teste_central_regras.ts`, `testes/servidor/rodar_central.mjs`, `testes/teste_central_painel.py`.
**Aba "Calibragem" (Super Admin, só leitura; extensão 1.0.92)**: sub-abas *Motores* (pedidos, erros, cota/sobrecarga, tempo, tamanho dos autos, tokens, custo, modelos por motor; tabela `motor_metricas` alimentada por `server/motoresMetricas.ts`, que só mede DEPOIS da resposta), *Gabinetes* (ficha: usuários, minutas/semana, motores, chaves, última atividade, erros, avisos de abandono) e *Extensão* (versão por usuário via `data-assessor-extensao` → evento `extensao/presenca`; sucesso por IA externa via eventos `ia-externa` enviados pela esteira; erros da extensão). Rotas `/api/central/{motores,gabinetes,extensao}`; regras puras em `src/utils/calibragemRegras.ts`; testes `testes/teste_calibragem_regras.ts`, `testes/teste_calibragem_painel.py` e `testes/servidor/rodar_central.mjs`. O usuário **NÃO quer** painel de limites ajustáveis nem regras automáticas (decisão dele).
**Roteiro do painel (aprovado em partes)**: feito = Central + erros agrupados. Feito também: calibragem por motor, ficha do gabinete, aba da extensão. NÃO fazer (recusado): painel de limites ajustáveis e regras automáticas. Possível futuro: qualidade das minutas (👍/👎 do usuário). O usuário disse: *sem automação por enquanto* e quer entender antes o que mudaria no comportamento do sistema (explicar quando perguntar).

**Teste real do Jusbrasil (usuário, 09/11)**: anexar, colar prompt e enviar funcionaram; a minuta vem num PAINEL LATERAL ("Criou Peça"), então o agente leu só o aviso do chat. Corrigido na 1.0.93 (`painelDocumento()` em `ia-agente.js`, limpeza de rótulos de botões, recusa de texto < 400 caracteres). ChatGPT/Gemini/Claude ainda sem teste real.

**Testes reais (09/11)**: Claude = funcionou (mas as partes saíam erradas: corrigido no Studio, `pegarParte` só aceita linha que começa pelo rótulo); Gemini = faltou achar o botão de anexar; ChatGPT = erro (mensagem não vista). 1.0.94: anexar PDF por 4 estratégias com verificação (campo de arquivo → colar na caixa → arrastar/soltar → botão "+"), erros com a etapa entre colchetes. **Pedir ao usuário a mensagem exata do erro** se ChatGPT/Gemini ainda falharem.
**Super Admin (layout)**: `src/components/SuperAdminNav.tsx` = menu lateral agrupado (Visão geral / Acompanhamento / Cadastros / Sistema), seletor com grupos no celular; abre na Central. Teste: `testes/teste_superadmin_layout.py`.

**Jusbrasil (2º teste real, 09/11)**: o agente capturou o PRÓPRIO prompt enviado (eco). 1.0.95: `eco()` descarta qualquer texto que contenha a mensagem enviada; perfil `painel: true` (Jusbrasil) espera o documento do painel lateral (`esperarPainel`), nunca o chat.
**Ideia em análise (NÃO autorizada ainda): acompanhar a fila pelo celular** — página "Minha fila" (PWA), notificações, chamado com print/texto/PDF, comandos pelo celular. Decisões do usuário: **sem áudio transcrito** (não gastar cota; o chamado é só digitado, com print e PDF); dúvida dele: e quem não usa Telegram? (resposta: Telegram é opcional; o canal principal é o PWA/e-mail; ver conversa). Só implementar após autorização explícita.

## Pendências / atenção
- **IA externa NÃO foi validada nos sites reais** (só em páginas simuladas). Os sites mudam: usar "Diagnosticar tela da IA" no painel e ajustar os perfis em `ia-agente.js`. Pode haver captcha/login; termos de uso das IAs podem restringir automação.
- Enviar o pacote 1.0.91 à Chrome Web Store (o usuário faz).
- Conferir em produção: busca nos sites reais (Planalto/TJGO/Câmara municipal), SQL da Saúde/limpeza no MySQL real, retomada dos Gigantes, efeito do keepAlive/retry.

## Testes
Playwright Python (`/usr/bin/python3`, chromium `/opt/pw-browsers/chromium`, `--no-sandbox`); `tests/e2e_*.py` (extensão), Studio em `testes/`. Cuidado: `lambda r, x=y` em `page.route` quebra (Playwright conta argumentos).
