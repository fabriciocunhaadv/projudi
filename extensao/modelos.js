import { montarPdf, TIPOS, tipoCanonico, nomePadrao, semBarra } from "./modelos-pdf.js";
import { enviarBase } from "./studio-cliente.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function gerar(serv, dados) {
  const nome = semBarra(($(`n-${serv.i}`).value || nomePadrao(serv.nome)));
  const bytes = await montarPdf({ serventia: serv.nome, modelos: dados.modelos.map((m) => ({ ...m, serventia: serv.nome })) });
  return { nome: nome + ".pdf", bytes };
}

async function desenhar() {
  const { modelos } = await chrome.storage.local.get("modelos");
  const auto = (await chrome.storage.sync.get("automacao")).automacao || {};
  const servs = Object.entries(modelos?.serventias || {});
  $("vazio").hidden = servs.length > 0;
  $("lista").innerHTML = servs.map(([nome, d], i) => {
    const cont = TIPOS.map((t) => `${t}: ${d.modelos.filter((m) => tipoCanonico(m.tipo) === t).length}`).join(" · ");
    return `<div class="serv"><h2>${esc(nome)}</h2><div class="dica">${d.modelos.length} modelo(s) — ${cont}${modelos.atualizadoEm ? " — capturado em " + new Date(modelos.atualizadoEm).toLocaleString("pt-BR") : ""}</div>` +
      `<label>Nome do arquivo na base de conhecimento:<input type="text" id="n-${i}" value="${esc(auto[nome]?.arquivoModelos || nomePadrao(nome))}"></label>` +
      `<button data-a="baixar" data-i="${i}">Baixar PDF</button><button data-a="enviar" data-i="${i}">Enviar ao Studio (substitui o antigo)</button><div class="msg" id="m-${i}"></div></div>`;
  }).join("");
  $("lista").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const i = +b.dataset.i, [nome, dados] = servs[i], msg = $(`m-${i}`);
    b.disabled = true; msg.className = "msg"; msg.textContent = "Montando o PDF…";
    try {
      const { nome: arq, bytes } = await gerar({ i, nome }, dados);
      if (b.dataset.a === "baixar") {
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        await chrome.downloads.download({ url, filename: arq, saveAs: false, conflictAction: "uniquify" });
        msg.className = "msg ok"; msg.textContent = "PDF salvo em Downloads.";
      } else {
        msg.textContent = "Enviando ao Studio (pode levar alguns minutos)…";
        let r;
        try { r = await enviarBase(arq, bytes, b.dataset.substituir === "1"); }
        catch (err) {
          if (!err.existe) throw err;
          msg.className = "msg erro";
          msg.innerHTML = `${esc(err.message)}<br><button data-a="enviar" data-substituir="1" data-i="${i}">Excluir o antigo e enviar agora</button>`;
          document.body.dataset.existe = "1"; b.disabled = false; return;
        }
        msg.className = "msg ok"; msg.textContent = `${r.substituiu ? "Documento antigo substituído" : "Documento cadastrado"} na base de conhecimento.`;
        document.body.dataset.enviado = JSON.stringify(r);
      }
    } catch (err) { msg.className = "msg erro"; msg.textContent = err.message; document.body.dataset.erro = err.message; }
    b.disabled = false;
  };
  document.body.dataset.pronto = "1";
}
desenhar();

// ---------- captura no Projudi ----------
async function abaProjudi() {
  const padroes = chrome.runtime.getManifest().content_scripts.find((c) => c.js.includes("modelos-projudi.js")).matches;
  const abas = await chrome.tabs.query({ url: padroes });
  for (const a of abas) { try { if ((await chrome.tabs.sendMessage(a.id, { acao: "modelos-ping" }, { frameId: 0 }))?.ok) return a; } catch (e) { /* aba sem a extensão */ } }
  throw new Error("abra o Projudi (e entre com a sua conta) numa aba e tente de novo");
}
chrome.runtime.onMessage.addListener((m) => {
  if (m?.acao !== "modelos-progresso") return;
  $("progresso").className = "msg"; $("progresso").textContent = m.txt + (m.total ? ` (${m.feitos}/${m.total})` : "");
});
$("atualizar").onclick = async () => {
  $("atualizar").disabled = true; $("cancelarCap").hidden = false; $("mudancas").textContent = "";
  try {
    const aba = await abaProjudi();
    $("cancelarCap").onclick = () => chrome.tabs.sendMessage(aba.id, { acao: "modelos-cancelar" }, { frameId: 0 });
    const r = await chrome.tabs.sendMessage(aba.id, { acao: "modelos-capturar" }, { frameId: 0 });
    if (!r?.ok) throw new Error(r?.erro || "a captura não terminou");
    $("progresso").className = "msg ok"; $("progresso").textContent = `Pronto: ${r.total} modelo(s) lidos${r.falhas ? `, ${r.falhas} com falha` : ""}. ${r.aviso || ""}`;
    const d = r.diff, nomes = (ids) => ids.length;
    $("mudancas").innerHTML = `Desde a captura anterior: <b>${nomes(d.novos)}</b> novo(s), <b>${nomes(d.alterados)}</b> alterado(s), <b>${d.excluidos.length}</b> excluído(s) no Projudi.` +
      (d.novos.length + d.alterados.length + d.excluidos.length ? " <b>Atualize o PDF da vara na base do Studio</b> (o app não edita: exclua o documento antigo e envie o novo)." : "");
    document.body.dataset.capturado = JSON.stringify(r);
    await desenhar();
  } catch (e) { $("progresso").className = "msg erro"; $("progresso").textContent = e.message; document.body.dataset.erro = e.message; }
  $("atualizar").disabled = false; $("cancelarCap").hidden = true;
};
