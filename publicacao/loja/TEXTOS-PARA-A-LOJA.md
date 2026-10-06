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
• Fila de minutas: envia o PDF ao app Assessor Judicial (AI Studio), abre a minuta no Google Docs ao lado do PDF para conferência e lança o texto no editor do Projudi com a sua formatação.
• Formatação do editor de minutas: botão "Formatar seleção" e aprendizado do seu padrão de texto e citação.

Privacidade: não há servidor próprio, anúncios nem coleta de dados. O OCR e o processamento são feitos no navegador. Os dados só vão para os sistemas que você mesmo usa (Projudi, app Assessor Judicial/AI Studio e Google). Política de privacidade: veja o link informado na loja.

Requer acesso ao Projudi (TJGO) e, para as minutas, ao app Assessor Judicial. Não é um produto oficial do TJGO.

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
- **scripting:** executar, na aba do Projudi/Studio, os passos pedidos pelo usuário (abrir o processo, gerar o PDF, ler a minuta).
- **storage / unlimitedStorage:** guardar configurações, a fila de processos e as minutas no computador do usuário.
- **clipboardWrite:** copiar para a área de transferência a minuta e o diagnóstico, a pedido do usuário.
- **tabGroups:** agrupar, numa só janela, as abas do Google Docs e do PDF do processo.
- **Acesso a sites:** *.tjgo.jus.br (Projudi: ler conclusões, gerar PDF, editor de minutas); *.ai.studio (app Assessor Judicial: enviar o PDF e ler a minuta); docs.google.com e docs.googleapis.com (abrir o documento da minuta).

**Uso de código remoto:** Não. Todo o código (incluindo pdf.js, tesseract.js e pdf-lib) está dentro do pacote.

**Dados coletados (marque):** "Conteúdo do site" e "Informações pessoais ou profissionais / comunicações" apenas no sentido de que a extensão lê as páginas e os processos que o próprio usuário abre; nada é enviado ao desenvolvedor. Marque as três declarações: não vendo dados; não uso para fins alheios à finalidade única; não uso para avaliar crédito.

**URL da política de privacidade:** a do GitHub Pages (`https://fabriciocunhaadv.github.io/projudi/`) assim que a pasta `docs/` estiver na branch `main` e o Pages ativado.

## Aba "Distribuição"
Visibilidade: **Privada** (testadores confiáveis, com os e-mails Google dos assessores) ou **Não listada**. Regiões: Brasil.
