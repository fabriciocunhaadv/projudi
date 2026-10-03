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
