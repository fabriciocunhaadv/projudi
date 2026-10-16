import json, os, subprocess, sys, time, urllib.request, urllib.error, signal
APP = "/tmp/claude-0/work/app"; PM = 8899; PS = 3000
def post(corpo):
    req = urllib.request.Request(f"http://127.0.0.1:{PS}/api/generate-minute", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json", "x-gemini-api-key-pool": json.dumps(["AQ.Ab8-chave-um-aaaaaaaa", "AQ.Ab8-chave-dois-bbbbbbb", "AQ.Ab8-chave-tres-ccccccc"])})
    with urllib.request.urlopen(req, timeout=900) as r: return r.read().decode()
def paginas(spec, total):
    """spec: dict página -> (tipo, tamanho, texto_inicio, texto_meio). Páginas fora do spec: essencial de 1800 caracteres."""
    out = ""
    for i in range(1, total + 1):
        tipo, tam, ini, meio = spec.get(i, ("Petição", 1800, "", ""))
        corpo = f"Movimentacao {i} - {tipo}\n" + ini + " " + ("Texto de conteúdo processual com partes, pedidos, decisões e certidões. " * 400)
        corpo = corpo[:tam]
        if meio: p = tam // 2; corpo = corpo[:p] + " " + meio + " " + corpo[p + len(meio) + 2:]
        out += f"[Página {i} de {total}]\n{corpo}\n\n"
    return out
def log_(): return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())
def reset(): urllib.request.urlopen(f"http://127.0.0.1:{PM}/__reset")
def main():
    mock = subprocess.Popen([sys.executable, "/tmp/claude-0/work/teste/mock_gemini.py", str(PM)], start_new_session=True)
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost", "AUTOS_GRANDES_PAUSA_MS": "3000"}
    srv = subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PS}/api/native-key-info", timeout=2); break
            except Exception: time.sleep(1)
        else: raise SystemExit("servidor não subiu")
        base = {"customPromptText": "Prompt de teste", "actType": "auto", "executionStage": 1}
        import random; random.seed(7)
        def unico(n): return " ".join("".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(random.randint(3, 9))) for _ in range(n))
        def pag(total, bloco=""):
            out = ""
            for i in range(1, total + 1):
                cab = "".join(f"CABEÇALHO REPETIDO {k} DO TRIBUNAL DE JUSTIÇA DO ESTADO DE GOIÁS COMARCA DE TESTE VARA TESTE PROCESSO JUDICIAL ELETRÔNICO PROJUDI PÁGINA GERADA AUTOMATICAMENTE {'x' * 40}\n" for k in range(4))
                fato = f"FATO-{i:03d} " if i in (2, 200, 399) else ""
                out += f"[Página {i} de {total}]\nMovimentacao {i} - Petição\n{cab}{fato}{unico(215)}\n\n"
            return out
        # E) só a compactação sem perda basta: nenhuma página é cortada, uma chamada de IA
        reset(); r = json.loads(post({**base, "processText": pag(400)})); L = log_(); t = json.dumps(r, ensure_ascii=False)
        print("E) compactação:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final") for x in L])
        for f in ("FATO-002", "FATO-200", "FATO-399"): assert f in t, f
        assert L[-1]["res"] == 200 and L[-1]["tok"] <= 250000 and not any(x.get("p") == "classif" for x in L), L
        # D) tudo essencial e único: dossiê por partes (antes: erro "use chave com faturamento")
        reset()
        def pag2(total):
            out = ""
            for i in range(1, total + 1):
                fato = f"FATO-{i:03d} " if i in (2, 100, 250, 399) else ""
                out += f"[Página {i} de {total}]\nMovimentacao {i} - Petição\n{fato}{unico(380)}\n\n"
            return out
        r = json.loads(post({**base, "processText": pag2(400)})); L = log_(); t = json.dumps(r, ensure_ascii=False)
        print("D) dossiê:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final") for x in L])
        assert L[-1]["res"] == 200 and L[-1]["tok"] <= 250000 and any(x["res"] == 200 and "/" in (x.get("p") or "") for x in L), L
        for f in ("FATO-002", "FATO-100", "FATO-250", "FATO-399"): assert f in t, f + " deve constar do dossiê"
        print("OK")
    finally:
        for p in (srv, mock):
            try: os.killpg(p.pid, signal.SIGKILL)
            except Exception: pass
main()
