// Bot guloso: testa cada pilha da bandeja em cada celula livre (um lance a frente) e fica com a melhor nota.
// Serve para a ajuda automatica (mao-guia), o ?auto e a prova de conclusao das fases (npm run medir e testes).
import { clonar, colocar, celulasLivres, ativa, topo, faixas, sequenciaTopo, venceu, cheio, resgatar } from './regras.js';
import { criarFase, encherBandeja } from './fases.js';
import { criarRng, hashTexto } from '../core/rng.js';

/**
 * Nota do tabuleiro depois de um lance.
 * @param {import('./regras.js').Tabuleiro} t
 * @param {import('./regras.js').Evento[]} ev
 */
function nota(t, ev) {
  if (venceu(t)) return 1e6;
  let s = 0;
  for (const e of ev) {
    if (e.tipo === 'mel') s += 60 * e.ganho;
    else if (e.tipo === 'mover') s += 4 * e.qtd;
    else if (e.tipo === 'abrir') s += 40;
    else if (e.tipo === 'degelo') s += 15;
  }
  const livres = celulasLivres(t);
  if (livres === 0) s -= 5000;
  s += livres * 12;
  const cel = t.celulas;
  for (let i = 0; i < cel.length; i++) {
    const c = cel[i];
    if (!ativa(c) || !c.pilha.length) continue;
    s -= (faixas(c.pilha) - 1) * 6;
    s += sequenciaTopo(c.pilha) * 1.5;
    // vizinhos com topo diferente: travam o espaco
    for (const v of c.viz) {
      if (v < i) continue;
      const n = cel[v];
      if (ativa(n) && n.pilha.length && topo(n.pilha) !== topo(c.pilha)) s -= 3;
    }
  }
  return s;
}

/**
 * Melhor lance para a fase atual (nao mexe nela).
 * @param {import('./fases.js').Fase} f
 * @returns {{ s: number, i: number, nota: number } | null} s = vaga da bandeja, i = celula
 */
export function melhorJogada(f) {
  /** @type {{ s: number, i: number, nota: number } | null} */
  let melhor = null;
  const vistos = new Set();
  for (let s = 0; s < f.bandeja.length; s++) {
    const p = f.bandeja[s];
    if (!p) continue;
    const k = p.join('.');
    if (vistos.has(k)) continue;
    vistos.add(k);
    for (let i = 0; i < f.tab.celulas.length; i++) {
      const c = f.tab.celulas[i];
      if (c.pilha.length || c.tranca || c.gelo) continue;
      const t = clonar(f.tab);
      const ev = colocar(t, i, p);
      const n = nota(t, ev);
      if (!melhor || n > melhor.nota) melhor = { s, i, nota: n };
    }
  }
  return melhor;
}

/**
 * Lance ao acaso (o bot "distraido" imita quem nao pensa em toda jogada).
 * @param {import('./fases.js').Fase} f @param {() => number} r
 */
function lanceAoAcaso(f, r) {
  const livres = [];
  for (let i = 0; i < f.tab.celulas.length; i++) {
    const c = f.tab.celulas[i];
    if (!c.pilha.length && !c.tranca && !c.gelo) livres.push(i);
  }
  const vagas = [0, 1, 2].filter((k) => f.bandeja[k]);
  if (!livres.length || !vagas.length) return null;
  return { s: vagas[Math.floor(r() * vagas.length)], i: livres[Math.floor(r() * livres.length)], nota: 0 };
}

/**
 * Joga uma fase inteira com o bot.
 * @param {number} n
 * @param {number} semente
 * @param {{ limite?: number, distraido?: number }} [o] distraido = fracao de lances ao acaso (0 = guloso puro)
 * @returns {{ venceu: boolean, jogadas: number, mel: number, resgates: number }}
 */
export function jogarFase(n, semente, o = {}) {
  const limite = o.limite || 400;
  const eps = o.distraido || 0;
  const f = criarFase(n, semente);
  const r = criarRng(hashTexto(`bot-${n}-${semente}`));
  let resgates = 0;
  while (f.tab.jogadas < limite) {
    const j = eps && r() < eps ? lanceAoAcaso(f, r) : melhorJogada(f);
    if (!j) break;
    const p = /** @type {number[]} */ (f.bandeja[j.s]);
    f.bandeja[j.s] = null;
    colocar(f.tab, j.i, p);
    if (venceu(f.tab)) return { venceu: true, jogadas: f.tab.jogadas, mel: f.tab.mel, resgates };
    encherBandeja(f);
    if (cheio(f.tab)) {
      if (!f.cfg.protegida) return { venceu: false, jogadas: f.tab.jogadas, mel: f.tab.mel, resgates };
      resgatar(f.tab, 3);
      resgates++;
    }
  }
  return { venceu: false, jogadas: f.tab.jogadas, mel: f.tab.mel, resgates };
}
