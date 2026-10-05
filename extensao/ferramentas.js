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
