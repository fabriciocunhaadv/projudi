// Janelinha da extensão: só os atalhos e a situação da última atualização do painel (sem serventias, comarcas ou listas de processos).
const $ = (id) => document.getElementById(id);
const abrir = (arq) => { chrome.tabs.create({ url: chrome.runtime.getURL(arq) }); window.close(); };
$("painel").onclick = () => abrir("painel.html");
$("ferramentas").onclick = () => abrir("ferramentas.html");
$("ocr").onclick = () => abrir("ocr.html");
$("pauta").onclick = () => abrir("pauta.html");

function situacao(estado) {
  const caixa = $("situacao"); caixa.className = "situacao";
  if (!estado) { $("sitTitulo").textContent = "Sem verificação ainda"; $("sitQuando").textContent = "Abra o painel e clique em “Verificar agora”."; return; }
  const quando = estado.quando ? new Date(estado.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const t = { ok: ["ok", "Última atualização concluída"], verificando: ["andamento", "Verificando agora…"], deslogado: ["aviso", "Projudi sem login"], erro: ["erro", "A última atualização deu erro"] }[estado.status] || ["aviso", "Situação desconhecida"];
  caixa.classList.add(t[0]); $("sitTitulo").textContent = t[1];
  $("sitQuando").textContent = estado.status === "verificando" ? "Pode levar alguns minutos." : estado.status === "deslogado" ? "Entre no Projudi e verifique de novo no painel." : estado.status === "erro" ? (estado.mensagem || "") : (quando ? "em " + quando : "");
}
(async () => {
  situacao((await chrome.storage.local.get("estado")).estado);
  chrome.storage.onChanged.addListener((c, area) => area === "local" && c.estado && situacao(c.estado.newValue));
})();
