// Logica pura do Combloom: grade hex, regra de fusao, mel, flor, gelo, trancas, reforcos, fases, bot e jardim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMAS, hexagono, paraMundo, doMundo, distancia } from '../src/jogo/hex.js';
import {
  criarTabuleiro, colocar, resolver, sequenciaTopo, faixas, topo, venceu, cheio, martelar, trocar, resgatar, clonar,
  LIMITE_MEL,
} from '../src/jogo/regras.js';
import { configFase, criarFase, gerarPilha, encherBandeja, embaralharBandeja } from '../src/jogo/fases.js';
import { melhorJogada, jogarFase } from '../src/jogo/bot.js';
import { itemDoJardim, vagasDoJardim, estacao, FLORES, GRANDES } from '../src/jogo/jardim.js';
import { criarRng } from '../src/core/rng.js';

/** tabuleiro de raio 1 (centro = 0, vizinhos 1..6) */
function tab7(meta = 999) {
  const t = criarTabuleiro(hexagono(1), meta);
  const centro = t.celulas.findIndex((c) => c.q === 0 && c.r === 0);
  return { t, centro };
}

test('grade hex: tamanhos das formas, vizinhos e ida e volta mundo <-> celula', () => {
  const tam = Object.fromEntries(Object.entries(FORMAS).map(([k, f]) => [k, f().length]));
  assert.deepEqual(tam, { flor13: 13, colmeia19: 19, anel18: 18, estrela25: 25, alta29: 29, grande37: 37 });
  const { t, centro } = tab7();
  assert.equal(t.celulas[centro].viz.length, 6);
  for (const c of t.celulas) if (c !== t.celulas[centro]) assert.equal(c.viz.length, 3);
  for (const c of hexagono(3)) {
    const m = paraMundo(c.q, c.r);
    assert.deepEqual(doMundo(m.x + 0.3, m.z - 0.3), { q: c.q, r: c.r });
  }
  assert.equal(distancia({ q: 0, r: 0 }, { q: 2, r: -1 }), 2);
});

test('sequencia do topo e faixas', () => {
  assert.equal(sequenciaTopo([0, 1, 1, 2, 2, 2]), 3);
  assert.equal(sequenciaTopo([]), 0);
  assert.equal(faixas([0, 0, 1, 2, 2]), 3);
  assert.equal(topo([3, 4]), 4);
});

test('fusao: o topo igual pula para quem tem mais daquela cor', () => {
  const { t, centro } = tab7();
  const viz = t.celulas[centro].viz;
  t.celulas[viz[0]].pilha = [2, 1, 1, 1, 1];
  t.celulas[viz[3]].pilha = [1, 1];
  const ev = colocar(t, centro, [0, 1, 1, 1]);
  // o vizinho com 4 azuis recebe: 4 + 3 (colocada) + 2 (outro vizinho) = 9
  assert.deepEqual(t.celulas[viz[0]].pilha, [2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(t.celulas[centro].pilha, [0]);
  assert.deepEqual(t.celulas[viz[3]].pilha, []);
  assert.equal(ev.filter((e) => e.tipo === 'mover').length, 2);
  assert.equal(t.mel, 0);
});

test('mel: 10 ou mais da mesma cor no topo somem e contam; em cascata', () => {
  const { t, centro } = tab7();
  const viz = t.celulas[centro].viz;
  t.celulas[viz[0]].pilha = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  t.celulas[viz[1]].pilha = [0, 0, 0];
  const ev = colocar(t, centro, [1, 1, 1, 1]);
  // 6 + 4 azuis = 10 -> mel; o vermelho que sobra (7) junta com o vizinho (3) -> 10 -> mel de novo
  const meis = ev.filter((e) => e.tipo === 'mel');
  assert.equal(meis.length, 2);
  assert.equal(t.mel, 20);
  assert.equal(LIMITE_MEL, 10);
  assert.ok(t.celulas.every((c) => c.pilha.length === 0));
});

test('flor dobra o mel; gelo derrete com mel vizinho e volta a fundir; tranca abre com o mel da fase', () => {
  const { t, centro } = tab7();
  const viz = t.celulas[centro].viz;
  t.celulas[centro].flor = true;
  t.celulas[viz[0]].pilha = [3, 3, 3, 3];
  t.celulas[viz[1]].pilha = [3, 3];
  t.celulas[viz[1]].gelo = 1;
  t.celulas[viz[2]].tranca = 15;
  const ev = colocar(t, centro, [3, 3, 3, 3, 3, 3]);
  // o centro (6) recebe os 4 do vizinho: 10 na flor -> 20 de mel; o gelo do vizinho derrete; a tranca (15) abre
  const mel = ev.find((e) => e.tipo === 'mel');
  assert.ok(mel && mel.flor && mel.ganho === 20);
  assert.equal(t.celulas[viz[1]].gelo, 0);
  assert.ok(ev.some((e) => e.tipo === 'degelo'));
  assert.ok(ev.some((e) => e.tipo === 'abrir'));
  assert.equal(t.celulas[viz[2]].tranca, 0);
  assert.equal(t.mel, 20);
});

test('celula ocupada, trancada ou congelada nao recebe pilha; tabuleiro cheio', () => {
  const { t } = tab7();
  t.celulas[0].pilha = [1];
  t.celulas[1].tranca = 10;
  t.celulas[2].gelo = 1;
  t.celulas[2].pilha = [2];
  assert.deepEqual(colocar(t, 0, [3]), []);
  assert.deepEqual(colocar(t, 1, [3]), []);
  assert.deepEqual(colocar(t, 2, [3]), []);
  for (let i = 3; i < t.celulas.length; i++) t.celulas[i].pilha = [i];
  assert.ok(cheio(t));
});

test('reforcos: martelo tira a pilha; troca muda de lugar e funde; resgate leva as mais misturadas', () => {
  const { t, centro } = tab7();
  const viz = t.celulas[centro].viz;
  t.celulas[centro].pilha = [1, 2];
  assert.equal(martelar(t, centro)[0].tipo, 'levar');
  assert.deepEqual(t.celulas[centro].pilha, []);
  t.celulas[viz[0]].pilha = [4, 4, 4, 4, 4];
  t.celulas[viz[3]].pilha = [4, 4, 4, 4, 4];
  // viz[0] e viz[3] estao em lados opostos: trocar viz[3] com o centro junta as duas -> 10 -> mel
  const ev = trocar(t, viz[3], centro);
  assert.ok(ev.some((e) => e.tipo === 'mel'));
  assert.equal(t.mel, 10);
  const u = tab7().t;
  u.celulas[0].pilha = [0, 1, 2, 3];
  u.celulas[1].pilha = [0, 0];
  u.celulas[2].pilha = [1, 2];
  const lev = resgatar(u, 2);
  assert.deepEqual(lev.map((e) => e.i).sort(), [0, 2]);
});

test('clonar nao divide pilhas com o original', () => {
  const { t } = tab7();
  t.celulas[0].pilha = [1, 1];
  const c = clonar(t);
  c.celulas[0].pilha.push(1);
  assert.deepEqual(t.celulas[0].pilha, [1, 1]);
});

test('fases: novidade a cada ~2 min na ordem do GDD; sem derrota nas 4 primeiras', () => {
  const nov = {};
  for (let n = 1; n <= 20; n++) { const c = configFase(n); if (c.novidade) nov[c.novidade] = n; }
  assert.deepEqual(nov, { flor: 3, martelo: 4, tranca: 5, girar: 6, troca: 7, gelo: 8, embaralhar: 10, antigas: 11, maior: 13, grande: 16 });
  for (let n = 1; n <= 4; n++) assert.ok(configFase(n).protegida, `fase ${n} protegida`);
  assert.ok(!configFase(5).protegida);
  for (let n = 1; n <= 60; n++) {
    const c = configFase(n);
    assert.ok(c.cores >= 3 && c.cores <= 7 && c.meta > 0 && FORMAS[c.forma], `fase ${n}`);
  }
});

test('fases por semente: deterministicas; tentativa nova muda o sorteio', () => {
  const a = criarFase(12, 5);
  const b = criarFase(12, 5);
  assert.deepEqual(a.tab.celulas.map((c) => [c.pilha, c.flor, c.tranca, c.gelo]), b.tab.celulas.map((c) => [c.pilha, c.flor, c.tranca, c.gelo]));
  assert.deepEqual(a.bandeja, b.bandeja);
  const c = criarFase(12, 5, 1);
  assert.notDeepEqual(a.bandeja, c.bandeja);
  assert.equal(a.tab.celulas.filter((k) => k.tranca).length, 2);
  assert.equal(a.tab.celulas.filter((k) => k.gelo).length, 1);
  assert.ok(a.tab.celulas.some((k) => k.pilha.length >= 8), 'pilha antiga de varias camadas');
});

test('bandeja: pilhas dentro da altura e das cores; enche so quando vazia; embaralhar troca', () => {
  const cfg = configFase(12);
  const r = criarRng(3);
  for (let k = 0; k < 300; k++) {
    const p = gerarPilha(r, cfg, null);
    assert.ok(p.length >= cfg.alt[0] && p.length <= cfg.alt[1]);
    assert.ok(p.every((c) => c >= 0 && c < cfg.cores));
    assert.ok(faixas(p) <= cfg.seg);
  }
  const f = criarFase(7, 2);
  assert.equal(encherBandeja(f), false);
  f.bandeja = [null, null, null];
  assert.equal(encherBandeja(f), true);
  assert.ok(f.bandeja.every(Boolean));
  const antes = JSON.stringify(f.bandeja);
  embaralharBandeja(f);
  assert.notEqual(JSON.stringify(f.bandeja), antes);
});

test('fase 1: a primeira jogada guiada faz 2 meis em cascata (o "uau" dos 15 s)', () => {
  const f = criarFase(1, 7);
  const j = melhorJogada(f);
  assert.ok(j);
  const ev = colocar(f.tab, j.i, /** @type {number[]} */ (f.bandeja[j.s]));
  assert.ok(ev.filter((e) => e.tipo === 'mel').length >= 2, 'cascata com 2 meis');
  assert.ok(ev.filter((e) => e.tipo === 'mover').length >= 3, 'varias viradas');
});

test('bot guloso conclui >= 82% de cada fase de 1 a 40; fases protegidas sempre', () => {
  const N = Number(process.env.SEMENTES || 40);
  for (let n = 1; n <= 40; n++) {
    let ok = 0;
    for (let s = 1; s <= N; s++) if (jogarFase(n, s * 7919).venceu) ok++;
    const taxa = ok / N;
    assert.ok(taxa >= 0.82, `fase ${n}: ${(taxa * 100).toFixed(0)}%`);
    if (configFase(n).protegida) assert.equal(taxa, 1, `fase ${n} protegida`);
  }
});

test('jardim: uma planta por fase, peca grande a cada 5; vagas fora da bandeja; estacoes a cada 10', () => {
  assert.equal(itemDoJardim(5).grande, true);
  assert.equal(itemDoJardim(4).grande, false);
  assert.equal(itemDoJardim(1).sprite, FLORES[0]);
  assert.equal(itemDoJardim(5).sprite, GRANDES[0]);
  const vistos = new Set();
  for (let k = 1; k <= 22; k++) if (!itemDoJardim(k).grande) vistos.add(itemDoJardim(k).sprite);
  assert.equal(vistos.size, 18, 'as 18 flores aparecem antes de repetir');
  const f = criarFase(13, 1);
  const bandeja = [{ x: -2, z: 9 }, { x: 0, z: 9 }, { x: 2, z: 9 }];
  const [flores, grandes] = vagasDoJardim(f.tab.celulas, 40, { bandeja });
  assert.equal(flores.length, 40);
  assert.ok(grandes.length >= 8);
  for (const v of [...flores, ...grandes]) {
    for (const b of bandeja) assert.ok(Math.hypot(v.x - b.x, v.z - b.z) > 2, 'vaga em cima da bandeja');
    for (const c of f.tab.celulas) assert.ok(Math.hypot(v.x - c.x, v.z - c.z) > 1.05, 'vaga em cima da colmeia');
  }
  assert.deepEqual([1, 10, 11, 21, 31, 41].map(estacao), [0, 0, 1, 2, 3, 0]);
});

test('resolver tem guarda: nenhum laco infinito com pilhas enormes', () => {
  const { t, centro } = tab7();
  for (const c of t.celulas) c.pilha = Array.from({ length: 30 }, (_, k) => k % 2);
  t.celulas[centro].pilha = [];
  const ev = [];
  resolver(t, t.celulas.map((_, i) => i), ev);
  assert.ok(ev.length < 5000);
  assert.ok(!venceu(t) || t.mel >= t.meta);
});
