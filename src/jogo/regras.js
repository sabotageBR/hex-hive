// Regras do tabuleiro: colocar pilha, fundir pelo topo, virar mel, gelo, trancas e reforcos. Puro.
//
// Fusao (docs/GDD.md):
//  1. fila de celulas "sujas" (comeca na pilha colocada). Para cada uma: grupo = ela + vizinhos ATIVOS com a
//     mesma cor no topo; alvo = maior sequencia daquela cor no topo (empate: a propria celula); a sequencia do
//     topo de cada outro membro pula para o alvo. Quem perdeu pecas e o alvo voltam para a fila.
//  2. fila vazia: toda pilha ativa com LIMITE_MEL ou mais da mesma cor no topo vira mel (a sequencia some).
//     Mel em celula de flor vale dobrado; cada mel derrete 1 camada de gelo dos vizinhos; trancas abrem quando o
//     mel da fase alcanca o numero delas. As celulas que mudaram voltam para a fila.
//  3. repete ate nada mudar.
// Os eventos devolvidos descrevem tudo, em ordem, para a animacao.

import { DIRS, chave, paraMundo } from './hex.js';

/** Pecas da mesma cor no topo que viram mel. */
export const LIMITE_MEL = 10;

/**
 * @typedef {object} Celula
 * @property {number} q
 * @property {number} r
 * @property {number} x centro no mundo
 * @property {number} z
 * @property {number[]} pilha cores, da base para o topo
 * @property {boolean} flor mel aqui vale dobrado
 * @property {number} tranca 0 = aberta; N = abre quando o mel da fase chegar a N
 * @property {number} gelo camadas de gelo (0 = ativa)
 * @property {number[]} viz indices dos vizinhos
 */

/**
 * @typedef {object} Tabuleiro
 * @property {Celula[]} celulas
 * @property {number} mel mel da fase
 * @property {number} meta
 * @property {number} jogadas
 */

/**
 * @typedef {{tipo:'pousar', i:number, pilha:number[]}
 *  | {tipo:'mover', de:number, para:number, cor:number, qtd:number}
 *  | {tipo:'mel', i:number, cor:number, qtd:number, ganho:number, flor:boolean}
 *  | {tipo:'degelo', i:number, resta:number}
 *  | {tipo:'abrir', i:number}
 *  | {tipo:'levar', i:number, pilha:number[]}
 *  | {tipo:'trocar', a:number, b:number}} Evento
 */

/**
 * @param {{q:number,r:number}[]} coords
 * @param {number} meta
 * @returns {Tabuleiro}
 */
export function criarTabuleiro(coords, meta) {
  const idx = new Map(coords.map((c, i) => [chave(c.q, c.r), i]));
  const celulas = coords.map((c) => {
    const m = paraMundo(c.q, c.r);
    return {
      q: c.q, r: c.r, x: m.x, z: m.z, pilha: /** @type {number[]} */ ([]), flor: false, tranca: 0, gelo: 0,
      viz: DIRS.map(([dq, dr]) => idx.get(chave(c.q + dq, c.r + dr))).filter((v) => v !== undefined).map(Number),
    };
  });
  return { celulas, mel: 0, meta, jogadas: 0 };
}

/** @param {Tabuleiro} t */
export function clonar(t) {
  return {
    celulas: t.celulas.map((c) => ({ ...c, pilha: c.pilha.slice() })),
    mel: t.mel, meta: t.meta, jogadas: t.jogadas,
  };
}

/** @param {number[]} p */
export const topo = (p) => (p.length ? p[p.length - 1] : -1);

/** Quantas pecas iguais seguidas no topo. @param {number[]} p */
export function sequenciaTopo(p) {
  if (!p.length) return 0;
  const cor = p[p.length - 1];
  let n = 0;
  for (let i = p.length - 1; i >= 0 && p[i] === cor; i--) n++;
  return n;
}

/** Quantas faixas de cor a pilha tem. @param {number[]} p */
export function faixas(p) {
  let n = 0;
  for (let i = 0; i < p.length; i++) if (i === 0 || p[i] !== p[i - 1]) n++;
  return n;
}

/** Participa das fusoes. @param {Celula} c */
export const ativa = (c) => c.tranca === 0 && c.gelo === 0;
/** Pode receber uma pilha da bandeja. @param {Celula} c */
export const livre = (c) => c.tranca === 0 && c.gelo === 0 && c.pilha.length === 0;

/** @param {Tabuleiro} t */
export const celulasLivres = (t) => t.celulas.reduce((n, c) => n + (livre(c) ? 1 : 0), 0);

/**
 * Coloca uma pilha numa celula livre e resolve tudo.
 * @param {Tabuleiro} t
 * @param {number} i
 * @param {number[]} pilha
 * @returns {Evento[]} vazio se a celula nao estava livre
 */
export function colocar(t, i, pilha) {
  const c = t.celulas[i];
  if (!c || !livre(c) || !pilha.length) return [];
  c.pilha = pilha.slice();
  t.jogadas++;
  /** @type {Evento[]} */
  const ev = [{ tipo: 'pousar', i, pilha: pilha.slice() }];
  resolver(t, [i], ev);
  return ev;
}

/**
 * Resolve fusoes e mel a partir das celulas sujas.
 * @param {Tabuleiro} t
 * @param {number[]} sujas
 * @param {Evento[]} ev acumula os eventos
 */
export function resolver(t, sujas, ev) {
  const cel = t.celulas;
  const fila = sujas.slice();
  let guarda = 0;
  for (;;) {
    while (fila.length && guarda++ < 5000) {
      const i = /** @type {number} */ (fila.shift());
      const c = cel[i];
      if (!ativa(c) || !c.pilha.length) continue;
      const cor = topo(c.pilha);
      const grupo = [i];
      for (const v of c.viz) if (ativa(cel[v]) && cel[v].pilha.length && topo(cel[v].pilha) === cor) grupo.push(v);
      if (grupo.length < 2) continue;
      let alvo = i;
      let melhor = sequenciaTopo(c.pilha);
      for (const g of grupo) {
        const s = sequenciaTopo(cel[g].pilha);
        if (s > melhor) { melhor = s; alvo = g; }
      }
      for (const g of grupo) {
        if (g === alvo) continue;
        const qtd = sequenciaTopo(cel[g].pilha);
        cel[g].pilha.length -= qtd;
        for (let k = 0; k < qtd; k++) cel[alvo].pilha.push(cor);
        ev.push({ tipo: 'mover', de: g, para: alvo, cor, qtd });
        if (cel[g].pilha.length && !fila.includes(g)) fila.push(g);
      }
      if (!fila.includes(alvo)) fila.push(alvo);
    }
    // fila vazia: o que chegou ao limite vira mel
    /** @type {number[]} */
    const viraram = [];
    for (let i = 0; i < cel.length; i++) {
      const c = cel[i];
      if (!ativa(c)) continue;
      const qtd = sequenciaTopo(c.pilha);
      if (qtd < LIMITE_MEL) continue;
      const cor = topo(c.pilha);
      c.pilha.length -= qtd;
      const ganho = qtd * (c.flor ? 2 : 1);
      t.mel += ganho;
      ev.push({ tipo: 'mel', i, cor, qtd, ganho, flor: c.flor });
      viraram.push(i);
    }
    if (!viraram.length) break;
    for (const i of viraram) {
      if (cel[i].pilha.length && !fila.includes(i)) fila.push(i);
      for (const v of cel[i].viz) {
        const n = cel[v];
        if (n.gelo > 0) {
          n.gelo--;
          ev.push({ tipo: 'degelo', i: v, resta: n.gelo });
          if (n.gelo === 0 && !fila.includes(v)) fila.push(v);
        }
      }
    }
    for (let i = 0; i < cel.length; i++) {
      if (cel[i].tranca > 0 && t.mel >= cel[i].tranca) {
        cel[i].tranca = 0;
        ev.push({ tipo: 'abrir', i });
      }
    }
  }
}

/** @param {Tabuleiro} t */
export const venceu = (t) => t.mel >= t.meta;
/** Sem celula livre: a fase acaba (ou as abelhas resgatam, nas fases protegidas). @param {Tabuleiro} t */
export const cheio = (t) => celulasLivres(t) === 0;

/**
 * Martelo: tira a pilha de uma celula ativa.
 * @param {Tabuleiro} t @param {number} i
 * @returns {Evento[]}
 */
export function martelar(t, i) {
  const c = t.celulas[i];
  if (!c || !ativa(c) || !c.pilha.length) return [];
  const pilha = c.pilha;
  c.pilha = [];
  return [{ tipo: 'levar', i, pilha }];
}

/**
 * Troca: duas celulas ativas trocam de pilha (uma pode estar vazia) e tudo se resolve.
 * @param {Tabuleiro} t @param {number} a @param {number} b
 * @returns {Evento[]}
 */
export function trocar(t, a, b) {
  const A = t.celulas[a];
  const B = t.celulas[b];
  if (!A || !B || a === b || !ativa(A) || !ativa(B) || (!A.pilha.length && !B.pilha.length)) return [];
  const p = A.pilha;
  A.pilha = B.pilha;
  B.pilha = p;
  /** @type {Evento[]} */
  const ev = [{ tipo: 'trocar', a, b }];
  resolver(t, [a, b].filter((k) => t.celulas[k].pilha.length), ev);
  return ev;
}

/**
 * Resgate (fases protegidas e premiado "abrir espaco"): as abelhas levam as N pilhas mais misturadas.
 * @param {Tabuleiro} t @param {number} n
 * @returns {Evento[]}
 */
export function resgatar(t, n) {
  const ordem = t.celulas.map((c, i) => ({ i, c }))
    .filter(({ c }) => ativa(c) && c.pilha.length)
    .sort((a, b) => (faixas(b.c.pilha) - faixas(a.c.pilha)) || (b.c.pilha.length - a.c.pilha.length) || (a.i - b.i));
  return ordem.slice(0, n).flatMap(({ i }) => martelar(t, i));
}
