// Trata, a pedido do Studio, um PDF inserido pelo usuário: confere página por página, faz OCR só nas páginas que são imagem (inclusive as que têm só o carimbo
// do Projudi por cima) e devolve ao Studio o TEXTO. O PDF chega em partes (mensagens do script do Studio), nada é enviado à internet e nada é gravado.
import { fazerOcr, descreverErro } from "./ocr-motor.js";
import { textoDoPdf } from "./pdf-texto.js";
import { quadroDoProcesso } from "./movimentacoes-quadro.js";
import { instalarSaude, reportarSaude } from "./saude-fila.js";
instalarSaude("pdf-studio");

const q = new URLSearchParams(location.search), ID = q.get("id") || "", ABA = Number(q.get("aba")) || 0;
const $ = (id) => document.getElementById(id);
const partes = []; let cancelado = false, comecou = false;
const TESTE = q.get("teste") === "1";      // só nos testes automáticos: deixa o resultado na página (sem depender da aba do Studio)
const status = (t) => { $("status").textContent = t; };
const paraOStudio = (m) => { if (TESTE && m.acao === "pdf-studio-resultado") document.body.dataset.resultado = JSON.stringify(m); return ABA ? chrome.tabs.sendMessage(ABA, { ...m, id: ID }).catch(() => {}) : Promise.resolve(); };

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (!m || m.id !== ID || !String(m.acao || "").startsWith("pdf-studio-")) return false;
  if (m.acao === "pdf-studio-ping") { responder({ ok: true }); return false; }
  if (m.acao === "pdf-studio-parte") { partes[m.n] = m.dados; responder({ ok: true }); return false; }
  if (m.acao === "pdf-studio-cancelar") { cancelado = true; responder({ ok: true }); return false; }
  if (m.acao === "pdf-studio-fim") { responder({ ok: true }); if (!comecou) { comecou = true; void processar(); } return false; }
  return false;
});

const juntar = () => {      // cada parte é o base64 de um pedaço do arquivo: decodifica uma a uma e junta
  const pedacos = partes.map((b) => { const s = atob(b || ""), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; });
  const total = pedacos.reduce((n, p) => n + p.length, 0), bytes = new Uint8Array(total); let o = 0; for (const p of pedacos) { bytes.set(p, o); o += p.length; } return bytes;
};

async function processar() {
  const t0 = Date.now();
  try {
    status("Conferindo as páginas…");
    const bytes = juntar(); partes.length = 0;
    if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new Error("o arquivo recebido não é um PDF válido");
    const nucleos = navigator.hardwareConcurrency || 4;
    const res = await fazerOcr(bytes, { escala: 2.6, paralelo: Math.max(1, Math.min(4, nucleos - 1)), forcar: false }, {
      log: () => {},
      status: (t) => { status(t); void paraOStudio({ acao: "pdf-studio-progresso", etapa: t, feitas: 0, total: 0 }); },
      progresso: (feitas, total) => { $("barra").hidden = false; $("barra").max = total; $("barra").value = feitas; status(`OCR nas páginas de imagem: ${feitas}/${total}`); void paraOStudio({ acao: "pdf-studio-progresso", etapa: "OCR nas páginas de imagem", feitas, total }); },
      cancelado: () => cancelado,
    });
    status("Extraindo o texto…"); void paraOStudio({ acao: "pdf-studio-progresso", etapa: "Extraindo o texto", feitas: 0, total: 0 });
    // o marcador de página fica no formato simples que o Studio entende; o carimbo do Projudi (Movimentação/Arquivo/Pág.) continua no texto da página
    const texto = await textoDoPdf(res.bytes, { simples: true });
    // devolve também o PDF JÁ COM OCR (texto selecionável) em partes, para o Studio mostrar/baixar essa versão em vez do original sem texto
    let pdfPartes = 0;
    if (res.bytes && res.ocr > 0 && res.bytes.length <= 80 * 1024 * 1024) {
      const TAM = 1_500_000; pdfPartes = Math.ceil(res.bytes.length / TAM);
      for (let n = 0; n < pdfPartes; n++) {
        status(`Devolvendo o PDF com OCR ao Studio… ${n + 1}/${pdfPartes}`);
        let b = ""; const fatia = res.bytes.subarray(n * TAM, (n + 1) * TAM); for (let k = 0; k < fatia.length; k += 0x8000) b += String.fromCharCode(...fatia.subarray(k, k + 0x8000));
        await paraOStudio({ acao: "pdf-studio-pdf-parte", n, dados: btoa(b) });
      }
    }
    const quadro = await quadroDoProcesso(texto);      // movimentações lidas da tela do processo (se ela foi aberta neste navegador)
    await paraOStudio({ acao: "pdf-studio-resultado", ok: true, quadro, pdfPartes, vazias: res.vazias || [], texto, paginas: res.total, ocr: res.ocr, paginasOcr: res.paginasOcr || [], puladas: (res.puladas || []).map((x) => (typeof x === "object" ? x.pagina : x)), segundos: Math.round((Date.now() - t0) / 1000) });
    void reportarSaude("pdf-studio", "info", "PDF tratado para o Studio", { paginas: res.total, ocr: res.ocr, ms: Date.now() - t0 }, true);
    status("Pronto."); setTimeout(() => window.close(), 1500);
  } catch (e) {
    const msg = cancelado ? "cancelado" : descreverErro(e);
    status("Erro: " + msg); $("status").className = "erro";
    if (!cancelado) void reportarSaude("pdf-studio", "erro", "Tratamento do PDF falhou: " + msg, undefined, true);
    await paraOStudio({ acao: "pdf-studio-resultado", ok: false, erro: msg });
    setTimeout(() => window.close(), 4000);
  }
}
