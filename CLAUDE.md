# CLAUDE.md

Orientação para o Claude Code neste repositório.

## O que é

**Combloom** (pasta e slug interno `hex-hive`): puzzle 3D de pilhas hexagonais numa colmeia. Arrastar uma pilha para
uma célula faz as peças do topo da mesma cor pularem em arco, virando, para a pilha vizinha que tem mais daquela cor;
10 iguais viram mel e as abelhas levam. Cada fase faz o **jardim** em volta da colmeia florescer (a meta longa).
Jogo original do estúdio (nome, tema, personagens e arte próprios) para Poki, CrazyGames, californiagames.io e Y8, a partir
do kit multiportal (`../distribuicao/kit`, ver o README de lá). Catálogo no cofre: `../Nettools Games/Jogos/hex-hive.md`.
O nome "Hex Hive" colidia (jogo de tabuleiro, brinquedo e app iOS): ver `docs/GDD.md`, "Nome".

## Rodar e testar

- `npm run servir` → http://127.0.0.1:5460/ (a PlataformaSDK em modo autônomo, anúncios simulados).
  Parâmetros só em localhost: `?novo`, `?fase=N`, `?semente=N`, `?auto`, `?filme=30`, `?semanuncio`, `?lang=pt|en|es`, `?limpo`, `?debug`.
- `npm test`: lógica pura (grade hex, fusão, mel, gelo, trancas, reforços), bot (≥ 82% em cada fase de 1 a 40),
  jardim, portais, sons sem "catraca" (`test/sons.test.js`) e as fronteiras do código (`test/estilo.test.js`).
  `SEMENTES=200 npm test` para a prova longa.
- `npm run medir` (`--fases=1-40 --sementes=200`): conclusão do bot guloso e do "distraído" (35% de lances ao acaso),
  jogadas e minutos por fase.
- `npm run empacotar` (5 alvos: poki, crazygames, crazygames-basic, californiagames, y8) e `npm run verificar`;
  prova do California: de `../distribuicao`,
  `node ferramentas/provar.mjs hex-hive`.

## Arquitetura

- `src/main.js`: único módulo que toca portal, DOM, áudio e salvamento. Ciclo do portal como no kit.
- `src/jogo/`: lógica pura e determinística (sem DOM, relógio nem `Math.random`): `hex.js` (grade axial "flat-top",
  formas), `regras.js` (colocar, fundir, mel, gelo, trancas, martelo, troca, resgate; devolve eventos para a
  animação), `fases.js` (tabela 1–16 e rodada procedural, gerador da bandeja com ajuda), `bot.js` (guloso de 1 lance),
  `jardim.js` (sequência de plantas e vagas em anéis).
- `src/render/cena.js`: three.js r187 (`vendor/three`, só o núcleo). Peças (prisma de cantos arredondados), símbolos
  por cor, sombras de contato, células e gelo em InstancedMesh; mapa de ambiente PMREM gerado em código; fila de
  eventos vira animação (viradas em arco com esticar/amassar, mel derretendo, abelhas); `acelerar()` pula para o estado
  final quando o jogador age durante a animação. A colmeia gira (grupo `piv` + pecas passam pelo giro); toda conversão
  tela ↔ célula passa pelo giro (`celulaEm` é raio contra as pilhas). Câmera fixa: enquadra o círculo que a colmeia
  varre + bandeja entre as margens do HUD (retrato: bandeja embaixo; paisagem: à direita). Pixel ratio cai sozinho
  (0,25 por vez, até 1) se o aparelho fica abaixo de ~45 fps por ~2 s.
- `src/som/sons.js`: sons sintetizados. `src/i18n/textos.js`: pt, en, es.
- `src/core/`: kit (não mexer sem motivo; correções voltam para `../distribuicao/kit`).
- `src/arte/`: arte processada (WebP). `arte/bruto/`: originais do Grok (fora do build). `docs/autoria.md`: prompts.

## Regras

- Código, comentários e docs em português; comentários ASCII em `src/jogo/`.
- Nenhum anúncio antes da fase 6 (~4 min); intervalo só em pausa natural (troca de fase e "Tentar de novo");
  premiado só por escolha, fora do jogo ativo (menu de pausa e painel "Sem espaço!"), ao lado de opção grátis.
- Y8 (`portal.intervaloSoNoClique`): o intersticial só sai logo depois de um clique num botão ("Continuar ▶",
  `#btSeguir`, na troca de fase, ou o próprio "Tentar de novo") e no máximo 1 a cada 180 s de jogo;
  `portal.pausaNoBlur`: perder o foco abre a pausa. Os ids da Y8 (`appId`, `gameId`) vão em
  `package.json` → `kit.ids.y8` quando o usuário criar o jogo no painel; sem eles o zip sai `-sem-id`.
- Giro da colmeia: gestos e teclas no `main.js` (papéis por ponteiro: pilha, fundo, giro, pinça); física do giro
  (mola, inércia suave, bússola) na cena. Colmeia nova começa em 0°; o giro nunca muda a lógica.
- Sons: um som limpo por evento; nada de catraca (tique por peça, cliques em sequência, contagem, tremolo rápido).
- Armazenamento só com o prefixo `hexhive.`; nunca `clear()`.
- Toda arte nova pelo `tools/grok.mjs` com o bloco de estilo do `docs/GDD.md`; conferir a olho antes de usar.
- Não fazer commit sem o usuário pedir.
- Registrar atividade no cofre: linha em `Atividades/AAAA-MM-DD.md` e histórico em `Jogos/hex-hive.md`.

## Notas para o kit (correções feitas só aqui)

- `tools/sprite.mjs`: `--limpar=0` desliga a limpeza de cor do contorno. O Grok devolveu fundos **carmim**
  (~#C90A59), não magenta puro; com a chave carmim só o vermelho conta como "forte", e a limpeza tirava o vermelho da
  madeira e dos objetos vermelhos (borda esverdeada). Para essas grades: `--tol=0.12 --suave=0.06 --limpar=0`.
- `tools/sprite.mjs`: pontinhos de ruído (< `--ruido` px, padrão 40) ficam fora da junção por caixas.
- No zsh, opções numa variável (`O="--tol=..."; ... $O`) não se dividem: passe as opções por extenso.
- `tools/grok.mjs` lê o nome do jogo do `package.json`: ajuste o `name` antes da primeira geração (a primeira leva
  daqui saiu com o nome "kit").
