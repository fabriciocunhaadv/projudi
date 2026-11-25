// Reconhece página de erro do servidor (Cloudflare 502…) e deixa passar páginas normais. Rodar: node tests/teste_pagina_erro.mjs
import { classificarPaginaDeErro, ehPaginaDeErroDoNavegador } from "../extensao/pagina-erro.js";
let falhas = 0; const ok = (c, m) => { if (!c) { falhas++; console.log("FALHOU:", m); } else console.log("ok:", m); };
const cf = "simplesefacil.tjgo.jus.br | 502: Bad gateway Bad gateway Error code 502 Visit cloudflare.com for more information. 2026-11-25 10:38:37 UTC You Browser Working São Paulo Cloudflare Working simplesefacil.tjgo.jus.br Host Error What happened? The web server reported a bad gateway error. What can I do? Please try again in a few minutes.";
const r = classificarPaginaDeErro(cf);
ok(/fora do ar/.test(r) && r.includes("502") && /Studio|outra IA/.test(r), `Cloudflare 502 (print do usuário) → ${r.slice(0, 80)}…`);
ok(/504/.test(classificarPaginaDeErro("504 Gateway Time-out nginx")), "504 Gateway Time-out");
ok(/fora do ar/.test(classificarPaginaDeErro("Service Temporarily Unavailable 503")), "503 indisponível");
ok(classificarPaginaDeErro("Gerência de Prompts - AGAIA Informe o número do processo Executar Aguardando Execução") === "", "página normal do Agaia não é erro");
ok(classificarPaginaDeErro("O processo 5285461-71.2025 foi arquivado e sofreu erro 404 na consulta") === "", "mensagem comum do Agaia (arquivado) não é erro de servidor");
ok(classificarPaginaDeErro("") === "" && classificarPaginaDeErro(null) === "", "vazio");
ok(ehPaginaDeErroDoNavegador("chrome-error://chromewebdata/") && !ehPaginaDeErroDoNavegador("https://simplesefacil.tjgo.jus.br/agaia/"), "erro do próprio navegador");
console.log(falhas ? `${falhas} falha(s)` : "tudo certo"); process.exit(falhas ? 1 : 0);
