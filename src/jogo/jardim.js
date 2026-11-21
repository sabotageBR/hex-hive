// Jardim em volta da colmeia (a meta longa): uma planta por fase concluida e uma peca grande a cada 5.
// Puro: devolve nomes de sprites e posicoes no mundo; quem desenha e o render.
import { criarRng } from '../core/rng.js';

/** Flores (sprites de src/arte/jardim/), na ordem em que nascem. */
export const FLORES = Object.freeze([
  'flora-01', 'florb-01', 'flora-02', 'florb-06', 'flora-03', 'florb-03', 'flora-05', 'florb-07', 'flora-04',
  'florb-02', 'flora-08', 'florb-05', 'flora-06', 'florb-09', 'flora-09', 'florb-04', 'flora-07', 'florb-08',
]);
/** Pecas grandes (a cada 5 fases). */
export const GRANDES = Object.freeze([
  'enfeite-01', 'arvore-02', 'enfeite-06', 'arvore-06', 'enfeite-02', 'arvore-04', 'enfeite-09', 'arvore-03',
  'enfeite-05', 'arvore-07', 'enfeite-07', 'arvore-08', 'enfeite-04', 'arvore-09', 'enfeite-03', 'arvore-01',
  'enfeite-08', 'arvore-05',
]);

/**
 * Item numero k do jardim (k = 1 para a primeira fase concluida).
 * @param {number} k
 * @returns {{ sprite: string, grande: boolean }}
 */
export function itemDoJardim(k) {
  if (k % 5 === 0) return { sprite: GRANDES[(k / 5 - 1) % GRANDES.length], grande: true };
  const f = k - Math.floor(k / 5) - 1;
  return { sprite: FLORES[f % FLORES.length], grande: false };
}

/** Estacao do jardim (a cada 10 fases): 0 primavera, 1 verao, 2 outono, 3 noite. @param {number} fase */
export const estacao = (fase) => Math.floor((Math.max(1, fase) - 1) / 10) % 4;

/**
 * Vagas do jardim em aneis em volta do tabuleiro, as primeiras atras e dos lados (visiveis no retrato e na
 * paisagem), nunca na frente da bandeja.
 * @param {{x:number,z:number}[]} celulas centros das celulas
 * @param {number} quantas
 * @param {{ bandeja: {x:number,z:number}[], paisagem?: boolean }} o posicoes da bandeja (a frente fica livre); na
 *   paisagem os lados vem primeiro (sobra tela dos lados e o fundo fica atras do HUD)
 * @returns {{ x: number, z: number, anel: number }[][]} [flores, grandes]
 */
export function vagasDoJardim(celulas, quantas, o) {
  const rng = criarRng(4242);
  let raio = 0;
  for (const c of celulas) raio = Math.max(raio, Math.hypot(c.x, c.z));
  raio += 1.45;
  const longe = (x, z, lista, d) => lista.every((p) => Math.hypot(p.x - x, p.z - z) > d);
  /** @param {number} anel0 @param {number} passo @param {number} n */
  const gerar = (anel0, passo, n, folga) => {
    /** @type {{x:number,z:number,anel:number,p:number}[]} */
    const out = [];
    for (let anel = 0; out.length < n && anel < 14; anel++) {
      const r = raio + anel0 + anel * passo;
      const k = Math.max(6, Math.round((2 * Math.PI * r) / passo));
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + (anel % 2) * (Math.PI / k) + (rng() - 0.5) * 0.25;
        const x = Math.sin(a) * r + (rng() - 0.5) * 0.3;
        const z = -Math.cos(a) * r + (rng() - 0.5) * 0.3;
        // frente (perto da camera) fica para depois; em cima da bandeja, nunca
        if (!longe(x, z, o.bandeja, folga)) continue;
        const frente = Math.max(0, z) / r;
        const lado = Math.abs(Math.sin(a));
        const p = o.paisagem ? anel * 3 + frente * 2.5 + (1 - lado) * 3 : anel * 3 + frente * 4 + lado * 0.3;
        out.push({ x, z, anel, p });
      }
    }
    return out.sort((a, b) => a.p - b.p).slice(0, n);
  };
  const flores = gerar(0, 1.25, quantas, 2.2);
  const grandes = gerar(1.6, 2.2, Math.ceil(quantas / 5) + 2, 3.2)
    .filter((g) => longe(g.x, g.z, flores.slice(0, 12), 0.9));
  return [flores.map(({ x, z, anel }) => ({ x, z, anel })), grandes.map(({ x, z, anel }) => ({ x, z, anel }))];
}
