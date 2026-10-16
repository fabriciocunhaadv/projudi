import json, os, subprocess, sys, time, urllib.request
APP = "/tmp/claude-0/work/app"; PM = 8899; PS = 3000
def post(corpo):
    req = urllib.request.Request(f"http://127.0.0.1:{PS}/api/generate-minute", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json", "x-gemini-api-key-pool": json.dumps(["AQ.Ab8-chave-um-aaaaaaaa"])})
    with urllib.request.urlopen(req, timeout=900) as r: return json.loads(r.read().decode())
def paginas(total, injecao=None, marcadores=True, tam=2600):
    out = ""
    for i in range(1, total + 1):
        corpo = f"Movimentacao {i} - " + ("Documento de Identificação" if 10 <= i < 260 else "Petição") + "\n" + ("Texto de conteudo processual com partes, pedidos e decisoes. " * 100)
        corpo = corpo[:tam]
        if i == 2: corpo = "FATO-001 inicial " + corpo
        if injecao and i == 3: corpo = corpo[:500] + " " + injecao + " " + corpo[500:]
        out += (f"[Página {i} de {total}]\n" if marcadores else "") + corpo + "\n\n"
    return out
def log_(): return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())
def reset(): urllib.request.urlopen(f"http://127.0.0.1:{PM}/__reset")
def post2(path, corpo):
    req = urllib.request.Request(f"http://127.0.0.1:{PS}{path}", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json", "x-gemini-api-key": "chave-teste", "x-api-key": "chave-teste"})
    with urllib.request.urlopen(req, timeout=900) as r: return json.loads(r.read().decode().strip())
def main():
    mock = subprocess.Popen([sys.executable, "/tmp/claude-0/work/teste/mock_gemini.py", str(PM)], start_new_session=True)
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost", "AUTOS_GRANDES_PAUSA_MS": "3000", "COTA_PAUSA_MS": "3000"}
    srv = subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server_mesa.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PS}/api/native-key-info", timeout=2); break
            except Exception: time.sleep(1)
        else: raise SystemExit("servidor nao subiu")
        grande = paginas(420, None, True, 2600)   # ~1,1 milhao de caracteres (> limite gratuito de entrada)
        print("tamanho", len(grande))
        r = post2("/api/hearing-copilot", {"actionType": "preliminary_minutes", "processNumber": "5000001-11.2026.8.09.0166", "caseText": grande})
        print("ATA:", list(r.keys()), (r.get("data") or {}).get("pontosAtencao", [])[:1])
        assert r.get("success") and any(str(x.get("texto", "")).startswith("[SISTEMA]") for x in (r["data"].get("pontosAtencao") or [])), r
        r = post2("/api/hearing-copilot", {"actionType": "briefing", "processNumber": "x", "caseText": paginas(40)})
        assert r.get("success"), r
        r = post2("/api/hearing-copilot", {"actionType": "desconhecido"})
        assert r.get("error"), r
        print("OK")
    finally:
        for p in (srv, mock):
            try: os.killpg(p.pid, 9)
            except Exception: pass
main()
