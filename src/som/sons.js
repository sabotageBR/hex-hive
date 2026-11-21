// Sons do Combloom, sintetizados (src/som/receitas.js): madeira e cera para as pecas, mel doce e brilhante.
// Contrato: (v, t0, p) => duracao em s, sem sorteio.
//
// Regra do estudio (1.1.0): nada de "catraca" junto do som de acerto: cliques rapidos em sequencia, tique-tique,
// "trrr", contagem de moedas, roleta. Cada evento toca UM som limpo: as camadas de um som comecam juntas (acorde
// inteiro, sem dedilhado), notas em sequencia ficam a >= 0,12 s uma da outra e nao ha tremolo rapido (o "trrr").
// A cascata toca uma nota por GRUPO de pecas que pula (nunca uma por peca). test/sons.test.js confere.
import { tom, sopro, hz } from './receitas.js';

/** escala pentatonica (graus em semitons) para os grupos da cascata */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export const SONS = {
  /** pegar a pilha da bandeja: "pop" macio */
  pegar(v, t0) {
    return tom(v, t0, { f: 380, f2: 560, glide: 0.06, vol: 0.08, ataque: 0.006, queda: 0.1, tipo: 'sine' }) - t0;
  },
  /** pilha pousa na celula: um toque surdo de madeira macia */
  pousar(v, t0) {
    sopro(v, t0, { f: 520, q: 0.9, vol: 0.08, ataque: 0.004, queda: 0.08, filtro: 'lowpass' });
    return tom(v, t0, { f: 170, f2: 110, vol: 0.2, ataque: 0.004, queda: 0.14, tipo: 'sine' }) - t0;
  },
  /** um grupo de pecas pula para a pilha vizinha: sopro de ar e uma nota que sobe a cada grupo (p.n) */
  voar(v, t0, p) {
    const n = Math.min(PENTA.length - 1, (p && p.n) || 0);
    const f = hz(67 + PENTA[n]);
    sopro(v, t0, { f: 900, f2: 2200, q: 0.7, vol: 0.035, ataque: 0.05, queda: 0.2 });
    return tom(v, t0, { f, f2: f * 1.012, vol: 0.065, ataque: 0.02, queda: 0.32, tipo: 'sine' }) - t0;
  },
  /** mel! acorde doce que sai inteiro, mais um grave quente (p.k = meis seguidos: o tom sobe) */
  mel(v, t0, p) {
    const k = Math.min(4, (p && p.k) || 0);
    const base = 64 + k * 2;
    let fim = t0;
    for (const g of [0, 4, 7, 12]) {
      fim = Math.max(fim, tom(v, t0, { f: hz(base + g), vol: 0.055, ataque: 0.012, queda: 0.6, tipo: 'sine', vib: { f: 5, prof: 2 } }));
    }
    tom(v, t0, { f: hz(base - 12), vol: 0.07, ataque: 0.01, queda: 0.32, tipo: 'triangle', filtro: { tipo: 'lowpass', f: 900 } });
    return fim - t0;
  },
  /** gelo racha (um estalo so) */
  gelo(v, t0) {
    sopro(v, t0, { f: 4800, q: 3, vol: 0.07, ataque: 0.002, queda: 0.1 });
    return tom(v, t0, { f: 2100, f2: 1500, vol: 0.04, ataque: 0.003, queda: 0.12, tipo: 'triangle' }) - t0;
  },
  /** tranca abre: um sino */
  abrir(v, t0) {
    tom(v, t0, { f: 2640, vol: 0.025, ataque: 0.004, queda: 0.25, tipo: 'sine' });
    return tom(v, t0, { f: 1320, vol: 0.075, ataque: 0.004, queda: 0.4, tipo: 'sine' }) - t0;
  },
  /** martelo / abelhas levam a pilha */
  levar(v, t0) {
    sopro(v, t0, { f: 400, q: 0.8, vol: 0.14, ataque: 0.004, queda: 0.12, filtro: 'lowpass' });
    return tom(v, t0, { f: 300, f2: 900, vol: 0.07, ataque: 0.01, queda: 0.3, tipo: 'triangle' }) - t0;
  },
  /** troca de lugar */
  trocar(v, t0) {
    sopro(v, t0, { f: 900, f2: 2400, q: 1.2, vol: 0.07, ataque: 0.02, queda: 0.25 });
    return tom(v, t0, { f: 500, f2: 800, vol: 0.06, ataque: 0.01, queda: 0.2, tipo: 'sine' }) - t0;
  },
  /** bandeja nova: uma bolha */
  bandeja(v, t0) {
    return tom(v, t0, { f: 520, f2: 740, glide: 0.08, vol: 0.06, ataque: 0.01, queda: 0.16, tipo: 'sine' }) - t0;
  },
  /** nao pode (celula ocupada, sem reforco) */
  erro(v, t0) {
    return tom(v, t0, { f: 220, f2: 170, vol: 0.07, ataque: 0.004, queda: 0.12, tipo: 'square', filtro: { tipo: 'lowpass', f: 1200 } }) - t0;
  },
  /** fase completa: 3 notas e o acorde final */
  festa(v, t0) {
    [60, 64, 67].forEach((m, i) => tom(v, t0 + i * 0.13, { f: hz(m), vol: 0.08, ataque: 0.006, queda: 0.3, tipo: 'triangle' }));
    let fim = t0;
    for (const m of [72, 76, 79]) fim = Math.max(fim, tom(v, t0 + 0.39, { f: hz(m), vol: 0.065, ataque: 0.01, queda: 0.7, tipo: 'triangle' }));
    return fim - t0;
  },
  /** planta nova brota no jardim */
  brotar(v, t0) {
    let fim = t0;
    [79, 84, 88].forEach((m, i) => {
      fim = tom(v, t0 + i * 0.14, { f: hz(m), vol: 0.045, ataque: 0.006, queda: 0.5, tipo: 'sine' });
    });
    return fim - t0;
  },
  /** sem espaco */
  cheio(v, t0) {
    let fim = t0;
    [67, 63, 60].forEach((m, i) => { fim = tom(v, t0 + i * 0.15, { f: hz(m), vol: 0.07, ataque: 0.006, queda: 0.25, tipo: 'triangle' }); });
    return fim - t0;
  },
  /** presente / premio */
  presente(v, t0) {
    let fim = t0;
    [76, 79, 84].forEach((m, i) => { fim = tom(v, t0 + i * 0.13, { f: hz(m), vol: 0.06, ataque: 0.006, queda: 0.35, tipo: 'sine' }); });
    return fim - t0;
  },
};
