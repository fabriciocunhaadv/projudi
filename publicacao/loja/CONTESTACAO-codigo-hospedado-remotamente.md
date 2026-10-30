# Rejeição "Incluir código hospedado remotamente em um item do Manifesto V3" (versão 1.0.68)

## O que foi feito na versão 1.0.71
Os arquivos `vendor/tesseract.min.js` e `vendor/worker.min.js` (tesseract.js 7.0.0, biblioteca de OCR de terceiros, empacotada) traziam três endereços padrão de CDN (`https://cdn.jsdelivr.net/npm/...`) usados só quando quem chama a biblioteca não informa os caminhos. A extensão **sempre** informa `workerPath`, `corePath` e `langPath` locais (`ocr-motor.js`), então esses endereços nunca eram usados. Eles foram **removidos do pacote** (trocados por `vendor-local-sem-rede/`), para que não exista nenhuma referência a código fora do pacote. Nada mais mudou no funcionamento do OCR (testes de OCR e de geração de PDF conferidos).

## Texto para o campo "Contestação" / observações ao revisor (cole em inglês)
Our extension does not load or execute any remotely hosted code. All JavaScript and WebAssembly is packaged inside the extension (pdf.js, pdf-lib, tesseract.js and tesseract.js-core under /vendor, listed in vendor/LEIAME.txt with their licenses). There is no <script src> to external hosts, no importScripts/import() of remote URLs, no eval of fetched code, and the CSP is "script-src 'self' 'wasm-unsafe-eval'". The only remote requests are data requests (HTML/PDF/JSON) to judicial systems the user is already logged into and to the Google Docs API. The previous package contained default CDN URL strings inside the bundled tesseract.js library (workerPath/corePath/langPath defaults) that were never used because our code always passes local paths; version 1.0.71 removes those strings entirely. Please re-review version 1.0.71.

## Como reenviar
1. Painel da loja → Pacote → "Fazer upload de nova versão" → `publicacao/projudi-extensao-1.0.71.zip`.
2. Se o rascunho rejeitado (1.0.68) ainda aparecer, envie o novo pacote por cima dele (a versão tem que ser maior que a rejeitada: 1.0.71).
3. Em "Enviar para revisão", se houver um campo de observações, cole o texto em inglês acima.
