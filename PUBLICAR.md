# Publicar a extensão na Chrome Web Store (privada) e atualizar todo mundo

## Uma vez só
1. Conta de desenvolvedor: https://chrome.google.com/webstore/devconsole — entre com a conta Google que será a "dona" da extensão (de preferência uma conta própria para isso, não pessoal) e pague a taxa única de US$ 5.
2. Gere o pacote: `python3 empacotar.py` → cria `publicacao/projudi-extensao-<versão>.zip`.
3. No painel: **Novo item → enviar o .zip**.
4. Aba **Listagem da loja**: nome, descrição (o que faz, para assessores/magistrados do TJGO), categoria *Produtividade*, ícone 128×128 (`extensao/icone.png`), ao menos 1 captura de tela (1280×800) e idioma Português (Brasil).
5. Aba **Privacidade**:
   - Finalidade única: "Auxiliar o trabalho de assessoria no Projudi: baixar PDFs de processos com OCR, formatar minutas e organizar o envio ao Studio/Google Docs."
   - Justifique cada permissão (downloads, storage, tabs/scripting, identity [login Google para criar o Docs], clipboardWrite, notifications, hosts do TJGO, ai.studio e Google Docs).
   - Declare que processa **conteúdo de processos** apenas no navegador do usuário, que **não há servidor próprio** nem venda de dados; e informe uma URL de política de privacidade (pode ser uma página simples do GitHub Pages/Google Sites).
6. Aba **Distribuição**: Visibilidade **Privada** → "Testadores confiáveis" (lista de e-mails Google dos assessores/juízes) **ou** "Não listada" (só quem tem o link). Evite "Pública".
7. **Enviar para revisão.** A primeira revisão leva de horas a alguns dias (por pedir acesso a vários sites, pode demorar mais).
8. Depois de aprovado, cada pessoa abre o link da loja e clica em **Adicionar ao Chrome**.

## ID da extensão e login do Google
A loja gera um ID **próprio** (diferente do ID de desenvolvimento `lolomaglbjcmoohjkcibpjlbkgdlgldm`). Depois do 1º envio:
- Painel → item → **Pacote → Ver chave pública**: copie a chave e cole no campo `"key"` do `extensao/manifest.json` (assim o ID de teste local fica igual ao da loja; o `empacotar.py` retira esse campo ao gerar o .zip).
- No Google Cloud, crie o *ID do cliente OAuth* do tipo **Extensão do Chrome** com o **ID da loja**, copie o ID do cliente para `oauth2.client_id` no manifest e publique a versão 1.0.1 com ele.
- Na Tela de consentimento, se a conta for Google Workspace do tribunal, marque *Interno*; senão, publique o app (escopo `documents` é sensível: o Google pode pedir verificação; enquanto isso, em modo teste, só e-mails cadastrados como "usuários de teste" conseguem autorizar).

## Toda atualização (chega sozinha para todos)
1. Altere o código e **aumente `"version"`** em `extensao/manifest.json` (ex.: 1.0.1 → 1.0.2). Sem isso a loja recusa.
2. `python3 empacotar.py` e, no painel, **Pacote → Fazer upload da nova versão** → Enviar para revisão.
3. Aprovada a revisão (normalmente horas), o Chrome de cada usuário atualiza **sozinho** em até algumas horas (o navegador confere de tempos em tempos; quem quiser na hora vai em `chrome://extensions` → *Atualizar*).
- Dica: marque *Publicar automaticamente após aprovação* para não precisar voltar ao painel.
- Mudanças que **adicionam permissões** fazem o Chrome desativar a extensão até o usuário aceitar de novo: evite permissões novas sem necessidade.
