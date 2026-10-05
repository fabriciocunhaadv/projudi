# Pendências combinadas (para depois das atualizações da extensão)

## Distribuição para outros computadores e assessores
- A extensão hoje é instalada em "Modo do desenvolvedor" (Carregar sem compactação) e vale só para aquele Chrome/computador: não sincroniza com o notebook nem existe no celular.
- Instalação manual em cada computador: copiar/baixar a pasta `extensao` e carregá-la em `chrome://extensions`.
- Quando as atualizações estiverem concluídas: preparar o pacote para publicar na **Chrome Web Store como extensão privada** (conta de desenvolvedor com taxa única), para instalar e atualizar em todos os computadores dos assessores sem copiar pasta.
  - Revisar antes: permissões (`*.tjgo.jus.br`, `*.ai.studio`, downloads, scripting), política de privacidade, ícones/descrição, e o fato de nada sair do computador do usuário.

## Em andamento / próximos passos
- Captura dos modelos do Projudi (Cadastros → Modelo): aguardando o HTML das telas de cadastro e consulta.
- Integração com o app Assessor Judicial (AI Studio): aguardando diagnóstico da tela no computador e as regras de prompt por serventia.
- Validar no Projudi real: fila de PDFs por serventia, OCR em qualidade alta, formatação da minuta no CKEditor.

## Modelos do Projudi -> base de conhecimento do Studio (decisões já tomadas)
- Aba "Modelos" na extensão: botão "Atualizar modelos" varre TODA a lista (Cadastros -> Modelo; qualquer quantidade, pois modelos são criados/editados/excluídos), guarda id, nome, tipo (despacho/decisão/sentença), serventia e texto, e mostra novos/alterados/excluídos desde a última varredura.
- Saída: **3 arquivos .txt por serventia** (despacho, decisão, sentença), refeitos inteiros a cada varredura (sem duplicar). Nome: `Modelos-<Serventia>-<Tipo>.txt`.
  - Cada arquivo: cabeçalho (serventia, tipo, data da atualização), índice, e cada modelo com Id, nome, tipo, serventia e texto completo.
- Envio para a base de conhecimento do Studio: primeiro manual (substituir os arquivos); depois automatizado (apagar o arquivo antigo e subir o novo com o mesmo nome). Falta: telas do Projudi (Alt+Shift+C no Cadastro de Modelo, na lista e com um modelo carregado) e a tela da base de conhecimento do Studio (botão Diagnóstico).

## Atualização (base de conhecimento do Studio)
- A "Base de Conhecimento do Gabinete" do app (Caderno de Teses & Modelos -> aba Base de Conhecimento) **só aceita PDF** (`accept="application/pdf,.pdf"`), então o arquivo de modelos é gerado em **PDF com texto** (não .txt).
- **Um PDF por serventia** com decisões, despachos e sentenças: `Modelos - <Serventia> - Decisões, Despachos e Sentenças.pdf` (nome editável; também no painel, coluna "Arquivo de modelos na base do Studio").
- Envio: a extensão (`studio-base.js` + página `modelos.html`) abre a base, **exclui o documento de mesmo nome** (se existir) e envia o novo -> não duplica. Testado só com uma cópia simulada da tela.
- Falta: leitura dos modelos do Projudi (Cadastros -> Modelo): aguardando o HTML de dentro do quadro (botões "Copiar esta tela" / "Copiar lista aberta").

## Atualização (captura dos modelos, base sem edição, Lupa)
- **Captura dos modelos do Projudi** (`modelos-projudi.js`, botão "Atualizar modelos do Projudi" em `modelos.html`): a extensão conduz a própria tela (Cadastros -> Modelo -> Localizar -> Consultar), lê todas as páginas e o texto de cada modelo no editor, grava em `chrome.storage.local.modelos` e mostra novos / alterados / excluídos. Testada com uma cópia simulada da moldura do Projudi; falta validar no Projudi real (seletores da linha e do clique no modelo).
- **Base do Studio não edita**: a extensão NÃO exclui sozinha. Se o documento já existe, avisa para excluir o antigo (lixeira do app) e envia o novo; há o botão "Excluir o antigo e enviar agora" na página de modelos. Na fila, só avisa e segue.
- **Lupa do Magistrado**: para pré-analisadas, lê a minuta do editor da pré-análise (CKEditor/TinyMCE) e lança no campo "Minuta Elaborada pelo Assessor". Depende de a lista de pré-análises ter o link da tela de edição (campo `urlPre` do parser): falta o HTML da linha da lista / tela da pré-análise.
