# Textos para preencher na Chrome Web Store

## Aba "Listagem da loja"
**Nome:** Conclusões Projudi
**Resumo (até 132 caracteres):**
Para assessores do TJGO: acompanha conclusões, baixa PDFs com OCR e organiza as minutas do Studio ao Projudi.
**Categoria:** Produtividade  **Idioma:** Português (Brasil)

**Descrição detalhada:**
Ferramenta de apoio ao trabalho de assessores e magistrados do TJGO no Projudi. Roda no seu navegador, com a sua sessão já aberta no Projudi.

O que faz:
• Acompanha as conclusões não analisadas e pré-analisadas de cada serventia, na ordem de trabalho (urgência, prioridade do classificador e antiguidade).
• Baixa o PDF completo dos processos (o mesmo que o Projudi gera) e aplica OCR nas páginas em imagem, para o texto ficar pesquisável. Salva como "número-OCR.pdf".
• Lê os modelos de decisão, despacho e sentença cadastrados no Projudi e monta um PDF por vara.
• Fila de minutas (opcional, a pedido do usuário): envia o PDF do processo ao app Assessor Judicial (judicial-mysql.assessor.net.br, do mesmo desenvolvedor), abre um documento em branco do Google Docs ao lado do PDF para conferência e lança o texto no editor do Projudi com a sua formatação.
• Formatação do editor de minutas: botão "Formatar seleção" e aprendizado do seu padrão de texto e citação.

Privacidade: a extensão não tem anúncios, rastreamento nem análise de uso. O download dos PDFs e o OCR são feitos no seu navegador. Quando você aciona o envio ao app Assessor Judicial, o PDF/texto do processo é transmitido ao servidor desse app (do desenvolvedor), que o processa com IA (Google Gemini) e guarda o resultado na sua conta e no seu gabinete, por prazo limitado. Nada é vendido nem compartilhado com terceiros além desse processamento. Detalhes na política de privacidade, no link informado na loja.

Requer acesso ao Projudi (TJGO) e, para as minutas, uma conta no app Assessor Judicial. Não é um produto oficial do TJGO.

## Imagens (pasta `publicacao/loja/`)
- Captura de tela 1: `print-1-painel.png` (1280×800) — resumo por serventia
- Captura de tela 2: `print-2-baixar-pdfs.png` — seleção dos processos e opções
- Captura de tela 3: `print-3-esteira.png` — esteira de minutas
- Captura de tela 4: `print-4-modelos.png` — modelos do Projudi
- Imagem promocional pequena (440×280): `promo-pequeno-440x280.png`
- Ícone 128×128: já está no pacote (`icone.png`); na loja, envie o mesmo arquivo `extensao/icone.png`.
Todas usam dados fictícios (comarca "Exemplo", processos inventados).

## Aba "Práticas de privacidade"
**Finalidade única:** Auxiliar assessores e magistrados do TJGO no trabalho com o Projudi: acompanhar conclusões, baixar PDFs de processos com OCR e organizar a minuta do app Assessor Judicial até o lançamento no editor do Projudi.

**Justificativa das permissões:**
- **activeTab:** capturar, a pedido do usuário, o HTML da tela atual para diagnóstico.
- **downloads:** salvar na pasta de Downloads os PDFs dos processos (número-OCR.pdf).
- **notifications:** avisar o usuário sobre conclusões novas e quando a minuta está pronta.
- **offscreen:** ler a página de conclusões do Projudi em segundo plano.
- **scripting:** executar, na aba do Projudi e do app Assessor Judicial, os passos pedidos pelo usuário (abrir o processo, gerar o PDF, ler a minuta).
- **storage / unlimitedStorage:** guardar configurações, a fila de processos e as minutas no computador do usuário.
- **clipboardWrite:** copiar para a área de transferência a minuta e o diagnóstico, a pedido do usuário.
- **power:** impedir que o computador entre em suspensão enquanto a extensão processa em segundo plano um lote de processos (download dos PDFs e OCR, que levam vários minutos). Só mantém o computador acordado durante o processamento e libera assim que termina; nenhum dado é coletado por essa permissão.
- **Acesso a sites:** *.tjgo.jus.br (Projudi: ler conclusões, gerar PDF, editor de minutas); judicial-mysql.assessor.net.br (app Assessor Judicial: enviar o PDF do processo e ler a minuta gerada, a pedido do usuário); docs.google.com/document/* (mostrar a barra de apoio no documento da minuta aberto ao lado do PDF; sem acesso à conta Google).

**Uso de código remoto:** Não. Todo o código (incluindo pdf.js, tesseract.js e pdf-lib) está dentro do pacote. A política de segurança do conteúdo inclui `wasm-unsafe-eval` somente para executar o OCR (Tesseract compilado em WebAssembly, que vai dentro do pacote); nenhum código é baixado nem executado de fora.

**Dados transmitidos (marque na aba "Práticas de privacidade"):** como a extensão transmite, **a pedido do usuário**, dados ao app Assessor Judicial (servidor do desenvolvedor), marque:
- **Informações de identificação pessoal** (nomes/CPF que constem nos processos enviados) — marque.
- **Comunicações pessoais** (conteúdo de peças e decisões dos processos) — marque.
- **Conteúdo do site** (texto e PDFs das páginas do Projudi que o usuário manda processar) — marque.
Não marque: dados de saúde, financeiros, de autenticação (a extensão não lê nem guarda senhas), localização, histórico de navegação, atividade do usuário.
Explicação para o campo de texto: "Quando o usuário aciona a análise, a extensão envia o PDF/texto do processo ao app Assessor Judicial (judicial-mysql.assessor.net.br, mesmo desenvolvedor), que o processa com IA e guarda o resultado na conta e no gabinete do usuário por prazo limitado. A extensão não coleta dados em segundo plano nem envia dados a terceiros."
Marque as três declarações: não vendo dados; não uso para fins alheios à finalidade única; não uso para avaliar crédito.

**URL da política de privacidade:** `https://fabriciocunhaadv.github.io/projudi/` — exige ativar o GitHub Pages em Settings → Pages (Source: Deploy from a branch; Branch: `claude/determined-bardeen-xtc9lq`, pasta `/docs`). **Abra a URL no navegador antes de colar na loja** e confira que ela mostra a política atualizada de 28/10/2026 (diz que o app tem servidor próprio e descreve os dados enviados). Se o GitHub Pages ficar numa outra branch (por exemplo `main`), faça o merge dessa pasta `docs/` para ela.

## Aba "Distribuição"
Visibilidade: **Privada** (testadores confiáveis, com os e-mails Google dos assessores) ou **Não listada**. Regiões: Brasil.


**Versão 1.0.62:** sem a permissão `identity`, sem o bloco `oauth2` e sem o host `docs.googleapis.com`. A extensão não acessa a conta Google do usuário; o documento do Google Docs é aberto em branco, com o título, e a minuta já fica copiada e formatada para colar.

**Versão 1.0.65:** inclui tudo da 1.0.62 e torna a análise mais robusta: o resultado passa a chegar pelo armazenamento local da extensão (não depende de um canal de mensagem aberto), e, se a conexão com a aba do assistente cair, a fila procura a minuta já pronta no histórico antes de tentar de novo. Nenhuma permissão nova.


**Versão 1.0.66:** sem a permissão `tabGroups` (só agrupava abas) e com o acesso ao Google Docs limitado a `docs.google.com/document/*`; pacote com todas as licenças das bibliotecas; política de privacidade e textos da loja atualizados para dizer que o app Assessor Judicial tem servidor próprio e quais dados recebe. Nenhuma permissão nova.