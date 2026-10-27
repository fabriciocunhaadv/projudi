// PDF para texto: o assessor escolhe um ou vários PDFs do computador e recebe o texto de cada um (.txt). Reaproveita o motor de OCR (só nas páginas-imagem) e a extração de texto.
import { fazerOcr } from "./ocr-motor.js";
import { textoDoPdf } from "./pdf-texto.js";

const $ = (id) => document.getElementById(id);
let arquivos = [], cancelado = false, rodando = false;
const resultados = [];      // { nome, texto, paginas, ocr }
window.__textos = resultados;      // usado nos testes

const log = (t) => { const el = $("log"); el.textContent += t + "\n"; el.scrollTop = el.scrollHeight; };
const semExt = (n) => n.replace(/\.pdf$/i, "");
const unico = (nome, usados) => { let n = nome, i = 2; while (usados.has(n)) n = `${nome} (${i++})`; usados.add(n); return n; };

function escolher(lista) {
  arquivos = [...lista].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  $("iniciar").disabled = !arquivos.length || rodando;
  $("status").textContent = arquivos.length ? `${arquivos.length} arquivo(s): ${arquivos.map((f) => f.name).join(", ")}` : "";
}

function baixar(nome, texto) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/plain;charset=utf-8" }));      // BOM: o Bloco de Notas abre com os acentos certos
  a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

async function copiar(texto, botao) {
  try { await navigator.clipboard.writeText(texto); botao.textContent = "Copiado ✓"; }
  catch { botao.textContent = "Não foi possível copiar"; }
  setTimeout(() => { botao.textContent = "Copiar texto"; }, 2500);
}

function mostrar(r) {
  const div = document.createElement("div"); div.className = "res";
  const info = `${r.paginas} página(s)${r.ocr ? `, ${r.ocr} com OCR` : ""}, ${r.texto.length.toLocaleString("pt-BR")} caracteres`;
  const b = document.createElement("b"); b.textContent = r.nome + ".pdf";
  div.append(b, ` — ${info}`);
  if (r.texto.replace(/\[Página \d+ de \d+\]/g, "").trim().length < 20) {
    const av = document.createElement("div"); av.className = "aviso"; av.textContent = "⚠ Quase nenhum texto foi encontrado neste PDF (imagem muito ruim ou páginas em branco). Tente a qualidade “Alta” ou “Refazer OCR”."; div.append(av);
  }
  const barra = document.createElement("div");
  const bx = document.createElement("button"); bx.textContent = "Baixar .txt"; bx.onclick = () => baixar(r.nome + ".txt", r.texto);
  const bc = document.createElement("button"); bc.textContent = "Copiar texto"; bc.onclick = () => copiar(r.texto, bc);
  barra.append(bx, bc); div.append(barra);
  $("resultados").append(div);
}

async function converter(arquivo, opcoes) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  log(`\n▶ ${arquivo.name}`);
  $("barra").hidden = false;
  const r = await fazerOcr(bytes, opcoes, {
    log, status: (t) => ($("status").textContent = `${arquivo.name}: ${t}`),
    progresso: (feitas, total) => { $("barra").max = total; $("barra").value = feitas; },
    cancelado: () => cancelado,
  });
  let texto = await textoDoPdf(r.bytes);
  if (!opcoes.marcadores) texto = texto.replace(/^\[Página \d+(?: de \d+)?\]\n/gm, "");
  return { texto, paginas: r.total, ocr: r.ocr };
}

async function iniciar() {
  rodando = true; cancelado = false; resultados.length = 0;
  $("iniciar").disabled = true; $("cancelar").disabled = false; $("resultados").textContent = ""; $("unir").hidden = true;
  const opcoes = { escala: +$("escala").value, paralelo: +$("paralelo").value, forcar: $("forcar").checked, marcadores: $("marcadores").checked };
  const usados = new Set();
  for (const f of arquivos) {
    if (cancelado) break;
    try {
      const r = await converter(f, opcoes);
      const item = { nome: unico(semExt(f.name), usados), ...r };
      resultados.push(item); mostrar(item);
      log(`  ✔ ${r.paginas} página(s), ${r.texto.length} caracteres`);
    } catch (e) {
      if (cancelado) break;
      log(`  ✖ ${f.name}: ${e.message}`);
      const div = document.createElement("div"); div.className = "res erro"; div.textContent = `${f.name}: ${e.message}`; $("resultados").append(div);
    }
  }
  rodando = false; $("cancelar").disabled = true; $("iniciar").disabled = !arquivos.length;
  $("status").textContent = cancelado ? "Cancelado." : `Pronto: ${resultados.length} de ${arquivos.length} arquivo(s) convertido(s).`; $("barra").hidden = true;
  $("unir").hidden = resultados.length < 2;
  document.body.dataset.pronto = "1";
}

(() => {
  const nucleos = navigator.hardwareConcurrency || 4, padrao = Math.max(1, Math.min(4, nucleos - 1));
  $("paralelo").innerHTML = [1, 2, 3, 4, 6, 8].map((n) => `<option ${n === padrao ? "selected" : ""}>${n}</option>`).join("");
  $("arquivo").onchange = (e) => escolher(e.target.files);
  const z = $("solta");
  z.ondragover = (e) => { e.preventDefault(); z.classList.add("sobre"); };
  z.ondragleave = () => z.classList.remove("sobre");
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove("sobre"); escolher(e.dataTransfer.files); };
  $("iniciar").onclick = iniciar;
  $("cancelar").onclick = () => { cancelado = true; $("status").textContent = "Cancelando…"; };
  $("baixarTudo").onclick = () => baixar("textos-dos-pdfs.txt", resultados.map((r) => `===== ${r.nome}.pdf =====\n${r.texto}`).join("\n\n"));
})();
