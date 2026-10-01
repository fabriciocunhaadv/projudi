"""Robô que confere as CONCLUSÕES (não analisadas / pré-analisadas) de cada
serventia do assessor no Projudi/TJGO e manda o resumo por e-mail.

O login (usuário, senha e código de autenticação) é feito por você, uma vez,
na janela que o robô abre. O robô não guarda senha: ele só reaproveita a sessão
do navegador (pasta .perfil/) e apenas LÊ as telas, nada é alterado no Projudi.
"""
import argparse
import html
import os
import smtplib
import sys
import time
import unicodedata
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://projudi.tjgo.jus.br"
URL_LISTA_SERVENTIAS = f"{BASE}/Usuario?PaginaAtual=9"
PASTA = Path(__file__).parent
PERFIL = PASTA / ".perfil"
DEBUG = PASTA / "debug"

# --- JavaScript executado dentro da página --------------------------------

JS_LISTAR_SERVENTIAS = """
() => [...document.querySelectorAll('fieldset')].flatMap(fs => {
  const leg = fs.querySelector('legend');
  const nome = leg ? leg.textContent.trim().replace(/\\s+/g, ' ') : '';
  return [...fs.querySelectorAll('a[href*="PaginaAtual=7"]')].map(a => ({
    serventia: nome,
    perfil: a.textContent.trim().replace(/\\s+/g, ' '),
    href: a.href,
  }));
})
"""

# Acha a tabela cujo cabeçalho tem "Tipo Conclusão" e devolve as linhas.
JS_LER_CONCLUSOES = """
() => {
  const norm = s => s.replace(/\\s+/g, ' ').trim();
  const tabelas = [...document.querySelectorAll('table')];
  const t = tabelas.find(t => /tipo\\s+conclus/i.test(t.textContent) &&
                              /n[ãa]o\\s+analisadas/i.test(t.textContent) &&
                              !t.querySelector('table'));
  if (!t) return null;
  return [...t.querySelectorAll('tr')]
    .map(tr => [...tr.querySelectorAll('th,td')].map(c => norm(c.textContent)))
    .filter(r => r.length >= 3);
}
"""


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").lower()


def para_int(s: str) -> int:
    digitos = "".join(c for c in s if c.isdigit())
    return int(digitos) if digitos else 0


def tabela_para_linhas(linhas):
    """['Conclusão - Sentença','1','0'] -> dict. Ignora o cabeçalho."""
    saida = []
    for r in linhas or []:
        if sem_acento(r[0]).startswith("tipo conclus"):
            continue
        saida.append({"tipo": r[0], "nao_analisadas": para_int(r[1]),
                      "pre_analisadas": para_int(r[2])})
    return saida


# --- navegação -------------------------------------------------------------

def logado(page) -> bool:
    try:
        return page.evaluate("() => !!document.body && document.body.hasAttribute('data-usuario-id')")
    except Exception:
        return False


def garantir_login(page, esperar_s=600):
    page.goto(URL_LISTA_SERVENTIAS)
    if logado(page):
        return
    print("\n>>> Faça o login no Projudi na janela aberta (usuário, senha e código).")
    print(f">>> O robô continua sozinho assim que você entrar (espera até {esperar_s // 60} min).")
    fim = time.time() + esperar_s
    while time.time() < fim:
        if logado(page):
            page.goto(URL_LISTA_SERVENTIAS)
            if logado(page):
                return
        time.sleep(2)
    sys.exit("Tempo esgotado esperando o login.")


def frames_com(page, js):
    """Roda o js na página e nos iframes; devolve o primeiro resultado não nulo."""
    for fr in page.frames:
        try:
            res = fr.evaluate(js)
        except Exception:
            continue
        if res:
            return res
    return None


def salvar_debug(page, nome):
    DEBUG.mkdir(exist_ok=True)
    for i, fr in enumerate(page.frames):
        try:
            (DEBUG / f"{nome}_{i}.html").write_text(fr.content(), encoding="utf-8")
        except Exception:
            pass


def coletar(page, filtros):
    page.goto(URL_LISTA_SERVENTIAS)
    page.wait_for_load_state("domcontentloaded")
    destinos = frames_com(page, JS_LISTAR_SERVENTIAS) or []
    if filtros:
        destinos = [d for d in destinos
                    if any(f in sem_acento(d["serventia"]) for f in filtros)]
    if not destinos:
        salvar_debug(page, "lista_serventias")
        sys.exit("Nenhuma serventia encontrada (veja a pasta debug/).")

    resultados = []
    for d in destinos:
        rotulo = f'{d["serventia"]} — {d["perfil"]}'
        print(f"Verificando: {rotulo}")
        try:
            page.goto(d["href"])
            page.wait_for_load_state("networkidle", timeout=20000)
            linhas = frames_com(page, JS_LER_CONCLUSOES)
            if linhas is None:
                salvar_debug(page, f'conclusoes_{len(resultados)}')
                resultados.append({"rotulo": rotulo, "erro": "tabela de conclusões não encontrada",
                                   "linhas": []})
            else:
                resultados.append({"rotulo": rotulo, "erro": None,
                                   "linhas": tabela_para_linhas(linhas)})
        except Exception as e:  # segue para a próxima serventia
            resultados.append({"rotulo": rotulo, "erro": str(e), "linhas": []})
        time.sleep(1.5)  # ritmo humano, sem sobrecarregar o servidor
    return resultados


# --- relatório -------------------------------------------------------------

def montar_relatorio(resultados):
    agora = datetime.now().strftime("%d/%m/%Y %H:%M")
    total_na = sum(l["nao_analisadas"] for r in resultados for l in r["linhas"])
    total_pre = sum(l["pre_analisadas"] for r in resultados for l in r["linhas"])

    txt = [f"Conclusões no Projudi — {agora}",
           f"TOTAL: {total_na} não analisadas | {total_pre} pré-analisadas", ""]
    h = [f"<h2>Conclusões no Projudi — {agora}</h2>",
         f"<p><b>TOTAL:</b> {total_na} não analisadas | {total_pre} pré-analisadas</p>"]
    for r in resultados:
        pend = [l for l in r["linhas"] if l["nao_analisadas"] or l["pre_analisadas"]]
        txt.append(r["rotulo"])
        h.append(f'<h3 style="margin-bottom:2px">{html.escape(r["rotulo"])}</h3>')
        if r["erro"]:
            txt.append(f'  ERRO: {r["erro"]}')
            h.append(f'<p style="color:#b00">ERRO: {html.escape(r["erro"])}</p>')
        elif not pend:
            txt.append("  Nada pendente.")
            h.append("<p style='color:#666'>Nada pendente.</p>")
        else:
            h.append('<table border="1" cellpadding="4" cellspacing="0" '
                     'style="border-collapse:collapse"><tr><th>Tipo</th>'
                     '<th>Não analisadas</th><th>Pré-analisadas</th></tr>')
            for l in pend:
                txt.append(f'  {l["tipo"]}: {l["nao_analisadas"]} não analisadas, '
                           f'{l["pre_analisadas"]} pré-analisadas')
                h.append(f'<tr><td>{html.escape(l["tipo"])}</td>'
                         f'<td align="center">{l["nao_analisadas"]}</td>'
                         f'<td align="center">{l["pre_analisadas"]}</td></tr>')
            h.append("</table>")
        txt.append("")
    return total_na, total_pre, "\n".join(txt), "\n".join(h)


def enviar_email(assunto, texto, corpo_html):
    senha = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
    remetente = os.environ.get("EMAIL_REMETENTE", "fabriciocunha.adv@gmail.com")
    destino = os.environ.get("EMAIL_DESTINO", "fabriciocunha.adv@gmail.com")
    if not senha:
        print("\n(GMAIL_APP_PASSWORD não definido — e-mail NÃO enviado. Relatório abaixo.)\n")
        print(texto)
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = assunto, remetente, destino
    msg.set_content(texto)
    msg.add_alternative(corpo_html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(remetente, senha)
        s.send_message(msg)
    print(f"E-mail enviado para {destino}.")


def carregar_env():
    env = PASTA / ".env"
    if env.exists():
        for linha in env.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sempre", action="store_true",
                    help="envia e-mail mesmo sem nada pendente")
    ap.add_argument("--invisivel", action="store_true",
                    help="sem janela (só funciona com sessão já logada)")
    ap.add_argument("--todas", action="store_true",
                    help="ignora FILTRO_SERVENTIA e confere todas as serventias")
    args = ap.parse_args()
    carregar_env()

    filtros = [] if args.todas else [sem_acento(f.strip()) for f in
                                      os.environ.get("FILTRO_SERVENTIA", "").split(";") if f.strip()]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PERFIL), headless=args.invisivel, locale="pt-BR",
            viewport={"width": 1280, "height": 900})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        garantir_login(page)
        resultados = coletar(page, filtros)
        ctx.close()

    na, pre, texto, corpo = montar_relatorio(resultados)
    print("\n" + texto)
    if na or pre or args.sempre or any(r["erro"] for r in resultados):
        assunto = f"Projudi: {na} não analisadas / {pre} pré-analisadas"
        enviar_email(assunto, texto, corpo)


if __name__ == "__main__":
    main()
