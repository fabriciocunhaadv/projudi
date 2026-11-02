# "Editar com o chat Gemini" abre o chat normal, abaixo da minuta (sem janelinha flutuante)

Hoje o botão "Editar com o chat Gemini" (canto inferior direito do card "Resultado & Análise") abre uma JANELINHA flutuante ("Assistente do {userName} — Interação e Refino da Minuta", com botão "Recolher" e ações rápidas) por cima da minuta.
O app já tem (ou tinha) o chat "normal": o painel em bloco `#tour-result-chat` ("Enhanced Chat Panel for Assessor"), que fica DENTRO do card, abaixo da minuta, com histórico de mensagens, "Limpar Chat", "Minuta Reescrita", "Ver na Aba Principal", copiar etc. É esse painel que deve aparecer; a janelinha deixa de existir.

Observação para quem mantém a extensão: o botão "⚖ Lançar no Projudi" da extensão se posiciona pelo botão cujo texto contém "Editar com o chat". Mantenha esse texto; a extensão acompanha a posição dele sozinha.

## Cole no Studio

> Mude SOMENTE o que o botão "Editar com o chat Gemini" faz e onde o chat aparece. A lógica do chat (envio, modelos, histórico, "Limpar Chat", "Minuta Reescrita", copiar, "Ver na Aba Principal") não muda.
>
> 1. Remova a janelinha flutuante do chat (o painel "Assistente do {userName} — Interação e Refino da Minuta" com `fixed`/`absolute`, `bottom-*`/`right-*`, `z-*`, largura fixa e o botão "Recolher", e as "Ações Rápidas" dessa janelinha — se quiser mantê-las, passe-as para dentro do painel em bloco).
> 2. O chat passa a ser UM SÓ: o painel em bloco `#tour-result-chat`, renderizado dentro do card "Resultado & Análise", imediatamente ABAIXO da minuta, na largura total do card, sem sobrepor a minuta (sem `position: fixed/absolute`, sem `z-index` de pop-up). Lista de mensagens com `max-h-96` e rolagem interna.
> 3. O botão "Editar com o chat Gemini" não abre mais janela. Ao clicar: mostra o painel `#tour-result-chat` (se estiver oculto), rola suavemente até ele (`scrollIntoView({ behavior: "smooth", block: "nearest" })`) e dá foco ao campo de mensagem. Clicar de novo com o painel já aberto apenas leva o foco para o campo (não fecha e não perde o histórico). O painel pode ter um botão "Recolher" próprio que apenas o oculta, mantendo as mensagens.
> 4. Mantenha o `id="tour-result-chat"` e o texto exato "Editar com o chat Gemini" no botão (ele continua no mesmo lugar do card).
> 5. Funciona igual em "Minuta (Tela Cheia)", "Dividir Tela" (o chat fica embaixo da coluna da minuta) e no celular (largura total, sem barra de rolagem horizontal).
> 6. Não altere mais nada. Mostre apenas o diff.
