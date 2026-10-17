import json, os, subprocess, sys, time, urllib.request, base64
APP = "/tmp/claude-0/work/app"; PM = 8899; PS = 3000
def post(corpo, rota="/api/generate-minute"):
    req = urllib.request.Request(f"http://127.0.0.1:{PS}{rota}", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json", "x-gemini-api-key": "AQ.Ab8-chave-um-aaaaaaaa", "x-gemini-api-key-pool": json.dumps(["AQ.Ab8-chave-um-aaaaaaaa"])})
    with urllib.request.urlopen(req, timeout=900) as r: return json.loads(r.read().decode())
def log_(): return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PM}/__log").read())
def reset(): urllib.request.urlopen(f"http://127.0.0.1:{PM}/__reset")
txt = "".join(f"[Página {i} de 40]\nMovimentacao {i} - Petição\n" + "Texto de conteudo processual com partes e pedidos. " * 60 + "\n\n" for i in range(1, 41))
def main():
    mock = subprocess.Popen([sys.executable, "/tmp/claude-0/work/teste/mock_gemini.py", str(PM)], start_new_session=True)
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server_cob.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PS}/api/native-key-info", timeout=2); break
            except Exception: time.sleep(1)
        else: raise SystemExit("servidor não subiu")
        base = {"customPromptText": "Prompt de teste", "actType": "auto", "executionStage": 1, "processText": txt}
        reset(); r = post({**base, "coberturaLeitura": {"escolha": "seguir", "paginasOcr": 0, "arquivos": [{"nome": "autos.pdf", "totalPaginas": 100, "semTexto": [12, 13, 14, 40], "naoLidas": []}]}})
        c = r.get("coberturaLeitura"); print("A)", c, [x.get("cob") for x in log_()])
        assert c and c["lacunas"][0]["paginas"] == "12-14, 40" and c["completa"] is False and all(x.get("cob") for x in log_())
        reset(); r = post({**base, "coberturaLeitura": {"escolha": "ocr", "paginasOcr": 4, "arquivos": [{"nome": "autos.pdf", "totalPaginas": 100, "semTexto": [], "naoLidas": []}]}})
        c = r.get("coberturaLeitura"); print("B)", c, [x.get("cob") for x in log_()])
        assert c and c["completa"] is True and c["paginasOcr"] == 4 and not any(x.get("cob") for x in log_())
        reset(); r = post(base); print("C)", r.get("coberturaLeitura")); assert not r.get("coberturaLeitura")
        img = base64.b64encode(b"\xff\xd8\xff\xe0fakejpeg").decode()
        reset(); r = post({**base, "coberturaLeitura": {"escolha": "visual", "arquivos": [{"nome": "autos.pdf", "totalPaginas": 100, "semTexto": [50], "naoLidas": []}]}, "paginasImagens": [{"arquivo": "autos.pdf", "pagina": 12, "data": img}, {"arquivo": "autos.pdf", "pagina": 13, "data": img}]})
        c = r.get("coberturaLeitura"); print("D)", c); assert c and c["paginasImagem"] == 2 and c["lacunas"][0]["paginas"] == "50"
        # OCR endpoint não quebra
        o = post({"images": [{"pagina": 3, "data": img}]}, "/api/ocr-paginas"); print("E)", o)
        assert "paginas" in o
        cob = {"escolha": "seguir", "paginasOcr": 0, "arquivos": [{"nome": "autos.pdf", "totalPaginas": 100, "semTexto": [12, 13, 14, 40], "naoLidas": []}]}
        reset(); t = post({"processText": txt, "coberturaLeitura": cob, "actType": "auto"}, "/api/generate-minute-turbo")
        c = t.get("coberturaLeitura"); print("F) turbo", c and c["lacunas"], [x.get("cob") for x in log_()])
        assert c and c["lacunas"][0]["paginas"] == "12-14, 40" and all(x.get("cob") for x in log_())
        reset(); t = post({"processText": txt, "actType": "auto"}, "/api/generate-minute-turbo"); print("F2)", t.get("coberturaLeitura")); assert not t.get("coberturaLeitura") and not any(x.get("cob") for x in log_())
        reset(); l = post({"draftText": "Minuta do assessor de teste. " * 30, "processText": txt, "coberturaLeitura": cob, "paginasImagens": [{"arquivo": "a.pdf", "pagina": 12, "data": img}]}, "/api/audit-assessor-draft")
        c = l.get("coberturaLeitura"); print("G) lupa", c and (c["lacunas"], c["paginasImagem"]), [x.get("cob") for x in log_()])
        assert c and c["lacunas"][0]["paginas"] == "12-14, 40" and c["paginasImagem"] == 1 and log_()[-1].get("cob")
        print("OK")
    finally:
        for p in (srv, mock):
            try: os.killpg(p.pid, 9)
            except Exception: pass
main()
