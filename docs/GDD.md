# Combloom: documento de design

Pasta e slug interno: `hex-hive` (porta 5460, armazenamento `hexhive.`). Nome público: **Combloom** (favo + florescer).

## Nome

O nome de trabalho "Hex Hive" colide: há o jogo de tabuleiro *Hex Hive: Bumbling Bees* (2024, BoardGameGeek), o
brinquedo *HexHive* (Major Fun / Toy Insider) e um app iOS "Hexhive" (puzzle de lógica). Pesquisa em 2026-11-20 sem
nenhum resultado para "Combloom" (web, Poki, CrazyGames, App Store). O jogo não usa "Hexa" nem "Hex" no nome, para não
confundir com o nosso Hexa Drop. A pasta e o slug interno continuam `hex-hive` (limite da leva); trocar a pasta é
decisão do usuário.

## Gênero e gancho

Puzzle 3D de pilhas hexagonais (gênero "hexa sort"), retrato e paisagem. Tabuleiro de células de cera numa colmeia,
bandeja com 3 pilhas de peças coloridas. Arrastar uma pilha para uma célula vazia faz as peças do topo da mesma cor
das pilhas vizinhas **pularem em arco, virando no ar**, para a pilha que já tem mais daquela cor. 10 ou mais da mesma
cor no topo viram **mel**: a pilha derrete e as abelhas levam o mel para o pote. Encher o pote completa a fase.

**Diferencial visível:** o **jardim** em volta da colmeia. Cada fase concluída faz nascer uma flor, um arbusto ou um
enfeite que fica para sempre; a cada 5 fases nasce uma peça grande (árvore, casa de abelha, banco). O jardim é a meta
longa e está sempre na tela, atrás do tabuleiro.

## Loop

- **Jogada (2–4 s):** escolher a pilha, achar a célula com vizinhos da mesma cor, soltar, ver a cascata.
- **Fase (~60–90 s):** encher o pote (meta N de mel). Festa curta (1,8 s, sem tela de "fase concluída"), a planta nova
  brota no jardim e a fase seguinte já começa.
- **Sessão:** novidade a cada ~2 min (tabela abaixo); jardim que cresce; reforços ganhos jogando.

Regra da fusão (`src/jogo/regras.js`):

1. A pilha colocada entra numa fila. Para cada célula da fila: o grupo é ela mais os vizinhos ativos com a mesma cor
   no topo. O **alvo** é quem tem a maior sequência daquela cor no topo (empate: a própria célula). As sequências do
   topo dos outros pulam, uma peça por vez, para o alvo.
2. Quem perdeu peças mostra uma cor nova no topo e volta para a fila; o alvo também (pode ter vizinhos novos).
3. Fila vazia: toda pilha com **10 ou mais** da mesma cor no topo vira mel (a sequência inteira some). Mel em célula
   de flor vale dobrado. Cada mel derrete uma camada do gelo vizinho. As células que viraram mel voltam para a fila.
4. Repete até não mudar nada. Venceu se o mel da fase chegou à meta. Perdeu se não sobrou célula vazia (só a partir
   da fase 5; antes disso as abelhas levam as 3 pilhas mais misturadas e o jogo segue).

## Controles

- **Toque e mouse:** arrastar a pilha da bandeja até a célula (a pilha flutua acima do dedo, a célula de destino
  acende). Também vale tocar na pilha e depois na célula.
- **Girar a colmeia (1.1.0):** a colmeia gira em volta do centro como um prato giratório, para ver a melhor posição
  atrás das pilhas altas. Arrastar fora das pilhas da bandeja (o ponto sob o dedo acompanha o dedo; longe da colmeia,
  vale o arrasto horizontal), dois dedos (torcer ou arrastar juntos), segurar a pilha com um dedo e girar com outro,
  botão direito ou do meio, roda do mouse, botões ⟲ ⟳ na barra de baixo (60° cada) e as teclas Q/E. Inércia suave
  (parar antes de soltar não deixa inércia). A bússola aparece no canto quando a colmeia está girada e volta ao
  ângulo padrão com um toque (tecla R). Toque, soltar, martelo, troca e setas continuam certos com a colmeia girada
  (raio contra as pilhas, no espaço da colmeia). Bandeja, jardim e câmera não giram; colmeia nova começa em 0°.
  Ensinado uma vez na fase 6 (novidade "girar"): dica curta e a mão-guia arrastando na frente da colmeia; some quando
  o jogador gira ~35° (ou depois de 3 jogadas). Os botões ⟲ ⟳ aparecem a partir dela; o gesto vale desde a fase 1.
- **Teclado:** 1, 2 e 3 escolhem a pilha, setas movem o cursor (no sentido da tela), Enter solta; Q/E giram, R volta
  ao padrão; ESC, espaço ou P pausam.
- **Reforços:** botões na barra de baixo. Martelo (tira uma pilha do tabuleiro), Troca (troca duas pilhas do
  tabuleiro de lugar), Embaralhar (bandeja nova). Toque no reforço e depois no alvo; ESC cancela.

## Os 3 primeiros minutos

| Tempo | O que acontece |
|---|---|
| 0:00 | Carga direto na fase 1 (sem menu). Tabuleiro "flor" de 13 células com 4 pilhas já plantadas. A mão-guia (lance do bot) arrasta a pilha azul da bandeja até a célula que liga as pilhas azuis. Texto curto: "Arraste a pilha para a colmeia!" |
| 0:05–0:15 | Primeira jogada roteirizada: 2 azuis + 3 azuis pulam para a pilha com 5 azuis → 10 → **mel** (abelhas buscam). A pilha colocada revela vermelho, que pula para a pilha vermelha vizinha, que chega a 10 → **segundo mel**. É o "uau". |
| 0:15–0:30 | Fase 1, meta 30 de mel (3 jogadas), bandejas muito generosas (cores do topo do tabuleiro). Mão-guia nas 2 primeiras jogadas e depois só como ajuda automática. Festa, o primeiro girassol nasce no jardim. |
| 0:30–0:50 | Fase 2, meta 40, 3 cores. Texto: "10 da mesma cor viram mel!". |
| 0:50 | **Novidade 1: célula de flor** (fase 3). Texto: "Mel na flor vale dobrado!". |
| ~1:40 | **Novidade 2: martelo** (fase 4, ganha 2). 4 cores, tabuleiro de 19 células. |
| ~2:30 | **Novidade 3: célula trancada** (fase 5): o cadeado de cera abre quando o pote da fase chega ao número dele. A partir daqui o tabuleiro cheio pode perder. |

Sem derrota nas fases 1 a 4 (~2,5 min; com pessoa de verdade, mais perto de 3): se o tabuleiro encher, as abelhas levam as 3 pilhas mais misturadas.

## Novidade a cada ~2 min

| Fase | Minuto (bot, 3,4 s/jogada) | Novidade |
|---|---|---|
| 3 | 0:50 | Células de flor (mel dobrado) |
| 4 | 1:40 | Reforço martelo |
| 5 | 2:30 | Células trancadas (abrem com mel); a derrota passa a existir |
| 6 | 3:30 | Girar a colmeia (1.1.0): mão-guia e botões ⟲ ⟳ (colmeia em anel) |
| 7 | 4:40 | Reforço troca |
| 8 | 6:00 | Pilhas congeladas (cada mel vizinho derrete uma camada de gelo) |
| 10 | 8:40 | Reforço embaralhar (fase de respiro) |
| 11 | 9:30 | Pilhas antigas de várias camadas já plantadas no tabuleiro (cavar até o fundo) |
| 11 | 9:30 | Estação do jardim muda (verão); depois outono na 21 e noite na 31 |
| 13 | 12:40 | Tabuleiro maior (29 células, "colmeia alta") e 7ª cor |
| 16 | 16:50 | Tabuleiro grande (37 células) |

Medido com `npm run medir --sementes=200` (fim da fase anterior). A fase 1 dura ~10 s (3 jogadas), as fases normais
de 1 a 2 min, as de respiro (10, 15, 20...) menos de 1,4 min.

## Meta longa: o jardim

- 1 planta por fase; a cada 5 fases uma peça grande. As vagas ficam em anéis em volta da colmeia, as primeiras perto do
  tabuleiro (visíveis no retrato e na paisagem).
- Contador "Jardim N" no topo. As plantas ficam salvas (`hexhive.progresso`).
- Gancho diário leve: o primeiro mel de cada dia traz o **presente do dia** (1 reforço). Sem sequência que se perde,
  sem energia, sem segunda moeda.

## Reforços

- Ganhos jogando: 2 na apresentação de cada um; +1 a cada 3 fases (rodízio); presente do dia.
- Premiado (vídeo) só por escolha, fora do jogo ativo: no menu de pausa ("🎬 +1 reforço", ao lado de "Continuar" do
  mesmo tamanho) e no painel "Sem espaço!" ("🎬 Abrir espaço", ao lado de "Tentar de novo"). Some sem vídeo.

## Anúncios

- `commercialBreak` só em pausa natural: troca de fase e "Tentar de novo", e só a partir da fase 6 (~4 min).
- Nada por relógio, nada em botão de navegação. Premiado como acima.
- **Y8:** o intersticial só sai logo depois de um clique num botão (as regras da Y8 proíbem o automático): na troca de
  fase aparece "Continuar ▶" quando já passaram 180 s de jogo desde o anterior; "Tentar de novo" também é clique.
  Perder o foco da janela abre a pausa.

## Dificuldade e prova

Fases por semente (`src/jogo/fases.js` + `gerador.js`): forma, número de cores, meta, altura e camadas das pilhas,
flores, trancas, gelo e pilhas antigas. Fase de respiro a cada 5. O bot guloso (`src/jogo/bot.js`) joga cada fase
com 200 sementes; `npm run medir` mostra conclusão e jogadas; o teste exige **≥ 82%** em todas as fases de 1 a 40.

## Bíblia de arte

- **Arte-chave:** `arte/escolhida/chave.jpg` (opção B, ver `docs/autoria.md`). Tudo o mais sai por `editar` com ela.
- **Traço:** 3D estilizado de brinquedo, formas arredondadas e chanfradas, materiais de plástico acetinado e cera, sem
  contorno preto. Abelha mascote: redonda, peluda, olhos grandes brilhantes e sorriso pequeno.
- **Luz:** sol de manhã vindo de cima à esquerda, sombras suaves, oclusão leve, brilho quente no mel.
- **Paleta:**
  - mel `#F5B82E`, âmbar `#D9861C`, cera `#F7D98A`, borda da cera `#C98A1B`;
  - folha `#5CB84A`, folha escura `#2F7D3A`, creme `#FFF4D6`, contorno de UI `#3B2412`;
  - peças: coral `#F0525E`, azul `#3D8BFF`, verde `#45C15A`, lilás `#9B5DE5`, rosa `#FF73C3`, turquesa `#16C3C0`,
    laranja `#FF9A2E` (a cor do mel nunca é peça).
- **Bloco de estilo (fim de todo prompt):**

> Art style: cozy stylized 3D casual game art, soft rounded toy-like shapes with gently beveled edges, smooth satin
> plastic and wax materials, warm morning sunlight from the upper left with soft shadows, light ambient occlusion,
> saturated candy colors (honey gold, leaf green, coral red, sky blue, lilac purple, bubblegum pink) on a fresh green
> and cream base, clean readable silhouettes, simple uncluttered composition, no text, no letters, no numbers, no
> logo, no watermark, no user interface.

- **Sprites:** grades 3×3 em magenta `#FF00FF` (flores rosas/roxas em ciano `#00FFFF`), recortadas por
  `tools/sprite.mjs --separar`. Textura do chão por `costurar`.
- **3D no jogo:** peças e células são malhas do three.js (InstancedMesh) com as cores da paleta e a textura de topo do
  Grok; jardim, abelhas e ícones são sprites do Grok.
- **Peças (1.1.0):** prisma hexagonal com cantos e chanfro arredondados (normais suaves), plástico acetinado
  (roughness 0,3) com brilho e reflexo suaves de um mapa de ambiente gerado em código (PMREM: gradiente céu-grama e 3
  "softboxes"), oclusão assada nos vértices (o sulco escuro entre peças empilhadas), oclusão entre pilhas (cada vizinha
  mais alta escurece 5,5% a camada), sombra de contato embaixo de cada pilha, da pilha arrastada (onde ela vai cair) e
  das peças no ar. Virada em arco em volta do meio da peça, que estica no ar e amassa ao pousar; o mel doura, brilha e
  derrete com onda dourada e gotas. Sem tone mapping (as cores da paleta saem cheias); a grama compensa a luz menor.
- **Símbolo por cor (daltonismo):** decalque branco gravado no topo da peça de cima de cada pilha, da bandeja e das
  peças no ar (nas duas faces): coral = coração, azul = gota, verde = folha, lilás = estrela, rosa = lua,
  turquesa = losango, laranja = sol. Fica sempre de pé para o jogador (não gira com a colmeia).
- **Som (1.1.0):** nada de "catraca" junto do acerto (tique por peça, cliques em sequência, contagem, "trrr"): um som
  limpo por grupo de peças da cascata (nota que sobe), acordes inteiros, notas em sequência a ≥ 0,12 s, sem tremolo
  rápido; `test/sons.test.js` cobra. Sem vibração por peça.
