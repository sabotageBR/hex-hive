// Fases por numero e semente: forma, cores, meta de mel, pilhas da bandeja e as mecanicas que entram com o
// tempo (docs/GDD.md, "Novidade a cada ~2 min"). Puro e deterministico (core/rng.js).
import { criarRng, hashTexto, embaralhar } from '../core/rng.js';
import { FORMAS, distancia } from './hex.js';
import { criarTabuleiro, ativa, topo, celulasLivres } from './regras.js';

/** Cores das pecas (indices; a paleta fica no render). */
export const MAX_CORES = 7;

/**
 * @typedef {object} ConfigFase
 * @property {number} n
 * @property {import('./hex.js').NomeForma} forma
 * @property {number} cores
 * @property {number} meta mel para completar
 * @property {[number, number]} alt altura das pilhas da bandeja (min, max)
 * @property {number} seg faixas de cor por pilha, no maximo
 * @property {[number, number]} [pSeg] chance acumulada de 1 e de 2 faixas (o resto: 3)
 * @property {number} ajuda chance da cor do topo vir de uma cor que ja esta no topo do tabuleiro
 * @property {number} flores
 * @property {number[]} trancas mel para abrir cada uma
 * @property {number[]} gelo camadas de cada pilha congelada
 * @property {number} antigas pilhas altas de varias camadas ja plantadas
 * @property {number} pre pilhas comuns ja plantadas
 * @property {boolean} protegida sem derrota (as abelhas resgatam)
 * @property {string} novidade chave do texto da novidade ('' = nenhuma)
 * @property {boolean} respiro fase facil depois de um trecho dificil
 */

/** Fases feitas a mao (1 a 16). Depois, a rodada procedural. */
const TABELA = [
  /* 1 */ { forma: 'flor13', cores: 3, meta: 30, alt: [2, 4], seg: 2, ajuda: 0.95, pre: 0, protegida: true },
  /* 2 */ { forma: 'flor13', cores: 3, meta: 40, alt: [2, 5], seg: 2, ajuda: 0.85, pre: 3, protegida: true },
  /* 3 */ { forma: 'colmeia19', cores: 4, meta: 50, alt: [2, 5], seg: 2, ajuda: 0.75, flores: 2, pre: 3, protegida: true, novidade: 'flor' },
  /* 4 */ { forma: 'colmeia19', cores: 4, meta: 60, alt: [2, 6], seg: 2, ajuda: 0.6, flores: 1, pre: 3, protegida: true, novidade: 'martelo' },
  /* 5 */ { forma: 'colmeia19', cores: 5, meta: 70, alt: [3, 6], seg: 2, ajuda: 0.45, trancas: [20, 45], pre: 2, novidade: 'tranca' },
  /* 6 */ { forma: 'anel18', cores: 5, meta: 85, alt: [3, 7], seg: 3, ajuda: 0.35, pSeg: [0.3, 0.75], flores: 2, trancas: [30], pre: 2, novidade: 'girar' },
  /* 7 */ { forma: 'colmeia19', cores: 6, meta: 100, alt: [3, 7], seg: 3, ajuda: 0.3, pSeg: [0.3, 0.75], flores: 1, pre: 3, novidade: 'troca' },
  /* 8 */ { forma: 'colmeia19', cores: 6, meta: 110, alt: [4, 8], seg: 3, ajuda: 0.2, pSeg: [0.15, 0.55], gelo: [1, 2], pre: 2, novidade: 'gelo' },
  /* 9 */ { forma: 'anel18', cores: 6, meta: 120, alt: [4, 8], seg: 3, ajuda: 0.25, pSeg: [0.15, 0.55], flores: 2, trancas: [40], pre: 2 },
  /* 10 */ { forma: 'colmeia19', cores: 4, meta: 70, alt: [2, 6], seg: 2, ajuda: 0.55, flores: 3, pre: 3, novidade: 'embaralhar', respiro: true },
  /* 11 */ { forma: 'colmeia19', cores: 6, meta: 120, alt: [4, 8], seg: 3, ajuda: 0.2, pSeg: [0.15, 0.55], antigas: 2, pre: 1, novidade: 'antigas' },
  /* 12 */ { forma: 'estrela25', cores: 7, meta: 135, alt: [4, 8], seg: 3, ajuda: 0.25, pSeg: [0.15, 0.55], trancas: [40, 80], gelo: [2], antigas: 1, pre: 2 },
  /* 13 */ { forma: 'alta29', cores: 7, meta: 160, alt: [4, 8], seg: 3, ajuda: 0.2, pSeg: [0.15, 0.55], flores: 2, pre: 3, novidade: 'maior' },
  /* 14 */ { forma: 'colmeia19', cores: 7, meta: 105, alt: [4, 8], seg: 3, ajuda: 0.25, pSeg: [0.15, 0.55], flores: 2, gelo: [1], pre: 2 },
  /* 15 */ { forma: 'alta29', cores: 5, meta: 100, alt: [3, 6], seg: 2, ajuda: 0.5, flores: 4, pre: 3, respiro: true },
  /* 16 */ { forma: 'grande37', cores: 7, meta: 190, alt: [4, 9], seg: 3, ajuda: 0.1, pSeg: [0.1, 0.45], flores: 2, trancas: [60], pre: 4, novidade: 'grande' },
];

/** Rodada procedural depois da tabela: formas e cores que se alternam (fase dificil a cada volta). */
const RODADA = [
  { forma: 'colmeia19', cores: 6, meta: 130 },
  { forma: 'estrela25', cores: 6, meta: 150 },
  { forma: 'alta29', cores: 7, meta: 170 },
  { forma: 'anel18', cores: 6, meta: 140 },
  { forma: 'grande37', cores: 7, meta: 200 },
];

/**
 * @param {number} n fase (1...)
 * @returns {ConfigFase}
 */
export function configFase(n) {
  const base = { alt: [2, 5], seg: 2, ajuda: 0.6, flores: 0, trancas: [], gelo: [], antigas: 0, pre: 2, protegida: false, novidade: '', respiro: false };
  if (n <= TABELA.length) return /** @type {ConfigFase} */ ({ ...base, ...TABELA[n - 1], n });
  const r = criarRng(hashTexto(`config-${n}`));
  const k = n - TABELA.length;
  const forma = RODADA[(k - 1) % RODADA.length];
  const respiro = n % 5 === 0;
  const subida = Math.min(0.3, k * 0.01);
  const meta = Math.round((forma.meta * (1 + subida) * (respiro ? 0.7 : 1)) / 5) * 5;
  const metaMel = meta;
  const trancas = r() < 0.55 ? [Math.round(metaMel * 0.3), ...(r() < 0.4 ? [Math.round(metaMel * 0.6)] : [])] : [];
  const gelo = r() < 0.5 ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => 1 + Math.floor(r() * 2)) : [];
  return /** @type {ConfigFase} */ ({
    ...base,
    n,
    forma: forma.forma,
    meta: metaMel,
    cores: respiro ? forma.cores - 1 : forma.cores,
    alt: respiro ? [3, 6] : [4, forma.forma === 'grande37' ? 9 : 8],
    seg: respiro ? 2 : 3,
    pSeg: respiro ? [0.45, 0.85] : forma.forma === 'grande37' ? [0.1, 0.45] : [0.15, 0.55],
    ajuda: respiro ? 0.5 : forma.forma === 'grande37' ? 0.1 : forma.forma === 'estrela25' ? 0.25 : 0.2,
    flores: (respiro ? 3 : 1) + Math.floor(r() * 2),
    trancas: respiro ? [] : trancas,
    gelo: respiro ? [] : gelo,
    antigas: respiro ? 0 : Math.floor(r() * 2),
    pre: 2 + Math.floor(r() * 2),
    respiro,
  });
}

/**
 * Uma pilha nova para a bandeja. A cor do topo tende as cores que ja estao no topo do tabuleiro (ajuda), mais
 * ainda quando falta espaco.
 * @param {() => number} rng
 * @param {ConfigFase} cfg
 * @param {import('./regras.js').Tabuleiro|null} tab
 * @returns {number[]}
 */
export function gerarPilha(rng, cfg, tab) {
  const [amin, amax] = cfg.alt;
  const altura = amin + Math.floor(rng() * (amax - amin + 1));
  const u = rng();
  const [p1, p2] = cfg.pSeg || [0.45, 0.85];
  let nseg = u < p1 ? 1 : u < p2 ? 2 : 3;
  nseg = Math.max(1, Math.min(nseg, cfg.seg, altura));
  // cor do topo
  /** @type {number[]} */
  const contagem = new Array(cfg.cores).fill(0);
  let livres = 99;
  if (tab) {
    for (const c of tab.celulas) if (ativa(c) && c.pilha.length) contagem[topo(c.pilha)] = (contagem[topo(c.pilha)] || 0) + 1;
    livres = celulasLivres(tab);
  }
  const ajuda = Math.min(0.97, cfg.ajuda + (livres <= 3 ? 0.25 : livres <= 6 ? 0.12 : 0));
  const total = contagem.reduce((a, b) => a + b, 0);
  let corTopo;
  if (total > 0 && rng() < ajuda) {
    let x = rng() * total;
    corTopo = 0;
    for (let k = 0; k < contagem.length; k++) { x -= contagem[k]; if (x < 0) { corTopo = k; break; } }
  } else corTopo = Math.floor(rng() * cfg.cores);
  // faixas de cima para baixo, cada uma de cor diferente da de cima
  /** @type {number[]} */
  const cores = [corTopo];
  for (let s = 1; s < nseg; s++) {
    let c = Math.floor(rng() * (cfg.cores - 1));
    if (c >= cores[s - 1]) c++;
    cores.push(c);
  }
  // tamanhos: cada faixa com pelo menos 1
  const tam = new Array(nseg).fill(1);
  for (let k = nseg; k < altura; k++) tam[Math.floor(rng() * nseg)]++;
  /** @type {number[]} */
  const pilha = [];
  for (let s = nseg - 1; s >= 0; s--) for (let k = 0; k < tam[s]; k++) pilha.push(cores[s]);
  return pilha;
}

/**
 * @typedef {object} Fase
 * @property {number} n
 * @property {ConfigFase} cfg
 * @property {import('./regras.js').Tabuleiro} tab
 * @property {(number[]|null)[]} bandeja 3 vagas (null = usada)
 * @property {() => number} rng
 * @property {number} tentativa
 */

/** Abertura roteirizada da fase 1: a primeira jogada guiada faz 2 meis em cascata. */
const ROTEIRO_1 = {
  plantadas: [
    { q: 0, r: -1, pilha: [0, 0, 0, 1, 1, 1, 1, 1] },
    { q: 1, r: 0, pilha: [1, 1, 1] },
    { q: -1, r: 0, pilha: [0, 0, 0, 0, 0, 0, 0] },
    { q: 1, r: 1, pilha: [2, 2, 2, 2, 2] },
  ],
  bandeja: [[0, 0, 0, 1, 1], [2, 2, 2], [0, 2, 2]],
  /** celula da primeira jogada (a mao-guia leva a pilha 0 ate aqui) */
  guia: { q: 0, r: 0 },
};
export const GUIA_FASE1 = ROTEIRO_1.guia;

/**
 * @param {number} n
 * @param {number} semente
 * @param {number} [tentativa] cada nova tentativa da mesma fase muda o sorteio
 * @returns {Fase}
 */
export function criarFase(n, semente, tentativa = 0) {
  const cfg = configFase(n);
  const rng = criarRng(hashTexto(`fase-${n}-${semente}-${tentativa}`));
  const coords = FORMAS[cfg.forma]();
  const tab = criarTabuleiro(coords, cfg.meta);
  const fase = { n, cfg, tab, bandeja: /** @type {(number[]|null)[]} */ ([null, null, null]), rng, tentativa };
  if (n === 1 && tentativa === 0) {
    for (const p of ROTEIRO_1.plantadas) {
      const c = tab.celulas.find((k) => k.q === p.q && k.r === p.r);
      if (c) c.pilha = p.pilha.slice();
    }
    fase.bandeja = ROTEIRO_1.bandeja.map((p) => p.slice());
    return fase;
  }
  const O = { q: 0, r: 0 };
  const idx = embaralhar(tab.celulas.map((_, i) => i), rng);
  // trancas e gelo preferem a borda; flores o miolo; plantadas espalhadas
  const borda = idx.filter((i) => distancia(tab.celulas[i], O) >= 2);
  const usadas = new Set();
  const pegar = (lista) => { const i = lista.find((k) => !usadas.has(k)); if (i !== undefined) usadas.add(i); return i; };
  for (const mel of cfg.trancas) {
    const i = pegar(borda);
    if (i !== undefined) tab.celulas[i].tranca = mel;
  }
  const comPilha = (/** @type {number} */ i, /** @type {number[]} */ p) => { tab.celulas[i].pilha = p; };
  for (const camadas of cfg.gelo) {
    const i = pegar(borda);
    if (i === undefined) continue;
    comPilha(i, gerarPilha(rng, { ...cfg, alt: [3, 5], seg: 2 }, null));
    tab.celulas[i].gelo = camadas;
  }
  for (let k = 0; k < cfg.antigas; k++) {
    const i = pegar(idx);
    if (i === undefined) continue;
    comPilha(i, gerarPilha(rng, { ...cfg, alt: [7, 9], seg: 3 }, null).concat(gerarPilha(rng, { ...cfg, alt: [1, 2], seg: 1 }, null)));
  }
  for (let k = 0; k < cfg.pre; k++) {
    const i = pegar(idx);
    if (i !== undefined) comPilha(i, gerarPilha(rng, { ...cfg, seg: 2 }, tab));
  }
  for (let k = 0; k < cfg.flores; k++) {
    const i = idx.find((j) => !tab.celulas[j].flor && tab.celulas[j].tranca === 0 && tab.celulas[j].gelo === 0);
    if (i !== undefined) tab.celulas[i].flor = true;
  }
  encherBandeja(fase);
  return fase;
}

/** Bandeja vazia: 3 pilhas novas. @param {Fase} f */
export function encherBandeja(f) {
  if (f.bandeja.some(Boolean)) return false;
  f.bandeja = [0, 1, 2].map(() => gerarPilha(f.rng, f.cfg, f.tab));
  return true;
}

/** Embaralhar (reforco): troca as pilhas que restam na bandeja. @param {Fase} f */
export function embaralharBandeja(f) {
  f.bandeja = f.bandeja.map((p) => (p ? gerarPilha(f.rng, f.cfg, f.tab) : null));
  if (!f.bandeja.some(Boolean)) encherBandeja(f);
}
