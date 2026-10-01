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
