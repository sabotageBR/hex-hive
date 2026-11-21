// Sons sem "catraca": nenhuma receita dispara cliques rapidos em sequencia (tique-tique, contagem, roleta) nem
// tremolo na faixa do "trrr". Contexto de audio falso: so registra quando cada fonte comeca e a frequencia
// inicial de cada oscilador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONS } from '../src/som/sons.js';

function ctxFalso() {
  /** @type {number[]} */
  const inicios = [];
  /** @type {number[]} */
  const freqs = [];
  const param = (aoDefinir) => ({
    value: 0,
    setValueAtTime(v) { if (aoDefinir) aoDefinir(v); },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const no = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createOscillator() {
      let primeira = true;
      return {
        ...no(),
        type: 'sine',
        frequency: param((v) => { if (primeira) { freqs.push(v); primeira = false; } }),
        detune: param(),
        setPeriodicWave() {},
        start(t) { inicios.push(t); },
        stop() {},
      };
    },
    createGain() { return { ...no(), gain: param() }; },
    createBiquadFilter() { return { ...no(), type: 'lowpass', frequency: param(), Q: param(), gain: param() }; },
    createBufferSource() { return { ...no(), buffer: null, loop: false, start(t) { inicios.push(t); }, stop() {} }; },
    createBuffer(_c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; },
  };
  return { v: { ctx: /** @type {any} */ (ctx), destino: /** @type {any} */ (no()) }, inicios, freqs };
}

const VARIANTES = [{}, ...Array.from({ length: 11 }, (_, n) => ({ n })), ...Array.from({ length: 5 }, (_, k) => ({ k }))];

test('sons: nenhuma receita toca cliques em sequencia rapida (catraca)', () => {
  for (const [nome, receita] of Object.entries(SONS)) {
    for (const p of VARIANTES) {
      const f = ctxFalso();
      const dur = receita(f.v, 1, p);
      assert.ok(dur > 0 && dur < 2, `${nome}: duracao ${dur}`);
      // inicios a menos de 12 ms se fundem (o ouvido escuta um som so)
      const t = [...new Set(f.inicios.map((x) => Math.round((x - 1) * 1000)))].sort((a, b) => a - b);
      for (let i = 1; i < t.length; i++) {
        const gap = t[i] - t[i - 1];
        assert.ok(gap <= 12 || gap >= 115, `${nome} ${JSON.stringify(p)}: notas a ${gap} ms uma da outra (${t.join(', ')} ms)`);
      }
    }
  }
});

test('sons: sem tremolo na faixa do "trrr" (15 a 80 Hz)', () => {
  for (const [nome, receita] of Object.entries(SONS)) {
    const f = ctxFalso();
    receita(f.v, 1, {});
    for (const hzIni of f.freqs) assert.ok(hzIni < 15 || hzIni >= 80, `${nome}: oscilador a ${hzIni} Hz`);
  }
});
