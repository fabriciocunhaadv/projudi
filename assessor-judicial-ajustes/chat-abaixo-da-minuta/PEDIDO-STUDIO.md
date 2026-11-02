# Chat da minuta abaixo da minuta (não mais janela flutuante)

Hoje o botão "Editar com o chat Gemini" (canto inferior direito do card "Resultado & Análise") abre o painel "Assistente do {userName} — Interação e Refino da Minuta" como janela FLUTUANTE sobre a minuta (com o botão "Recolher"). O pedido abaixo muda só o posicionamento: o chat passa a abrir EMBAIXO da minuta, dentro do próprio card, empurrando o conteúdo (sem cobrir o texto).

Observação para quem mantém a extensão: o botão "⚖ Lançar no Projudi" da extensão se posiciona pelo botão cujo texto contém "Editar com o chat". Mantenha esse texto no botão; a extensão acompanha a posição dele sozinha.

## Cole no Studio

> Altere SOMENTE o posicionamento do painel do chat de refino da minuta ("Assistente do {userName} — Interação e Refino da Minuta"). Nada muda na lógica do chat (mensagens, envio, modelos, histórico, "Limpar Chat", "Minuta Reescrita", "Ver na Aba Principal", copiar etc.).
>
> 1. Encontre o componente que renderiza esse painel como janela flutuante (classes como `fixed`, `absolute`, `bottom-*`, `right-*`, `z-*`, sombra/arredondamento de pop-up, largura fixa) e o botão "Editar com o chat Gemini" que o abre/fecha, e o botão "Recolher".
> 2. Renderize o painel como um BLOCO NORMAL DO FLUXO, dentro do mesmo card do "Resultado & Análise", imediatamente ABAIXO da área da minuta (depois do texto da minuta e antes da linha "Quer ajustar a minuta ou tirar dúvidas sobre o caso?" / do botão "Editar com o chat Gemini"). Sem `position: fixed/absolute`, sem `z-index` de sobreposição, sem `bottom/right` fixos.
> 3. Largura 100% do card (a mesma largura da minuta), `border-t` separando da minuta, fundo e bordas no mesmo estilo do card. A lista de mensagens fica com altura máxima (`max-h-96`, `overflow-y-auto`) e rola por dentro; ao abrir, role a página suavemente até o painel (`scrollIntoView({ behavior: "smooth", block: "nearest" })`) e dê foco ao campo de mensagem.
> 4. O botão "Editar com o chat Gemini" continua no mesmo lugar e continua alternando abrir/fechar; "Recolher" fecha o painel (o estado de aberto/fechado e o histórico da conversa são os mesmos de hoje). Pode abrir fechado por padrão, como hoje.
> 5. Mantenha o `id="tour-result-chat"` do painel e o texto exato "Editar com o chat Gemini" no botão.
> 6. Funciona igual nos modos "Minuta (Tela Cheia)" e "Dividir Tela" e no celular (largura total, sem barra de rolagem horizontal). Se em "Dividir Tela" a minuta ocupa uma coluna, o chat fica embaixo dessa coluna.
> 7. Não altere mais nada do arquivo. Mostre apenas o diff.
