# Política de Privacidade — Extensão “Conclusões Projudi”

Última atualização: 05/10/2026

Esta extensão do Google Chrome auxilia assessores e magistrados do TJGO no trabalho com o Projudi: acompanha conclusões, baixa PDFs de processos com OCR, formata minutas e organiza o envio de PDFs e minutas ao app Assessor Judicial (AI Studio) e ao Google Docs.

## Resumo
- A extensão **não tem servidor próprio**. O desenvolvedor **não recebe, não coleta e não armazena** nenhum dado seu ou de processos.
- **Não há anúncios, rastreamento, análise de uso (analytics) nem venda ou compartilhamento de dados** com terceiros.
- Tudo é processado **no seu navegador**, com a sua sessão já aberta no Projudi.

## Quais dados a extensão acessa
1. **Páginas do Projudi (`*.tjgo.jus.br`)**: lista de conclusões, dados e PDFs dos processos que você manda baixar, modelos de decisão/despacho/sentença do seu cadastro e o texto do editor de minutas. Esse conteúdo é lido apenas para executar a função que você pediu.
2. **PDFs e OCR**: os PDFs gerados pelo Projudi são baixados e o OCR é feito **localmente**, no navegador. Os arquivos ficam na pasta de downloads do seu computador.
3. **App Assessor Judicial / AI Studio (`*.ai.studio`)**: se você ativar a opção, a extensão envia o PDF do processo e o PDF de modelos **para o app que você já usa, com a sua conta**, e lê de volta a minuta gerada. O tratamento nesse app segue os termos e a política do próprio app e do Google.
4. **Google Docs**: se você ativar a opção, a extensão usa a sua autorização Google (escopo `documents`) para **criar um documento na sua conta** com a minuta e, depois, ler o texto que você conferiu. O acesso é feito com o seu token, diretamente entre o seu navegador e o Google; nenhum outro destinatário recebe esses dados.

## O que fica guardado no navegador
- **Configurações** (serventias escolhidas, nomes de prompts e arquivos, preferências de formatação): no armazenamento da extensão e, quando disponível, sincronizado pela **sua conta do Chrome** (chrome.storage.sync).
- **Dados temporários de trabalho** (lista de processos da fila, modelos capturados, PDFs aguardando análise na esteira, texto das minutas): ficam no armazenamento local do navegador, no seu computador, e podem ser limpos pelos botões da própria extensão ou removendo a extensão.

## Permissões e para que servem
- **Sites do TJGO, ai.studio, Google Docs/APIs**: ler e operar as telas e criar o documento, como descrito acima.
- **downloads**: salvar os PDFs. **storage**: guardar configurações e a fila. **tabs/scripting**: abrir e conduzir as abas necessárias. **notifications**: avisar o fim das tarefas. **identity**: login Google para o Docs. **clipboardWrite**: copiar a minuta quando o login Google não está configurado.

## Compartilhamento
Nenhum dado é compartilhado, vendido ou transferido pelo desenvolvedor. Os únicos destinos são os sistemas que você mesmo usa (Projudi, app Assessor Judicial/AI Studio e Google), por ação sua.

## Dados sensíveis e sigilo
Processos podem conter dados pessoais e segredo de justiça. Como o desenvolvedor não tem acesso a nenhum dado, a responsabilidade pelo uso das informações (inclusive ao enviá-las ao app de IA ou ao Google) é do usuário, conforme as normas do tribunal e a LGPD.

## Crianças
A extensão é uma ferramenta profissional e não é direcionada a menores de idade.

## Alterações
Mudanças nesta política serão publicadas neste mesmo endereço, com nova data de atualização.

## Contato
fabriciocunha.adv@gmail.com — repositório: https://github.com/fabriciocunhaadv/projudi
