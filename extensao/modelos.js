import { montarPdf, TIPOS, tipoCanonico } from "./modelos-pdf.js";
const STUDIO_URL = "https://assessor-judicial.ai.studio/";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nomePadrao = (serv) => `Modelos - ${serv.replace(/^.*?\s-\s(?:Vara\s+(?:de|do|da)\s+)?/i, "").trim() || serv} - Decisões, Despachos e Sentenças`;
const semBarra = (s) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const b64De = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

async function acharStudio() {
  const padroes = chrome.runtime.getManifest().content_scripts.find((c) => c.js.includes("studio-base.js")).matches;
  let [aba] = await chrome.tabs.query({ url: padroes });
  if (!aba) aba = await chrome.tabs.create({ url: STUDIO_URL, active: false });
  for (let i = 0; i < 60; i++) {     // espera a página carregar e o script da extensão responder
    try { if ((await chrome.tabs.sendMessage(aba.id, { acao: "studio-ping" }))?.ok) return aba; } catch (e) { /* ainda carregando */ }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error("abra o app Assessor Judicial (e entre com a sua conta) e tente de novo");
}

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
        const aba = await acharStudio();
        const r = await chrome.tabs.sendMessage(aba.id, { acao: "studio-enviar-base", nome: arq, b64: b64De(bytes) });
        if (!r?.ok) throw new Error(r?.erro || "o app não confirmou o envio");
        msg.className = "msg ok"; msg.textContent = `${r.substituiu ? "Documento antigo substituído" : "Documento cadastrado"} na base de conhecimento.`;
        document.body.dataset.enviado = JSON.stringify(r);
      }
    } catch (err) { msg.className = "msg erro"; msg.textContent = err.message; document.body.dataset.erro = err.message; }
    b.disabled = false;
  };
  document.body.dataset.pronto = "1";
}
desenhar();
