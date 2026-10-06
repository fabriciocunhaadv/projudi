# Monitor de Rotina (uso pessoal)

Extensão **separada** da "Conclusões Projudi". Não vai para a Chrome Web Store: instale só no seu Chrome.

## Instalar
1. `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a pasta `monitor-rotina`.
2. Clique no ícone → **⚙ Opções e sites** → digite um domínio (ex.: `tjgo.jus.br`, `ai.studio`, `docs.google.com`) → **Autorizar e adicionar**. O Chrome pede a sua permissão para cada site. Recarregue as abas desses sites.
3. No ícone, **▶ Ligar monitor**.

## O que registra (e o que NÃO registra)
- Só nos sites que você autorizou: tempo ativo (pausa quando você fica parado ou troca de janela), tipo de tela aberta e rótulo curto de botões/links clicados.
- Números viram “#”; parâmetros de endereço são descartados (fica só o que identifica a tela, como `PaginaAtual=4`).
- **Não** registra texto digitado, conteúdo de página, senhas, nem outros sites (eles contam só como “(outros)”, sem endereço).
- Tudo fica no navegador. Nada é enviado. Opções → **Apagar todos os dados**.

## Gravador de tarefas
Ícone → **● Começar a gravar** → faça a tarefa → **■ Parar e salvar** (dê um nome). Depois, **▶ Executar** repete os cliques, escolhas e preenchimentos na aba ativa. Campos de texto **não têm o valor gravado**: a extensão pergunta o valor a cada execução (ou, em Opções, você define um valor fixo). Limite desta versão: uma aba/site por tarefa.

## Relatório para análise
Ícone → **📊 Relatório**: tempo por site, telas mais abertas, cliques mais frequentes e **sequências que se repetem** (candidatas a automação). **Copiar relatório para análise** gera um texto anônimo para colar no chat.
