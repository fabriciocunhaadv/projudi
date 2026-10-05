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
        const r = await enviarBase(arq, bytes);
        msg.className = "msg ok"; msg.textContent = `${r.substituiu ? "Documento antigo substituído" : "Documento cadastrado"} na base de conhecimento.`;
        document.body.dataset.enviado = JSON.stringify(r);
      }
    } catch (err) { msg.className = "msg erro"; msg.textContent = err.message; document.body.dataset.erro = err.message; }
    b.disabled = false;
  };
  document.body.dataset.pronto = "1";
}
desenhar();
