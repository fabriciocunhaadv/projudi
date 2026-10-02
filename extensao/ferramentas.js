const F = ProjudiFormatacao;
const $ = (id) => document.getElementById(id);
const CAMPOS = [["fontFamily", "Fonte"], ["fontSize", "Tamanho"], ["textAlign", "Alinhamento"], ["textIndent", "Recuo da 1ª linha"],
  ["marginLeft", "Margem esquerda"], ["marginTop", "Espaço acima"], ["marginBottom", "Espaço abaixo"], ["lineHeight", "Entrelinha"]];
const TITULOS = { texto: "Texto (parágrafos)", citacao: "Citações", titulo: "Títulos (alinhamento vem do original)" };

function desenhar(cfg) {
  $("auto").checked = cfg.auto; $("detectarCitacao").checked = cfg.detectarCitacao; $("removerVazios").checked = cfg.removerVazios;
  $("perfis").innerHTML = ["texto", "citacao", "titulo"].map((t) =>
    `<fieldset><legend>${TITULOS[t]}</legend>${CAMPOS.map(([k, nome]) =>
      `<label>${nome}<input data-t="${t}" data-k="${k}" value="${(cfg[t][k] || "").replace(/"/g, "&quot;")}"></label>`).join("")}</fieldset>`).join("");
}
function ler() {
  const cfg = F.mesclar();
  cfg.auto = $("auto").checked; cfg.detectarCitacao = $("detectarCitacao").checked; cfg.removerVazios = $("removerVazios").checked;
  document.querySelectorAll("#perfis input").forEach((i) => (cfg[i.dataset.t][i.dataset.k] = i.value.trim()));
  return cfg;
}
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

(async () => {
  desenhar(F.mesclar((await chrome.storage.sync.get("formatacao")).formatacao));
  chrome.storage.onChanged.addListener((c, a) => { if (a === "sync" && c.formatacao) desenhar(F.mesclar(c.formatacao.newValue)); });
  $("salvar").onclick = async () => { await chrome.storage.sync.set({ formatacao: ler() }); $("ok").textContent = "Salvo."; setTimeout(() => ($("ok").textContent = ""), 2500); };
  $("restaurar").onclick = async () => { await chrome.storage.sync.remove("formatacao"); desenhar(F.mesclar()); };
})();
