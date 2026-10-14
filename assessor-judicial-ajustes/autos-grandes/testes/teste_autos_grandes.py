import json, os, subprocess, sys, time, urllib.request, signal
APP = "/tmp/claude-0/work/app"; PM = 8899; PS = 3000
def post(corpo, hdr=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PS}/api/generate-minute", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json", "x-gemini-api-key-pool": json.dumps(["AQ.Ab8-chave-um-aaaaaaaa", "AQ.Ab8-chave-dois-bbbbbbb", "AQ.Ab8-chave-tres-ccccccc"]), **(hdr or {})})
    with urllib.request.urlopen(req, timeout=900) as r: return r.read().decode()
def autos(chars, fatos):
    n_pag = 400; por = chars // n_pag; out = ""
    for i in range(1, n_pag + 1):
        corpo = ("Texto de movimentação processual com partes, petições, decisões e certidões. " * 200)[:por - 40]
        if i in fatos: corpo = fatos[i] + " " + corpo[len(fatos[i]) + 1:]
        out += f"[Página {i} de {n_pag}]\n{corpo}\n\n"
    return out
def main():
    mock = subprocess.Popen([sys.executable, "/tmp/claude-0/work/teste/mock_gemini.py", str(PM)] + ([os.environ["LIM"]] if os.environ.get("LIM") else []), start_new_session=True)
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PS}/api/native-key-info", timeout=2); break
            except Exception: time.sleep(1)
        else: raise SystemExit("servidor não subiu")
        fatos = {2: "FATO-001 inicial", 160: "FATO-002 meio", 300: "FATO-003 laudo", 399: "FATO-004 final"}
        base = {"customPromptText": "Prompt de teste", "actType": "auto", "executionStage": 1}
        # A) processo pequeno: uma única chamada, sem divisão
        r = json.loads(post({**base, "processText": autos(300000, {2: "FATO-001 inicial", 399: "FATO-004 final"})}))
        log = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())
        print("A) pequeno:", [(x["modelo"], x["tok"], x["res"]) for x in log]); assert all(x["res"] == 200 for x in log) and len(log) >= 1 and not any(x["parte"] for x in log)
        n_a = len(log)
        # B) processo grande (texto colado): precisa dividir e passar
        t0 = time.time()
        r = json.loads(post({**base, "processText": autos(1000000, fatos)}))
        log = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())[n_a:]
        print("B) grande:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final", x.get("chars")) for x in log], f"{time.time()-t0:.0f}s")
        texto = json.dumps(r, ensure_ascii=False)
        for f in ["FATO-001", "FATO-002", "FATO-003", "FATO-004"]: assert f in texto, f"{f} não chegou ao resultado final"
        assert any(x["parte"] and x["res"] == 200 for x in log), "não houve extração por partes"
        assert max(x["tok"] for x in log if x["res"] == 200) <= 250000
        n_b = n_a + len(log)
        # C) mesmo processo grande enviado como PDF extraído (pdfFiles)
        r = json.loads(post({**base, "pdfFiles": [{"name": "autos.pdf", "extractedText": autos(1000000, fatos)}]}))
        log = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())[n_b:]
        print("C) grande em pdfFiles:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final", x.get("chars")) for x in log])
        texto = json.dumps(r, ensure_ascii=False)
        for f in ["FATO-001", "FATO-002", "FATO-003", "FATO-004"]: assert f in texto, f"{f} não chegou (pdfFiles)"
        print("OK")
    finally:
        import os as _o
        for p in (srv, mock):
            try: _o.killpg(p.pid, signal.SIGKILL)
            except Exception:
                try: p.kill()
                except Exception: pass
main()
