"""Mesa de Audiência: a extensão (studio-base.js) dirigindo o APP REAL (HearingWorkbenchModal) com a IA simulada.
Confere: detecta o briefing pronto, usa a data/hora da pauta, gera/abre a ata e devolve o resultado (sem esperar 12 min)."""
import base64, glob, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
EXT = Path(__file__).parent.parent / "extensao"
APP = os.environ.get("APP_DIR", "/home/user/assessor-judicial")
AQUI = APP + "/testes/gigantes"
PM, PS, PV = 8897, 3000, 5198
sys.path.insert(0, AQUI)
from gerar_pdf import processo
from playwright.sync_api import sync_playwright

def esperar_http(url, n=120):
    for _ in range(n):
        try: urllib.request.urlopen(url, timeout=2); return
        except Exception: time.sleep(1)
    raise SystemExit("não subiu: " + url)

pdf = processo(40, injecao=False, vazias=())
procs = []
try:
    procs.append(subprocess.Popen([sys.executable, AQUI + "/mock_gemini.py", str(PM), "250000", "3000"], start_new_session=True))
    env = {**os.environ, "GOOGLE_GEMINI_BASE_URL": f"http://127.0.0.1:{PM}", "NODE_ENV": "production", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost", "COTA_PAUSA_MS": "1500", "AUTOS_GRANDES_PAUSA_MS": "1500"}
    procs.append(subprocess.Popen(["npx", "tsx", "server.ts"], cwd=APP, env=env, stdout=open("/tmp/claude-0/work/teste/server_mesa.log", "w"), stderr=subprocess.STDOUT, start_new_session=True))
    procs.append(subprocess.Popen(["npx", "vite", "--config", "testes/gigantes/vite.config.ts"], cwd=APP, stdout=open("/tmp/claude-0/work/teste/vite_mesa.log", "w"), stderr=subprocess.STDOUT, start_new_session=True))
    esperar_http(f"http://127.0.0.1:{PS}/api/native-key-info"); esperar_http(f"http://127.0.0.1:{PV}/testes/gigantes/mod.html")
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0], args=["--no-sandbox"])
        ctx = br.new_context(viewport={"width": 1400, "height": 950})
        ctx.route("**/api/**", lambda r: r.continue_(headers={**r.request.headers, "x-gemini-api-key": "AQ.Ab8-chave-um-aaaaaaaa", "x-gemini-api-key-pool": json.dumps(["AQ.Ab8-chave-um-aaaaaaaa"])}))
        ctx.add_init_script("localStorage.setItem('agaia_native_key_allowed_teste-uid','true');")
        pg = ctx.new_page(); pg.set_default_timeout(60000); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
        pg.goto(f"http://127.0.0.1:{PV}/testes/gigantes/mod.html?m=mesa"); pg.wait_for_timeout(3000)
        pg.evaluate("window.chrome = { runtime: { onMessage: { addListener(f) { window.__ouvinte = f } } }, notifications: null, storage: { local: { set(o) { window.__st = Object.assign(window.__st || {}, o); return Promise.resolve() } } } }")
        pg.add_script_tag(path=str(EXT / "studio-base.js"))
        pg.evaluate("([b64]) => { window.__ouvinte({ acao: 'studio-parte', id: 'a1', i: 0, n: 1, b64 }, {}, () => {}); }", [base64.b64encode(pdf).decode()])
        t0 = time.time()
        pg.evaluate("() => window.__ouvinte({ acao: 'studio-analisar', modo: 'mesa', reqId: 'r1', arquivoId: 'a1', nome: '5731633.87-OCR.pdf', comAta: true, audData: '2026-11-18', audHora: '14:30' }, {}, () => {})")
        pg.wait_for_function("window.__st && window.__st.studio_res_r1", timeout=420000)
        r = pg.evaluate("window.__st.studio_res_r1"); dt = round(time.time() - t0)
        print("resultado:", r, dt, "s")
        dh = pg.evaluate("[document.querySelector('input[type=date]')?.value, document.querySelector('input[type=time]')?.value]")
        print("data/hora na Mesa:", dh, "| erros de página:", erros[:2])
        pg.keyboard.press("Escape"); pg.wait_for_timeout(800); abas = {}
        for k, rx in [("briefing", "1. Briefing"), ("roteiro", "2. Roteiro"), ("deliberacoes", "3. Delibera"), ("sentenca", "4. Senten"), ("ata", "5. Ata")]:
            pg.get_by_role("button", name=rx).first.click(); pg.wait_for_timeout(1200)
            abas[k] = pg.evaluate("document.querySelector('.mesa-escura')?.innerText || document.body.innerText")
        json.dump(abas, open("/tmp/claude-0/work/mob/abas_mesa.json", "w"), ensure_ascii=False, indent=1)
        pg.screenshot(path="/tmp/claude-0/work/mob/mesa_real.png")
        assert r["ok"], r
        assert dh == ["2026-11-18", "14:30"], dh
        print("OK")
        br.close()
finally:
    for pr in procs:
        try: os.killpg(pr.pid, 15)
        except Exception: pass
