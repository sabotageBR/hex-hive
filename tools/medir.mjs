// Mede as fases com o bot guloso (src/jogo/bot.js): conclusao, jogadas e minutos estimados por fase.
// Uso: node tools/medir.mjs [--fases=1-40] [--sementes=200] [--seg=3.4] [--distraido=0.35]
//   --distraido = fracao de lances ao acaso do segundo bot (aproxima uma pessoa que nao pensa em toda jogada).
//   --seg = segundos por jogada de uma pessoa (pensar, arrastar e ver a cascata), para o ritmo.
import { jogarFase } from '../src/jogo/bot.js';
import { configFase } from '../src/jogo/fases.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1];
const [ini, fim] = arg('fases', '1-40').split('-').map(Number);
const sementes = Number(arg('sementes', 200));
const seg = Number(arg('seg', 3.4));

let acumulado = 0;
let pior = 1;
const eps = Number(arg('distraido', 0.35));
process.stdout.write(`fase forma      cores meta  guloso  distraido(${eps})  jogadas  min/fase  acumulado  novidade\n`);
let piorD = 1;
for (let n = ini; n <= (fim || ini); n++) {
  const cfg = configFase(n);
  let ok = 0;
  let okD = 0;
  let jogadas = 0;
  for (let s = 1; s <= sementes; s++) {
    const r = jogarFase(n, s * 7919);
    if (r.venceu) { ok++; jogadas += r.jogadas; }
    if (jogarFase(n, s * 7919, { distraido: eps }).venceu) okD++;
  }
  const taxaD = okD / sementes;
  piorD = Math.min(piorD, taxaD);
  const taxa = ok / sementes;
  pior = Math.min(pior, taxa);
  const media = ok ? jogadas / ok : 0;
  const min = (media * seg) / 60;
  acumulado += min;
  process.stdout.write(`${String(n).padStart(4)} ${cfg.forma.padEnd(10)} ${String(cfg.cores).padStart(5)} ${String(cfg.meta).padStart(4)}  ${(taxa * 100).toFixed(0).padStart(5)}%  ${(taxaD * 100).toFixed(0).padStart(14)}%  ${media.toFixed(1).padStart(7)}  ${min.toFixed(2).padStart(8)}  ${acumulado.toFixed(1).padStart(9)}  ${cfg.novidade}\n`);
}
process.stdout.write(`pior conclusao: guloso ${(pior * 100).toFixed(1)}%, distraido ${(piorD * 100).toFixed(1)}%\n`);
