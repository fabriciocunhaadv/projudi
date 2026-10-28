# Política de Privacidade — Extensão “Conclusões Projudi”

Última atualização: 28/10/2026

Esta extensão do Google Chrome auxilia assessores e magistrados do TJGO no trabalho com o Projudi: acompanha conclusões, baixa PDFs de processos com OCR, formata minutas e envia, **a pedido do usuário**, o PDF do processo ao app **Assessor Judicial**, de onde traz de volta a minuta gerada. O app Assessor Judicial é um sistema do mesmo desenvolvedor, hospedado em servidor próprio no endereço `judicial-mysql.assessor.net.br`.

## Resumo
- **A extensão em si** não tem servidor, não coleta dados em segundo plano e não faz análise de uso (analytics). Não há anúncios, rastreamento, venda ou compartilhamento de dados com terceiros.
- **O app Assessor Judicial tem servidor próprio** (do desenvolvedor). Quando o usuário aciona uma análise, esteira ou lote, a extensão **transmite ao app** o PDF/texto do processo, e o app guarda o resultado na conta e no gabinete do usuário, como descrito abaixo.
- O download dos PDFs do Projudi e o OCR acontecem **no seu navegador e no seu computador**; nada disso é enviado a ninguém, a menos que você acione o envio ao app.
- A extensão usa a sua sessão já aberta no Projudi e a sua conta já aberta no app. Ela não pede nem guarda senhas.

## Quais dados a extensão acessa
1. **Páginas do Projudi (`*.tjgo.jus.br`)**: lista de conclusões, dados e PDFs dos processos que você manda baixar, modelos de decisão/despacho/sentença do seu cadastro e o texto do editor de minutas. Esse conteúdo é lido apenas para executar a função que você pediu.
2. **PDFs e OCR**: os PDFs gerados pelo Projudi são baixados e o OCR é feito **localmente**, no navegador (as bibliotecas de OCR vão dentro da extensão; não há código remoto). Os arquivos ficam na pasta de downloads do seu computador.
3. **App Assessor Judicial (`judicial-mysql.assessor.net.br`)**: somente quando você aciona (Gerar tudo e enviar à Análise Turbo, esteira de minutas, lote, Lupa), a extensão **envia ao app** o PDF/texto do processo e, quando for o caso, a minuta do assessor e os modelos, e lê de volta a minuta ou a auditoria gerada.
4. **Google Docs**: a extensão apenas abre um documento em branco do Google Docs, no seu navegador, com o título, e deixa a minuta copiada para você colar. Ela **não acessa a sua conta Google** nem lê o documento.

## O que o app Assessor Judicial faz com os dados enviados
- O texto do processo e a minuta são processados para gerar a análise, a minuta ou a auditoria. Para isso, o app envia o conteúdo ao serviço de inteligência artificial **Google Gemini**, usando a chave de IA do usuário ou a do sistema, conforme os termos do Google.
- O app pode **guardar na conta e no gabinete do usuário** a minuta, o resultado da análise ou da auditoria e o texto dos autos enviado, nas telas “Histórico” e “Processos Auditados”, por **prazo limitado definido no app** (o Histórico é apagado automaticamente após o período configurado, por padrão 7 dias quando a retenção está ativa). O usuário pode excluir os próprios registros.
- O app mantém dados de conta (nome, e-mail, gabinete) e contadores de uso (execuções e tokens de IA), e registra erros técnicos **com números de processo, CPF, CNPJ, e-mail e chaves mascarados**.
- Os dados ficam em banco de dados do desenvolvedor (MySQL, hospedagem Hostinger), com acesso restrito por login. **Não são vendidos, não são usados para publicidade nem compartilhados com terceiros**, exceto o envio ao Google Gemini descrito acima.
- O desenvolvedor, como administrador do sistema, pode ter acesso técnico ao banco, e se compromete a não usar os dados para finalidade diferente da prestação do serviço.

## O que fica guardado no navegador
- **Configurações** (serventias escolhidas, nomes de prompts e arquivos, preferências de formatação): no armazenamento da extensão e, quando disponível, sincronizado pela **sua conta do Chrome** (chrome.storage.sync).
- **Dados temporários de trabalho** (lista de processos da fila, modelos capturados, PDFs aguardando análise na esteira, texto das minutas): ficam no armazenamento local do navegador, no seu computador, e podem ser limpos pelos botões da própria extensão ou removendo a extensão.

## Permissões e para que servem
- **Sites do TJGO, judicial-mysql.assessor.net.br e Google Docs (`docs.google.com/document/*`)**: ler e operar as telas, enviar o PDF e ler a minuta do app, e mostrar a barra de apoio no documento.
- **downloads**: salvar os PDFs. **storage / unlimitedStorage**: guardar configurações e a fila. **scripting / activeTab**: conduzir as abas pedidas e capturar a tela atual para diagnóstico, a pedido do usuário. **notifications**: avisar o fim das tarefas. **offscreen**: ler a página de conclusões em segundo plano. **power**: manter o computador acordado durante um lote. **clipboardWrite**: copiar a minuta e o diagnóstico.

## Compartilhamento
O desenvolvedor não vende nem compartilha dados. Os destinos são: o Projudi (de onde os dados vêm), o app Assessor Judicial (servidor do desenvolvedor), o Google Gemini (processamento de IA do app) e o seu navegador/computador.

## Dados sensíveis e sigilo
Processos podem conter dados pessoais e segredo de justiça. O envio de um processo ao app é uma ação do usuário, que responde pelo uso das informações conforme as normas do tribunal e a LGPD. Recomenda-se não enviar processos que a lei ou o tribunal proíbam tratar nesse tipo de ferramenta.

## Crianças
A extensão é uma ferramenta profissional e não é direcionada a menores de idade.

## Alterações
Mudanças nesta política serão publicadas neste mesmo endereço, com nova data de atualização.

## Contato
fabriciocunha.adv@gmail.com — repositório: https://github.com/fabriciocunhaadv/projudi
