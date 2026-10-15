# Simula o Google: limite de entrada gratuito de 250 mil tokens por MINUTO e POR MODELO (janela deslizante), como no erro real.
import json, re, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LIM = int(sys.argv[2]) if len(sys.argv) > 2 else 250000
JAN = {}          # (modelo) -> [(t, tokens)]
LOG = []
lock = threading.Lock()
def tokens(body): return int(len(body) / 3.5)
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/__reset':
            JAN.clear(); LOG.clear(); self.send_response(200); self.end_headers(); return
        if self.path == "/__log":
            self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(LOG).encode()); return
        self.send_response(404); self.end_headers()
    def do_POST(self):
        raw = self.rfile.read(int(self.headers["Content-Length"])).decode()
        m = re.search(r"models/([^:/]+):generateContent", self.path)
        modelo = m.group(1) if m else "?"
        n = tokens(raw)
        j = json.loads(raw)
        sist = json.dumps(j.get("systemInstruction") or j.get("config", {}).get("systemInstruction") or "", ensure_ascii=False)
        eh_parte = "DOSSIÊ FÁTICO-PROBATÓRIO DESTA PARTE" in sist
        with lock:
            now = time.time()
            a = [x for x in JAN.get(modelo, []) if now - x[0] < 60]
            usado = sum(x[1] for x in a)
            if n > LIM or usado + n > LIM:
                LOG.append({"modelo": modelo, "tok": n, "res": 429, "parte": eh_parte})
                JAN[modelo] = a
                corpo = {"error": {"code": 429, "message": f"You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: {LIM}, model: {modelo}\nPlease retry in 40s.", "status": "RESOURCE_EXHAUSTED"}}
                b = json.dumps(corpo).encode()
                self.send_response(429); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
            a.append((now, n)); JAN[modelo] = a
            LOG.append({"modelo": modelo, "tok": n, "res": 200, "parte": eh_parte, "inj": ("POSSÍVEL PROMPT INJECTION" in sist) or ("ALERTA DE SEGURANÇA — POSSÍVEL PROMPT" in raw)})
        txt = ""
        for c in j.get("contents", []):
            for p in c.get("parts", []): txt += p.get("text", "")
        fatos = sorted(set(re.findall(r"FATO-\d{3}", txt)))
        if "FATO-803" in txt and "CLASSIFICADOR DE RELEVÂNCIA" not in sist:
            k = txt.find("FATO-803"); open("/tmp/claude-0/work/teste/ctx803.txt", "a").write(f"--- {len(txt)} ---\n" + txt[max(0, k-600):k+200] + "\n")
        if "CLASSIFICADOR DE RELEVÂNCIA" in sist:
            segs = []
            for pg in re.split(r"(?=\[Página \d+ de \d+\])", txt):
                m = re.match(r"\[Página (\d+) de", pg)
                if not m: continue
                n = int(m.group(1)); tipo = re.search(r"Movimentacao \d+ - ([^\n]+)", pg); tipo = tipo.group(1) if tipo else ""
                c = "dispensavel" if re.search(r"Identificação|Residência|Procuração", tipo) else ("relevante" if "Extrato" in tipo else "essencial")
                if segs and segs[-1]["classe"] == c and segs[-1]["ate"] == n - 1: segs[-1]["ate"] = n
                else: segs.append({"de": n, "ate": n, "classe": c, "motivo": "documento sem relevância" if c == "dispensavel" else c})
            b = json.dumps({"segmentos": segs}).encode()
            LOG[-1]["p"] = "classif"; LOG[-1]["chars"] = len(txt)
            resp = {"candidates": [{"content": {"role": "model", "parts": [{"text": b.decode()}]}, "finishReason": "STOP", "index": 0}], "usageMetadata": {"promptTokenCount": n_tok if False else 1, "candidatesTokenCount": 10, "totalTokenCount": 11}, "modelVersion": modelo}
            bb = json.dumps(resp).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(bb))); self.end_headers(); self.wfile.write(bb); return
        mp = re.search(r"PARTE (\d+) DE (\d+) DOS AUTOS", txt)
        LOG[-1]["p"] = (mp.group(1) + "/" + mp.group(2)) if mp else ""
        LOG[-1]["chars"] = len(txt)
        if eh_parte:
            texto = "DOSSIÊ DA PARTE. Fatos registrados: " + ", ".join(fatos) + ". " + ("Movimento relevante com transcrição literal \"...\" (Mov. 1, Arq. 1, Pág. 1). " * 12)
        else:
            par = "\n\n".join([f"Parágrafo {i} da fundamentação, com análise do confronto probatório e citação (Mov. {i}, Arq. 1, Pág. {i}). " + "Texto de análise. " * 40 for i in range(1, 12)])
            texto = json.dumps({"processNumber": "5530114-61.2025.8.09.0166", "author": "AUTOR TESTE", "defendant": "RÉU TESTE", "judicialUnit": "Vara Teste", "pendingMatter": "Sentença",
                "actType": "SENTENÇA", "relatorio": "Relatório com os fatos: " + ", ".join(fatos) + ". " + "Narrativa do processo. " * 120,
                "fundamentacao": par, "dispositivo": "Dispositivo operacional completo. " * 20})
        resp = {"candidates": [{"content": {"role": "model", "parts": [{"text": texto}]}, "finishReason": "STOP", "index": 0}],
                "usageMetadata": {"promptTokenCount": n, "candidatesTokenCount": 3000, "totalTokenCount": n + 3000}, "modelVersion": modelo}
        b = json.dumps(resp).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
