const $ = (id) => document.getElementById(id);
async function ocrConfig() {
  const cfg = { ocrAutomatico: true, apagarOriginal: false, ...(await chrome.storage.sync.get("ocr")).ocr };
  $("ocrAutomatico").checked = cfg.ocrAutomatico; $("apagarOriginal").checked = cfg.apagarOriginal;
  const ok = await chrome.extension.isAllowedFileSchemeAccess();
  $("acessoArquivos").innerHTML = ok
    ? "✔ Acesso a arquivos locais <b>ligado</b>: a extensão lê o PDF que o Chrome acabou de baixar."
    : "ℹ Acesso a arquivos locais <b>desligado</b>: a extensão baixa o PDF de novo, pelo mesmo endereço, usando a sua sessão. Se o Projudi não permitir repetir o download, ligue <b>“Permitir acesso a URLs de arquivo”</b> em Detalhes da extensão (botão abaixo).";
  $("salvarOcr").onclick = async () => {
    await chrome.storage.sync.set({ ocr: { ocrAutomatico: $("ocrAutomatico").checked, apagarOriginal: $("apagarOriginal").checked } });
    $("okOcr").textContent = "Salvo."; setTimeout(() => ($("okOcr").textContent = ""), 2500);
  };
  $("abrirDetalhes").onclick = () => chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
}
ocrConfig();

// ajustes que antes ficavam na janelinha da extensão
(async () => {
  const PADRAO = { filtro: "Montes Claros", notificar: true };
  const cfg = { ...PADRAO, ...(await chrome.storage.sync.get(PADRAO)) };
  $("filtro").value = cfg.filtro; $("notificar").checked = cfg.notificar;
  const salvar = () => chrome.storage.sync.set({ filtro: $("filtro").value, notificar: $("notificar").checked });
  ["filtro", "notificar"].forEach((i) => $(i).addEventListener("change", salvar));
  $("diagnostico").onclick = async () => {
    const { debug = {}, estado } = await chrome.storage.local.get(["debug", "estado"]);
    const txt = JSON.stringify({ debug, resumo: estado?.serventias?.map((s) => ({ s: s.serventia, erro: s.erro, linhas: s.linhas, n: s.processos && [s.processos.naoAnalisadas.length, s.processos.preAnalisadas.length] })) }, null, 1);
    await navigator.clipboard.writeText(txt); $("diagnostico").textContent = "Copiado! Cole no chat";
  };
})();
