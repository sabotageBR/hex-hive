// Grade hexagonal (coordenadas axiais q, r; hexagono "flat-top": topo e base retos). Puro e deterministico.
// Mundo: x para a direita, z para baixo da tela (para perto da camera); tamanho 1 = raio do hexagono.

export const DIRS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]);
const RAIZ3 = Math.sqrt(3);

/** @param {number} q @param {number} r */
export const chave = (q, r) => `${q},${r}`;

/** @param {{q:number,r:number}} a @param {{q:number,r:number}} b */
export function distancia(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Centro da celula no mundo. @param {number} q @param {number} r @param {number} [tam] */
export function paraMundo(q, r, tam = 1) {
  return { x: tam * 1.5 * q, z: tam * RAIZ3 * (r + q / 2) };
}

/** Celula mais proxima de um ponto do mundo (arredondamento cubico). @param {number} x @param {number} z */
export function doMundo(x, z, tam = 1) {
  const qf = (2 / 3) * x / tam;
  const rf = (-1 / 3) * x / tam + (RAIZ3 / 3) * z / tam;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** Todas as celulas a distancia <= raio do centro. @param {number} raio */
export function hexagono(raio) {
  /** @type {{q:number,r:number}[]} */
  const out = [];
  for (let q = -raio; q <= raio; q++) {
    for (let r = Math.max(-raio, -q - raio); r <= Math.min(raio, -q + raio); r++) out.push({ q, r });
  }
  return out;
}

const O = { q: 0, r: 0 };
const ehCanto2 = (c) => distancia(c, O) === 2 && DIRS.some(([dq, dr]) => c.q === 2 * dq && c.r === 2 * dr);

/** Formas de tabuleiro, por nome. */
export const FORMAS = Object.freeze({
  /** 13: centro, anel 1 e o meio de cada lado do anel 2 (parece uma flor) */
  flor13: () => hexagono(2).filter((c) => !ehCanto2(c)),
  /** 19: hexagono de raio 2 */
  colmeia19: () => hexagono(2),
  /** 18: anel sem o centro (raio 1 e 2) */
  anel18: () => hexagono(2).filter((c) => distancia(c, O) > 0),
  /** 25: raio 2 mais os 6 cantos do anel 3 */
  estrela25: () => hexagono(3).filter((c) => distancia(c, O) <= 2
    || DIRS.some(([dq, dr]) => c.q === 3 * dq && c.r === 3 * dr)),
  /** 29: raio 3 cortado nas colunas de fora (alto, bom no retrato) */
  alta29: () => hexagono(3).filter((c) => Math.abs(c.q) <= 2),
  /** 37: hexagono de raio 3 */
  grande37: () => hexagono(3),
});

/** @typedef {keyof typeof FORMAS} NomeForma */
