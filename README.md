# Robô de conclusões do Projudi (TJGO)

Entra em cada serventia onde você é assessor, lê a tabela **CONCLUSÕES**
(não analisadas / pré-analisadas) e manda o resumo por e-mail.
Só lê as telas; não altera nada no Projudi.

## Instalação (Windows, uma vez)
1. Instale o Python 3.11+ (python.org, marque "Add to PATH").
2. No PowerShell, dentro desta pasta:
   ```
   pip install -r requirements.txt
   playwright install chromium
   copy .env.example .env
   ```
3. Edite o `.env`: crie uma **senha de app** do Gmail em
   https://myaccount.google.com/apppasswords e cole em `GMAIL_APP_PASSWORD`.
   (`FILTRO_SERVENTIA=Montes Claros` limita às varas de Montes Claros de Goiás.)

## Uso
```
python projudi_monitor.py            # envia e-mail se houver pendência
python projudi_monitor.py --sempre   # envia mesmo sem pendência
python projudi_monitor.py --todas    # inclui Mineiros, Anápolis, Goiânia...
```
Na primeira vez abre uma janela: faça o login normal (usuário, senha e código).
O robô continua sozinho e a sessão fica salva em `.perfil/`. Se a sessão
expirar, ele pede o login de novo.

## Agendar (Windows)
Agendador de Tarefas > Criar Tarefa Básica > diário, nos horários desejados >
programa `python`, argumentos `projudi_monitor.py`, iniciar em: esta pasta.
Se o Projudi pedir login de novo, a janela abre e espera você.

## Se der "tabela de conclusões não encontrada"
O robô grava o HTML em `debug/`. Me envie esse arquivo para eu ajustar o seletor.

Teste do parser (sem acessar o Projudi): `python tests/test_parse.py`

---

# Extensão do Chrome (recomendada) — pasta `extensao/`

Faz o mesmo, mas dentro do seu Chrome já logado: sem Python e sem login do robô.
- Confere sozinha a cada X minutos (10 min a 3 h) enquanto o Chrome estiver aberto e você logado.
- Ícone com o número de conclusões **não analisadas** no total.
- Notificação do Windows quando chegar conclusão nova.
- Lista de **processos** não analisados e pré-analisados, agrupados por **classificador** (ex.: "Emilly - minutando"), com data e usuário da pré-análise.
- **Painel completo** (botão "Abrir painel completo" no popup): resumo por serventia, totais por classificador em todas as serventias, e o detalhe serventia → situação → classificador → processos, com busca e exportação para CSV (Excel).
- **Ordem de trabalho:** cada processo mostra data e hora de início e a prioridade do grupo. A ordem padrão é a do próprio Projudi: urgência do processo (maior de 80 anos, réu preso, tutela...) → prioridade do classificador (maior número primeiro) → do mais antigo para o mais recente. No painel dá para trocar a regra (urgência + mais antigo, ou só a data) e escolher entre "Por classificador" e "Fila única". O CSV sai nessa mesma ordem.
- Popup com a tabela por serventia (com link para abrir cada uma) e botão "Verificar agora".
- Filtro de serventias e intervalo configuráveis no próprio popup.

## Instalar
1. Baixe/clone o repositório.
2. No Chrome: `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a pasta `extensao/`.
3. Fixe o ícone na barra, entre no Projudi normalmente e clique em **Verificar agora**.

Se a sessão do Projudi expirar, o ícone mostra `!` e o popup avisa para entrar de novo.

**Atalho Alt+Shift+C** (funciona em qualquer janela, inclusive pop-ups sem barra de extensões, como a do "Gerar PDF"): abre uma aba com o HTML da tela em foco e um botão "Copiar tudo".

Botão **Capturar tela atual**: abra no Projudi a tela que quer me mostrar (ex.: o processo com as movimentações, o editor de texto), clique no ícone da extensão > "Capturar tela atual" e cole aqui. Ele copia o HTML da aba **incluindo os iframes**, sem scripts e sem senhas. Revise antes de colar: o HTML pode conter nomes e números de processos.

Botão **Copiar diagnóstico**: se alguma lista vier vazia ou der erro, clique nele e cole o resultado no chat; ele leva o HTML da tela que a extensão não conseguiu ler.

Testes (usam páginas no formato real do Projudi, com dados fictícios, em `tests/fixtures`): `python tests/test_parser.py` (leitor) e `python tests/e2e_extensao.py` (extensão completa num Chromium)

Limitações: lê só "Pendentes" e "Pré-Análises > Simples" (não as Múltiplas/Finalizadas); não envia e-mail (usa notificação e ícone); só confere com o Chrome aberto.


---

## Formatação automática da minuta (no editor de texto do Projudi)

No editor aparecem, no canto inferior direito, os botões **Formatar seleção**, **Aprender texto** e **Aprender citação**.
- **Colar:** ao colar do Word, Google Docs ou de um chat, o texto entra limpo (sem fonte/cor de origem) e já no seu padrão: fonte, tamanho,
  justificado, recuo da 1ª linha; citações (recuadas, entre aspas longas ou iniciadas por `>`) saem com o padrão de citação; títulos centralizados são preservados.
- **Formatar seleção (Alt+Shift+F):** reformata só o trecho selecionado (ou o parágrafo do cursor, se nada estiver selecionado); o resto da minuta não é tocado (Ctrl+Z desfaz). O texto é entregue pela API do próprio editor (TinyMCE/CKEditor) e leva fonte/tamanho também em `<span>`, para passar pelos filtros dele. O botão **Diagnóstico** copia as informações do editor (versão, filtros, o que sobrevive ao gravar), úteis se a formatação não aparecer no sistema.
- **Aprender:** formate um parágrafo e uma citação do seu jeito, clique dentro deles e use *Aprender texto* / *Aprender citação*.
  A extensão grava fonte, tamanho (com a unidade do editor), recuo, margens e entrelinha. Os valores também podem ser editados em *Ferramentas*.
- Padrão inicial (até você ensinar): Times New Roman, 16px no texto, 14px nas citações (recuo 4cm), justificado, recuo de 1ª linha 2,5cm.

## PDF com OCR (`ocr.html`, botão "PDF com OCR" no popup)
Solte o PDF baixado do Projudi. A extensão confere página por página, faz OCR (português) **só nas páginas sem texto** e devolve o mesmo
PDF com o texto invisível embutido (as imagens não são recomprimidas). Roda 100% no computador (bibliotecas em `extensao/vendor`, licenças em `vendor/licencas`).
Teste: `python tests/test_ocr.py` (usa o `pdftotext` para conferir).

Testes: `test_parser`, `test_formatacao`, `test_ocr`, `e2e_extensao`, `e2e_formatacao` (todos em `tests/`).

## Tabelas no formato do Projudi
No popup e no painel, os processos **não analisados** e **pré-analisados** aparecem em tabelas iguais às do Projudi: faixa azul com o tipo de
conclusão, faixa do classificador com a prioridade, bolinha de urgência (vermelha/amarela), número com link para o processo e botão 📋 para copiar o número.
No painel há ainda a coluna *Dias* e a opção "Fila única (ordem de trabalho)".

## OCR automático
Quando um PDF de `tjgo.jus.br` termina de baixar, a extensão faz o OCR sozinha (aba em segundo plano) e salva `nome-OCR.pdf` em Downloads;
o original é mantido. Liga/desliga em *Ferramentas*. Para ler o arquivo recém-baixado, ligue "Permitir acesso a URLs de arquivo" nos detalhes da
extensão; sem isso ela baixa o PDF de novo pelo mesmo endereço. Teste: `python tests/e2e_ocr_auto.py`.

## Baixar arquivos do processo (seleção por movimentação)
Na aba **Navegação de Arquivos** de um processo aparece o botão **⬇ Baixar arquivos do processo (N)**. Ele abre uma página com as movimentações e os
arquivos de cada uma, com caixas de seleção e **Marcar todos**. Opções:
- **Um PDF único**: reúne os arquivos na ordem das movimentações, com **índice** (nome do arquivo e página) e **marcadores** por movimentação/arquivo;
- **Um PDF para cada arquivo** (salvos numa pasta "Processo <número>" em Downloads);
- **OCR** nas páginas sem texto (ligado por padrão).
Aceita PDF, documentos HTML do sistema (como `online.html`, convertidos em texto), imagens (JPG, PNG, GIF, BMP, WEBP) e páginas "moldura" que só embutem o arquivo.
Áudio, vídeo e outros tipos não entram no PDF e aparecem no índice como "não incluído". O botão **Copiar diagnóstico** leva a estrutura lida e o HTML do sumário.
**Modo padrão — PDF completo do Projudi:** ao baixar, a extensão abre a janela "Gerar PDF" do próprio Projudi (ou, se não achar o botão, basta você
clicar em *Gerar PDF de processo completo*), marca só os arquivos que você selecionou (ou "Todos os Arquivos") e aperta *Gerar*. O PDF que o Projudi
devolve (cabeçalho por movimentação/arquivo, já pesquisável) é baixado normalmente; o OCR automático só atua se sobrar página sem texto.
Os modos "PDF único com índice próprio" e "um PDF por arquivo" continuam disponíveis.
Na janela "Gerar PDF" também há o botão **Gerar e baixar tudo (extensão)** e **Copiar diagnóstico** (para ajustar se o Projudi mudar a tela).

Testes: `python tests/e2e_baixar.py`, `python tests/e2e_gerarpdf.py`.


## Baixar os processos para análise (fila automática)
No painel, em **Baixar PDFs para análise**:
1. Marque as **serventias (varas)** em que você trabalha (a escolha fica gravada na sua conta do Chrome) e, se quiser, digite o nome do **prompt** do app de IA de cada serventia.
2. Opcionalmente restrinja por classificador e por situação (não analisadas / pré-analisadas) e desmarque processos específicos.
3. **Baixar PDFs dos N processos**: a fila, na ordem do painel (urgência → prioridade → mais antigo), abre cada processo, pede o PDF completo ao Projudi,
   faz OCR nas páginas-imagem (qualidade alta) e salva em `Downloads/Projudi/<data>/<serventia>/<classificador>/`:
   - `número-OCR.pdf` — o PDF completo do Projudi, agora pesquisável (as páginas em imagem passam por OCR).
Testes: `python tests/e2e_lote.py`, `python tests/e2e_extensao.py`.

## Modelos do Projudi na base de conhecimento do Studio
Página **Modelos do Projudi** (link no painel): para cada serventia gera **um PDF** com os modelos de decisão, despacho e sentença (índice + cada modelo com Id, nome, tipo e serventia) e,
com **Enviar ao Studio**, cadastra o PDF na *Base de Conhecimento do Gabinete* do app **substituindo** o documento de mesmo nome (apaga o antigo e envia o novo; não duplica).
O nome do arquivo é editável e fica gravado no painel (coluna "Arquivo de modelos na base do Studio"). A captura automática dos modelos no Projudi ainda depende das telas do cadastro de modelos.
Teste: `python tests/e2e_studio_base.py`.

## Minuta no Google Docs, ao lado do PDF
Na fila ("Baixar PDFs para análise"), marque **Iniciar a análise no Studio** e, depois, **abrir no Google Docs**. Quando o Studio termina a minuta, a extensão:
1. lê a minuta gerada (botão "Copiar" do app; se falhar, o painel de resultado);
2. identifica o tipo (sentença, decisão interlocutória, decisão saneadora, despacho) e cria o documento **"número do processo – tipo"**;
3. formata em padrão monografia: A4, margens 3/2 cm, Times New Roman 12, justificado, espaçamento 1,5, recuo de 1,25 cm, títulos em MAIÚSCULAS centralizados em negrito;
4. abre o Google Docs na metade esquerda da tela e o PDF baixado (com OCR) na metade direita.

**Configuração única (login do Google).** Sem ela, a extensão abre um Google Docs em branco com o título certo e deixa a minuta copiada (formatada) para você dar Ctrl+V.
1. Em console.cloud.google.com crie um projeto e ative a **Google Docs API**.
2. Tela de consentimento OAuth: tipo *Externo*, adicione você como usuário de teste.
3. Credenciais → *ID do cliente OAuth* → tipo **Extensão do Chrome**, com o ID da extensão `lolomaglbjcmoohjkcibpjlbkgdlgldm` (o `key` do manifest mantém esse ID em qualquer computador).
4. Copie o ID do cliente para `oauth2.client_id` no `manifest.json` e recarregue a extensão. Na primeira minuta o Google pede a autorização.
Obs.: a Lupa do Magistrado não gera o documento (ela audita, não minuta). Testado só com páginas simuladas.

## Esteira de minutas (Studio → Google Docs → Projudi)
Os downloads dos PDFs continuam todos em paralelo à esteira. Cada PDF pronto entra na **esteira** (página `esteira.html`, aberta sozinha em segundo plano; também há o link na tela da fila), que trabalha **um processo por vez**:
1. **Studio** gera a minuta (se der erro, o processo fica marcado com o erro e a esteira segue para o próximo; há “Tentar de novo”).
2. **Google Docs** abre com a minuta “número – tipo” ao lado do PDF. Uma barra azul no rodapé do Docs traz o botão **“✔ Terminei a conferência — cadastrar no Projudi”**.
3. Ao clicar, a extensão lê de volta o texto corrigido no Docs (precisa do login do Google acima; sem ele usa a minuta original do Studio) e abre o processo no Projudi. A barra do Projudi traz **“Copiar minuta”** — usa a formatação cadastrada na extensão (Aprender texto/citação) — e **“✔ Lancei no Projudi — próximo processo”**.
4. Só então o próximo processo da fila vai ao Studio.

Limite atual: a extensão abre a tela do processo (ou a pré-análise, quando conhecida); você abre o editor de texto da minuta e clica em “Inserir”. Para chegar sozinha ao editor preciso do HTML da tela da lupa/“minutar” do Projudi.

### Continuar de onde parou
- Na esteira, o processo interrompido/com erro tem **"Usar a minuta que já está no Studio"** (lê a minuta aberta na tela do app) e **"Analisar de novo"**.
- Na própria tela do Studio, quando houver processo pendente e uma minuta aberta, aparece embaixo a barra **"Enviar a minuta aberta aqui para este processo"**. Ela escolhe o processo pelo número que está na tela (ou você escolhe na lista) e a esteira segue: Google Docs ao lado do PDF → conferência → Projudi.
- Se a aba do Studio já estava aberta quando a extensão foi recarregada, a extensão se reinjeta sozinha (não precisa atualizar a página).
