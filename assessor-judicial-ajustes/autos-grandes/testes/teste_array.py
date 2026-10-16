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
    mock = subprocess.Popen([sys.executable, "/tmp/claude-0/work/teste/mock_gemini.py", str(PM)], start_new_session=True, env={**os.environ, "MOCK_ARRAY": "1"})
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost", "AUTOS_GRANDES_PAUSA_MS": "3000"}
    srv = subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PS}/api/native-key-info", timeout=2); break
            except Exception: time.sleep(1)
        else: raise SystemExit("servidor não subiu")
        base = {"customPromptText": "Prompt de teste", "actType": "auto", "executionStage": 1}
        txt = "".join(f"[Página {i} de 30]\nMovimentacao {i} - Petição\nFATO-00{i % 9} conteudo {i}\n\n" for i in range(1, 31))
        r = json.loads(post({**base, "processText": txt}))
        m = r.get("minute") or r
        print("relatorio:", str(m.get("relatorio"))[:120]); print("fundamentacao:", str(m.get("fundamentacao"))[:120])
        assert "processing" not in str(m.get("relatorio")).lower() and "em processamento" not in str(m.get("relatorio")) and str(m.get("relatorio")).startswith("Relatório com os fatos"), m.get("relatorio")
        assert not str(m.get("fundamentacao")).lstrip().startswith("[") , "a fundamentação não pode ser o JSON bruto"
        print("OK")
    finally:
        for p in (srv, mock):
            try: os.killpg(p.pid, signal.SIGKILL)
            except Exception: pass
main()
