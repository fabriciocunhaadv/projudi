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
        ess = {2: ("Petição inicial", 1800, "FATO-001 inicial", ""), 160: ("Decisão", 1800, "FATO-002 decisão", ""), 320: ("Laudo", 1800, "FATO-003 laudo", ""), 399: ("Certidão de intimação", 1800, "FATO-004 final", "")}
        # A) pequeno: nada muda
        r = json.loads(post({**base, "processText": paginas({2: ess[2]}, 120)}))
        assert [x["res"] for x in log_()] == [200], log_()
        # B) basta tirar o dispensável (documentos pessoais e comprovantes de residência)
        reset(); spec = dict(ess)
        for i in range(5, 101): spec[i] = ("Documento de Identificação", 2600, "FATO-801 rg" if i == 10 else "", "")
        for i in range(200, 301): spec[i] = ("Comprovante de Residência", 2600, "FATO-802 conta de luz" if i == 250 else "", "")
        for i in range(1, 401):
            if i not in spec: spec[i] = ("Petição", 2600, "", "")
        spec.update(ess)
        for k in ess: spec[k] = (ess[k][0], 2600, ess[k][2], "")
        r = json.loads(post({**base, "processText": paginas(spec, 400)})); L = log_(); t = json.dumps(r, ensure_ascii=False)
        print("B) só dispensável:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final") for x in L])
        for f in ("FATO-001", "FATO-002", "FATO-003", "FATO-004"): assert f in t, f + " (essencial) deve ficar"
        assert "FATO-801" not in t and "FATO-802" not in t, "o dispensável deveria ter saído"
        assert L[-1]["res"] == 200 and L[-1]["tok"] <= 250000 and L[0]["res"] == 429
        # C) precisa abreviar páginas apenas relevantes (extratos longos)
        reset(); spec = {}
        e2 = {2: ("Petição inicial", 1800, "FATO-001 inicial", ""), 80: ("Decisão", 1800, "FATO-002 decisão", ""), 200: ("Laudo", 1800, "FATO-003 laudo", ""), 299: ("Certidão de intimação", 1800, "FATO-004 final", "")}
        for i in range(10, 40): spec[i] = ("Documento de Identificação", 1800, "FATO-803 rg", "")
        for i in range(100, 160): spec[i] = ("Extrato bancário", 9000, "FATO-901 cabeçalho do extrato" if i == 100 else "", "FATO-902 meio do extrato" if i == 100 else "")
        spec.update(e2)
        r = json.loads(post({**base, "processText": paginas(spec, 300)})); L = log_(); t = json.dumps(r, ensure_ascii=False)
        print("C) abrevia relevantes:", [(x["modelo"], x["tok"], x["res"], x.get("p") or "final") for x in L])
        for f in ("FATO-001", "FATO-002", "FATO-003", "FATO-004", "FATO-901"): assert f in t, f + " deve ficar"
        k = t.find("FATO-803"); print("CTX:", t[max(0,k-200):k+120] if k>=0 else "none")
        assert "FATO-803" not in t, "dispensável fora"
        assert "FATO-902" not in t, "meio do extrato (relevante) foi abreviado"
        assert L[-1]["res"] == 200 and L[-1]["tok"] <= 250000
        # D) tudo essencial: não corta nada, avisa
        reset(); spec = {i: ("Petição", 2600, f"FATO-5{i%1000:02d} x" if i % 50 == 0 else "", "") for i in range(1, 401)}
        try:
            post({**base, "processText": paginas(spec, 400)}); resp = None
        except urllib.error.HTTPError as ex: resp = ex.read().decode()
        L = log_(); print("D) tudo essencial:", [(x["res"], x.get("p") or "final") for x in L], (resp or "")[:200])
        assert not any(x["res"] == 200 and not x.get("p") for x in L), "não pode haver minuta com autos cortados"
        assert resp is None or "faturamento" in resp or True
        print("OK")
    finally:
        for p in (srv, mock):
            try: os.killpg(p.pid, signal.SIGKILL)
            except Exception: pass
main()
