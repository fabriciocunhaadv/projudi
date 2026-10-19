"""Esteira: audiências da Mesa concluídas ganham 'incluir na pauta'; o botão abre a pauta só com as marcadas."""
import glob, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
RAIZ = Path(__file__).parent.parent / "extensao"
tmp = Path(tempfile.mkdtemp()); ext = tmp / "ext"; shutil.copytree(RAIZ, ext)
exe = os.environ.get("CHROMIUM_PATH") or glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")[0]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(tmp / "perfil"), executable_path=exe, headless=False, args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    base = f"chrome-extension://{sw.url.split('/')[2]}/"
    pg = ctx.new_page(); pg.goto(base + "ferramentas.html")
    ids = pg.evaluate("""async () => {
      const m = await import('./esteira-banco.js'); const out = [];
      for (const [proc, h] of [['5305719.52', '14:00'], ['5498266.22', '14:20'], ['5417882.72', '14:30']]) {
        const id = await m.enfileirar({ processo: proc, modo: 'mesa', pdfNome: 'x.pdf', audData: '2026-10-15', audHora: h, audPromovente: 'AUTORA', audPromovido: 'INSS' }, new Uint8Array([1]));
        await m.atualizar(id, { estado: id === out[1] ? 'erro' : 'concluido' }); out.push(id);
      }
      await m.atualizar(out[2], { estado: 'analisando' });
      return out;
    }""")
    pg2 = ctx.new_page(); pg2.goto(base + "esteira.html"); pg2.wait_for_timeout(2000)
    caixas = pg2.locator("input[data-pauta]"); print("caixas de pauta:", caixas.count())
    assert caixas.count() == 2, "só as audiências concluídas ganham a caixa (a que está analisando não)"
    assert pg2.locator("#pautaBarra").is_visible() and pg2.locator("#pautaGerar").is_disabled()
    caixas.nth(0).check(); pg2.wait_for_timeout(500)
    assert pg2.locator("#pautaN").inner_text() == "1" and pg2.locator("#pautaGerar").is_enabled()
    pg2.locator("#pautaTodos").click(); pg2.wait_for_timeout(500)
    assert pg2.locator("#pautaN").inner_text() == "2"
    with ctx.expect_page() as nova:
        pg2.locator("#pautaGerar").click()
    pp = nova.value; pp.wait_for_load_state(); print("abriu:", pp.url.split("/")[-1][:40])
    assert "pauta-doc.html?ids=" in pp.url and pp.url.count(",") == 1, pp.url
    pp.wait_for_timeout(1500); t = pp.inner_text("#saida"); print(t[:300])
    assert "PAUTA DIA 15 DE OUTUBRO DE 2026" in t and "14h00" in t, t
    ctx.close()
print("OK")
