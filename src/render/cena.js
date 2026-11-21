// Cena 3D do Combloom (three.js r187 do kit): colmeia que gira, pecas, bandeja, jardim, abelhas e efeitos.
// Leve para celular: pecas, simbolos, sombras de contato, celulas e gelo em InstancedMesh (poucas chamadas de
// desenho), 2 luzes e um mapa de ambiente pequeno (PMREM de uma cena de gradiente com 3 "softboxes": o brilho e o
// reflexo suaves das pecas), sem sombra real. Se o aparelho nao segura ~60 fps, o pixel ratio cai sozinho.
//
// Pecas: prisma hexagonal com cantos e chanfro arredondados (normais suaves), oclusao assada nos vertices (o sulco
// entre pecas empilhadas), oclusao entre pilhas (vizinha mais alta escurece a camada), sombra de contato embaixo de
// cada pilha, da pilha arrastada e das pecas no ar, e um simbolo por cor no topo (leitura sem depender da cor).
//
// A logica (src/jogo) resolve cada lance na hora; aqui os eventos viram animacao em fila. O que se ve (vis) anda
// atras da logica e alcanca ela no fim da fila; acelerar() pula direto para o estado final.
//
// Giro: a colmeia (celulas, gelo, alvo, rotulos) fica num grupo que gira em volta do centro (0, 0); as pecas sao
// desenhadas em coordenadas do mundo, e as da colmeia passam pelo mesmo giro. Bandeja, jardim e chao nao giram. Toda
// conversao tela <-> celula passa pelo giro (raio contra as pilhas, no espaco da colmeia).
import * as THREE from 'three';
import { doMundo, chave } from '../jogo/hex.js';
import { itemDoJardim, vagasDoJardim, estacao } from '../jogo/jardim.js';
import { criarRng } from '../core/rng.js';

/** Cores das pecas (indice = cor da logica). Paleta da biblia de arte (docs/GDD.md). */
export const PALETA = ['#f0525e', '#3d8bff', '#45c15a', '#9b5de5', '#ff73c3', '#16c3c0', '#ff9a2e'];
/** Simbolo de cada cor, no topo da pilha (daltonismo): coracao, gota, folha, estrela, lua, losango, sol. */
export const SIMBOLOS = ['coracao', 'gota', 'folha', 'estrela', 'lua', 'losango', 'sol'];
const COR_MEL = new THREE.Color('#f5b82e');

const ALT_PECA = 0.17; // altura de cada peca na pilha
const H_PECA = ALT_PECA * 0.94; // a peca em si (o resto e o sulco)
const BASE = 0.25; // topo da celula
const R_CEL = 0.94;
const R_PECA = 0.84;
const GAP_VOO = 0.055; // s entre pecas que pulam
const DUR_VOO = 0.3;
const MAX_PECAS = 1600;
const MAX_SIMB = 240;
const MAX_SOMBRAS = 220;
const SEXTO = Math.PI / 3;

/** Arte carregada no comeco (src/arte). */
const ARQ_JARDIM = [
  ...Array.from({ length: 9 }, (_, i) => `jardim/flora-0${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `jardim/florb-0${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `jardim/enfeite-0${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `jardim/arvore-0${i + 1}`),
];
const ARQ_OUTROS = ['abelhas/abelha-01', 'abelhas/abelha-04', 'abelhas/abelha-07', 'abelhas/abelha-08', 'icones/icone-01',
  'icones/icone-07', 'icones/icone-08', 'topos/topo-01', 'topos/topo-03', 'topos/topo-04', 'topos/topo-05', 'topos/topo-08'];

/**
 * Estacoes: ceu/neblina, tinta da grama, luz (o ambiente PMREM soma uma luz suave a tudo que e Standard). chao = luz
 * que a grama recebia na 1.0 (sol * 0,84 + hemisferio): a grama e Lambert e fica com o mesmo brilho de antes.
 */
const ESTACOES = [
  { ceu: '#cdeeff', grama: '#ffffff', hemiCeu: '#fff6e0', hemiChao: '#6aa84f', hemi: 0.6, sol: '#ffffff', solI: 1.8, amb: 0.4, tinta: '#ffffff', chao: 3.68 },
  { ceu: '#ffe7b0', grama: '#fff3c4', hemiCeu: '#fff0c8', hemiChao: '#7cb342', hemi: 0.65, sol: '#fff1d6', solI: 1.9, amb: 0.4, tinta: '#ffffff', chao: 4.03 },
  { ceu: '#ffd2a0', grama: '#f0b878', hemiCeu: '#ffe2c0', hemiChao: '#b07a3a', hemi: 0.6, sol: '#ffd9a8', solI: 1.8, amb: 0.38, tinta: '#fff0dc', chao: 3.63 },
  // noite: chao e ceu escuros, mas a luz das pecas continua clara (as cores tem de se ler)
  { ceu: '#2a3a6e', grama: '#8a9cd0', hemiCeu: '#e4eaff', hemiChao: '#56679a', hemi: 0.6, sol: '#eef2ff', solI: 1.7, amb: 0.4, tinta: '#c9d3ff', chao: 3.28 },
];

/** Hexagono "flat-top" com bisel reto (so o gelo usa: facetado parece cristal). */
function hexBiselado(r, h, b) {
  const V = THREE.Vector2;
  const g = new THREE.LatheGeometry([new V(0, 0), new V(r - b, 0), new V(r, b), new V(r, h - b), new V(r - b, h), new V(0, h)], 6, Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * Prisma hexagonal "flat-top" com cantos (vistos de cima) e chanfros (topo e base) arredondados. Normais suaves no
 * chanfro e nos cantos, lados retos. A cor por vertice e a oclusao assada: a base escurece (o sulco entre pecas).
 * @param {number} R raio ate o vertice do hexagono
 * @param {number} h altura
 * @param {number} b raio do chanfro
 * @param {number} rc raio do canto (>= b)
 * @param {{ S?: number, M?: number, aoBase?: number }} [o] S segmentos por canto, M por chanfro
 */
function hexArredondado(R, h, b, rc, o = {}) {
  const S = o.S ?? 2;
  const M = o.M ?? 3;
  const aoBase = o.aoBase ?? 0.6;
  const dc = R - rc / Math.cos(Math.PI / 6); // centro do arco de cada canto
  /** @type {number[][]} centro do arco (x, z) e direcao para fora (nx, nz) */
  const contorno = [];
  for (let k = 0; k < 6; k++) {
    const th = k * SEXTO;
    for (let s = 0; s <= S; s++) {
      const phi = th - SEXTO / 2 + (s / S) * SEXTO;
      contorno.push([Math.cos(th) * dc, Math.sin(th) * dc, Math.cos(phi), Math.sin(phi)]);
    }
  }
  /** @type {number[][]} recuo, y, normal horizontal, normal vertical, oclusao */
  const perfil = [];
  for (let m = 0; m <= M; m++) {
    const a = (m / M) * (Math.PI / 2);
    perfil.push([b - b * Math.sin(a), b - b * Math.cos(a), Math.sin(a), -Math.cos(a), aoBase + (0.86 - aoBase) * (m / M)]);
  }
  for (let m = 0; m <= M; m++) {
    const a = (m / M) * (Math.PI / 2);
    perfil.push([b - b * Math.cos(a), h - b + b * Math.sin(a), Math.cos(a), Math.sin(a), 0.95 + 0.05 * (m / M)]);
  }
  const N = contorno.length;
  const P = perfil.length;
  /** @type {number[]} */ const pos = [];
  /** @type {number[]} */ const nor = [];
  /** @type {number[]} */ const cor = [];
  /** @type {number[]} */ const idx = [];
  for (const [d, y, nh, nv, ao] of perfil) {
    for (const [cx, cz, nx, nz] of contorno) {
      const r = rc - d;
      pos.push(cx + nx * r, y, cz + nz * r);
      nor.push(nx * nh, nv, nz * nh);
      cor.push(ao, ao, ao);
    }
  }
  for (let r = 0; r < P - 1; r++) {
    for (let c = 0; c < N; c++) {
      const a = r * N + c;
      const b2 = r * N + ((c + 1) % N);
      const c2 = (r + 1) * N + c;
      const d2 = (r + 1) * N + ((c + 1) % N);
      idx.push(a, c2, b2, b2, c2, d2);
    }
  }
  const cb = pos.length / 3;
  pos.push(0, 0, 0);
  nor.push(0, -1, 0);
  cor.push(aoBase, aoBase, aoBase);
  for (let c = 0; c < N; c++) idx.push(cb, c, (c + 1) % N);
  const ct = pos.length / 3;
  pos.push(0, h, 0);
  nor.push(0, 1, 0);
  cor.push(1, 1, 1);
  const topo = (P - 1) * N;
  for (let c = 0; c < N; c++) idx.push(ct, topo + ((c + 1) % N), topo + c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setIndex(idx);
  return g;
}

/** Hexagono plano de cantos arredondados, virado para cima, com UV como o CircleGeometry (topos texturizados). */
function hexPlanoArredondado(R, rc, S = 3) {
  const dc = R - rc / Math.cos(Math.PI / 6);
  const pos = [0, 0, 0];
  const uv = [0.5, 0.5];
  const nor = [0, 1, 0];
  /** @type {number[]} */
  const idx = [];
  for (let k = 0; k < 6; k++) {
    const th = k * SEXTO;
    for (let s = 0; s <= S; s++) {
      const phi = th - SEXTO / 2 + (s / S) * SEXTO;
      const x = Math.cos(th) * dc + Math.cos(phi) * rc;
      const z = Math.sin(th) * dc + Math.sin(phi) * rc;
      pos.push(x, 0, z);
      uv.push(0.5 + x / (2 * R), 0.5 - z / (2 * R));
      nor.push(0, 1, 0);
    }
  }
  const N = 6 * (S + 1);
  for (let c = 0; c < N; c++) idx.push(0, 1 + ((c + 1) % N), 1 + c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Hexagono plano virado para cima (CircleGeometry de 6 lados: gelo). */
function hexPlano(r) {
  const g = new THREE.CircleGeometry(r, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Mapa de ambiente pequeno: ceu quente em cima, horizonte claro, grama embaixo e 3 "softboxes" (o sol da luz
 * direcional, um contraluz e uma faixa na frente que acende a borda das pecas). Gerado uma vez, sem arquivo.
 * @param {THREE.WebGLRenderer} renderer
 */
function criarAmbiente(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const p = geo.attributes.position;
  /** @type {number[]} */
  const cols = [];
  const c = new THREE.Color();
  const ceu = new THREE.Color(1.0, 0.96, 0.86);
  const hor = new THREE.Color(0.78, 0.86, 0.95);
  const chao = new THREE.Color(0.3, 0.42, 0.2);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(ceu, Math.pow(y, 0.6));
    else c.copy(hor).lerp(chao, Math.pow(-y, 0.45));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const luz = (x, y, z, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.97, k * 0.9), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  luz(-4, 7, 4, 5, 3.5, 5);
  luz(6, 4, -4, 4, 2, 2);
  luz(0, 2.5, 8, 7, 1.4, 1.6);
  const rt = pm.fromScene(sc, 0.035);
  pm.dispose();
  return rt.texture;
}

/** Desenhos dos simbolos (canvas centrado em 0,0, raio ~44 px num quadro de 128). */
const GLIFOS = {
  /** @param {CanvasRenderingContext2D} g */
  coracao(g) {
    g.beginPath();
    g.moveTo(0, 38);
    g.bezierCurveTo(-50, 6, -36, -42, 0, -16);
    g.bezierCurveTo(36, -42, 50, 6, 0, 38);
    g.fill();
  },
  /** @param {CanvasRenderingContext2D} g */
  gota(g) {
    g.beginPath();
    g.moveTo(0, -44);
    g.bezierCurveTo(12, -24, 31, -6, 31, 12);
    g.arc(0, 12, 31, 0, Math.PI, false);
    g.bezierCurveTo(-31, -6, -12, -24, 0, -44);
    g.fill();
  },
  /** @param {CanvasRenderingContext2D} g */
  folha(g) {
    g.save();
    g.rotate(-Math.PI / 4);
    g.beginPath();
    g.moveTo(0, -46);
    g.quadraticCurveTo(38, 0, 0, 46);
    g.quadraticCurveTo(-38, 0, 0, -46);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -28);
    g.lineTo(0, 30);
    g.stroke();
    g.restore();
  },
  /** @param {CanvasRenderingContext2D} g */
  estrela(g) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 19 : 45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 3);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = g.fillStyle;
    g.fill();
    g.stroke();
  },
  /** @param {CanvasRenderingContext2D} g */
  lua(g) {
    g.beginPath();
    g.arc(0, 0, 41, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(17, -13, 34, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  },
  /** @param {CanvasRenderingContext2D} g */
  losango(g) {
    g.beginPath();
    g.moveTo(0, -44);
    g.lineTo(32, 0);
    g.lineTo(0, 44);
    g.lineTo(-32, 0);
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = g.fillStyle;
    g.fill();
    g.stroke();
  },
  /** @param {CanvasRenderingContext2D} g */
  sol(g) {
    g.beginPath();
    g.arc(0, 0, 21, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath();
      g.arc(Math.cos(a) * 35, Math.sin(a) * 35, 8, 0, Math.PI * 2);
      g.fill();
    }
  },
};

/** Textura do simbolo k: branco com uma sombrinha embaixo (parece gravado na peca). */
function texturaSimbolo(k) {
  const forma = document.createElement('canvas');
  forma.width = forma.height = 128;
  const f = /** @type {CanvasRenderingContext2D} */ (forma.getContext('2d'));
  f.translate(64, 64);
  f.fillStyle = '#ffffff';
  GLIFOS[/** @type {keyof typeof GLIFOS} */ (SIMBOLOS[k])](f);
  const sombra = document.createElement('canvas');
  sombra.width = sombra.height = 128;
  const s = /** @type {CanvasRenderingContext2D} */ (sombra.getContext('2d'));
  s.drawImage(forma, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = 'rgba(60,30,10,0.45)';
  s.fillRect(0, 0, 128, 128);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.drawImage(sombra, 0, 5);
  g.drawImage(forma, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const ease = (k) => 1 - Math.pow(1 - k, 3);
const queue = (fn) => Promise.resolve().then(fn);
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
/** angulo em (-pi, pi] */
const normalAng = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** angulo em (-30, 30] graus: o hexagono e igual a cada 60 */
const sexto = (a) => a - SEXTO * Math.round(a / SEXTO);
/** amassado de pouso: sobe e volta em 0,2 s */
const amassar = (t) => { const u = t / 0.2; return u >= 1 ? 0 : 0.24 * Math.sin(Math.PI * u) * (1 - u); };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ filme?: boolean, progresso?: (f: number) => void, base?: string }} o
 */
export async function criarCena(canvas, o = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!o.filme, powerPreference: 'high-performance' });
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 220);
  const hemi = new THREE.HemisphereLight(0xfff6e0, 0x6aa84f, 0.6);
  const sol = new THREE.DirectionalLight(0xffffff, 1.8);
  sol.position.set(-6, 14, 7);
  cena.add(hemi, sol);
  cena.fog = new THREE.Fog(0xcdeeff, 30, 90);
  cena.background = new THREE.Color(0xcdeeff);
  cena.environment = criarAmbiente(renderer);
  cena.environmentIntensity = 0.4;

  // ---------------------------------------------------------------- arte
  const carregador = new THREE.TextureLoader();
  /** @type {Record<string, THREE.Texture>} */
  const tex = {};
  const todos = [...ARQ_OUTROS, ...ARQ_JARDIM, 'grama'];
  let feitos = 0;
  await Promise.all(todos.map(async (nome) => {
    const url = nome === 'grama' ? 'src/arte/grama.webp' : `src/arte/${nome}.webp`;
    const t = await carregador.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    tex[nome] = t;
    feitos++;
    if (o.progresso) o.progresso(feitos / todos.length);
  }));
  const grama = tex.grama;
  grama.wrapS = grama.wrapT = THREE.RepeatWrapping;
  grama.repeat.set(26, 26);
  grama.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---------------------------------------------------------------- chao e mancha do tabuleiro
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), new THREE.MeshLambertMaterial({ map: grama, toneMapped: false }));
  chao.rotation.x = -Math.PI / 2;
  cena.add(chao);
  const manchaCanvas = document.createElement('canvas');
  manchaCanvas.width = manchaCanvas.height = 128;
  {
    const g = /** @type {CanvasRenderingContext2D} */ (manchaCanvas.getContext('2d'));
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(30,40,10,0.42)');
    gr.addColorStop(0.7, 'rgba(30,40,10,0.18)');
    gr.addColorStop(1, 'rgba(30,40,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const mancha = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(manchaCanvas), transparent: true, depthWrite: false }));
  mancha.rotation.x = -Math.PI / 2;
  mancha.position.y = 0.01;
  cena.add(mancha);

  // ---------------------------------------------------------------- giro da colmeia
  /** grupo que gira: celulas, gelo, alvo, rotulos das trancas, tampas e ondas de mel */
  const piv = new THREE.Group();
  cena.add(piv);
  const giro = { a: 0, vel: 0, alvo: /** @type {number|null} */ (null), segurando: false, total: 0 };
  /** giros do dedo nos ultimos 100 ms (velocidade da inercia ao soltar) */
  /** @type {{ t: number, d: number }[]} */
  const amostras = [];
  let cosA = 1;
  let sinA = 0;
  const EIXO_Y = new THREE.Vector3(0, 1, 0);
  const qA = new THREE.Quaternion();
  const qAinv = new THREE.Quaternion();
  function aplicarGiro() {
    piv.rotation.y = giro.a;
    piv.updateMatrixWorld(true);
    cosA = Math.cos(giro.a);
    sinA = Math.sin(giro.a);
    qA.setFromAxisAngle(EIXO_Y, giro.a);
    qAinv.copy(qA).invert();
  }
  /** colmeia -> mundo */
  const mx = (x, z) => x * cosA + z * sinA;
  const mz = (x, z) => -x * sinA + z * cosA;
  /** mundo -> colmeia */
  const lx = (x, z) => x * cosA - z * sinA;
  const lz = (x, z) => x * sinA + z * cosA;
  /** @param {number} d rad */
  function somarGiro(d) {
    giro.a += d;
    giro.total += Math.abs(d);
    aplicarGiro();
  }

  // ---------------------------------------------------------------- celulas (corpo + topo por tipo)
  const geoCorpo = hexArredondado(R_CEL, BASE, 0.07, 0.17, { S: 2, M: 2, aoBase: 0.72 });
  const matCorpo = new THREE.MeshStandardMaterial({ color: 0xf8d27c, roughness: 0.5, vertexColors: true });
  const geoTopo = hexPlanoArredondado(R_CEL - 0.055, 0.12);
  const mkTopo = (t) => new THREE.MeshStandardMaterial({ map: tex[t], transparent: true, alphaTest: 0.2, roughness: 0.6 });
  const MAX_CEL = 64;
  const corpos = new THREE.InstancedMesh(geoCorpo, matCorpo, MAX_CEL);
  const topos = {
    normal: new THREE.InstancedMesh(geoTopo, mkTopo('topos/topo-01'), MAX_CEL),
    flor: new THREE.InstancedMesh(geoTopo, mkTopo('topos/topo-03'), MAX_CEL),
    tranca: new THREE.InstancedMesh(geoTopo, mkTopo('topos/topo-05'), MAX_CEL),
  };
  for (const m of [corpos, ...Object.values(topos)]) { m.frustumCulled = false; m.count = 0; piv.add(m); }

  // ---------------------------------------------------------------- pecas (mundo; as da colmeia passam pelo giro)
  const geoPeca = hexArredondado(R_PECA, H_PECA, 0.05, 0.17, { S: 2, M: 3, aoBase: 0.5 });
  const matPeca = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, vertexColors: true, envMap: cena.environment, envMapIntensity: 0.5 });
  const pecas = new THREE.InstancedMesh(geoPeca, matPeca, MAX_PECAS);
  pecas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pecas.frustumCulled = false;
  pecas.setColorAt(0, new THREE.Color());
  cena.add(pecas);
  const cores = PALETA.map((c) => new THREE.Color(c));

  // simbolos: um InstancedMesh por cor, decalque no topo da peca de cima
  const geoSimb = new THREE.CircleGeometry(0.5, 24);
  geoSimb.rotateX(-Math.PI / 2);
  const simbolos = SIMBOLOS.map((_, k) => {
    const m = new THREE.InstancedMesh(geoSimb, new THREE.MeshStandardMaterial({ map: texturaSimbolo(k), transparent: true, opacity: 0.62,
      depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_SIMB);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 1;
    cena.add(m);
    return m;
  });
  const ns = [0, 0, 0, 0, 0, 0, 0];

  // sombras de contato: manchas suaves (alfa por instancia na cor: r = forca)
  const sombraCanvas = document.createElement('canvas');
  sombraCanvas.width = sombraCanvas.height = 128;
  {
    const g = /** @type {CanvasRenderingContext2D} */ (sombraCanvas.getContext('2d'));
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.78, 'rgba(255,255,255,0.3)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const geoSombra = new THREE.PlaneGeometry(1, 1);
  geoSombra.rotateX(-Math.PI / 2);
  const matSombra = new THREE.MeshBasicMaterial({ color: 0x2a1606, map: new THREE.CanvasTexture(sombraCanvas), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  matSombra.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vColor.r;\n\tdiffuseColor.rgb = diffuse;');
  };
  matSombra.customProgramCacheKey = () => 'sombra-contato';
  const sombras = new THREE.InstancedMesh(geoSombra, matSombra, MAX_SOMBRAS);
  sombras.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sombras.frustumCulled = false;
  sombras.setColorAt(0, new THREE.Color());
  sombras.count = 0;
  sombras.renderOrder = 1;
  cena.add(sombras);
  let nsb = 0;

  // gelo: casca transparente em volta da pilha congelada
  const geoGelo = hexBiselado(0.92, 1, 0.06);
  const matGelo = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.08, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true });
  const gelos = new THREE.InstancedMesh(geoGelo, matGelo, MAX_CEL);
  gelos.frustumCulled = false;
  gelos.count = 0;
  gelos.renderOrder = 2;
  piv.add(gelos);
  const topoGelo = new THREE.InstancedMesh(hexPlano(0.9), new THREE.MeshStandardMaterial({ map: tex['topos/topo-04'], transparent: true, opacity: 0.9, depthWrite: false }), MAX_CEL);
  topoGelo.frustumCulled = false;
  topoGelo.count = 0;
  topoGelo.renderOrder = 3;
  piv.add(topoGelo);

  // bandeja: placas de madeira
  const geoPlaca = hexArredondado(1.02, 0.16, 0.05, 0.18, { S: 2, M: 2, aoBase: 0.7 });
  const placas = new THREE.InstancedMesh(geoPlaca, new THREE.MeshStandardMaterial({ color: 0xc8925a, roughness: 0.62, vertexColors: true }), 3);
  const topoPlaca = new THREE.InstancedMesh(hexPlanoArredondado(0.97, 0.13), mkTopo('topos/topo-08'), 3);
  for (const m of [placas, topoPlaca]) { m.frustumCulled = false; cena.add(m); }

  // alvo do arrasto: anel que pulsa
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.96, 6, 1, 0), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.85, depthWrite: false }));
  anel.rotation.x = -Math.PI / 2;
  anel.visible = false;
  anel.renderOrder = 4;
  piv.add(anel);

  // ondas de mel: anel dourado que abre e some
  const ondas = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.9, 6, 1, 0), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 4;
    piv.add(m);
    return { m, t: 0, ativo: false };
  });

  // ---------------------------------------------------------------- sprites
  /** @param {string} nome @param {number} alt altura em unidades do mundo */
  function sprite(nome, alt, invertido = false) {
    const t = tex[nome];
    let mapa = t;
    if (invertido) {
      mapa = t.clone();
      mapa.wrapS = THREE.RepeatWrapping;
      mapa.repeat.x = -1;
      mapa.offset.x = 1;
      mapa.needsUpdate = true;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mapa, transparent: true, alphaTest: 0.08, depthWrite: false, toneMapped: false }));
    const img = /** @type {any} */ (t.image);
    const asp = img && img.height ? img.width / img.height : 1;
    s.scale.set(alt * asp, alt, 1);
    s.center.set(0.5, 0);
    s.userData.base = s.scale.clone();
    return s;
  }

  /** ganchos de som e HUD (o main preenche): voar(n, ev), pousar(), mel(ev), degelo(ev), abrir(ev), levar(ev), trocar(ev), acelerou() */
  /** @type {Record<string, any>} */
  const ao = {};

  // ---------------------------------------------------------------- estado visual
  /** @type {import('../jogo/fases.js').Fase|null} */
  let fase = null;
  /** @type {number[][]} */
  let vis = [];
  /** @type {number[]} */
  let visGelo = [];
  /** @type {number[]} */
  let visTranca = [];
  /** @type {Map<string, number>} */
  let indice = new Map();
  /** posicoes da bandeja */
  let vagas = [{ x: -2.4, z: 5 }, { x: 0, z: 5 }, { x: 2.4, z: 5 }];
  let retrato = true;
  let W = 1;
  let H = 1;
  let tempo = 0;
  /** raio da colmeia (centro da celula mais longe) */
  let raioTab = 3.5;
  const rng = criarRng(99);

  /** @type {{ ev: any, t: number, dur: number, s?: any }|null} */
  let atual = null;
  /** @type {{ ev: any, o: any }[]} */
  const fila = [];
  /** pecas voando (coordenadas da colmeia) */
  /** @type {{ x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,cor:number,t:number,dur:number,giro:THREE.Vector3,alto:number,fim?:()=>void,sumir?:boolean }[]} */
  let voos = [];
  /** pecas derretendo em mel */
  /** @type {{ x:number,y:number,z:number,cor:number,t:number,dur:number }[]} */
  let derretendo = [];
  /** pilha caindo na celula (pousar): deslocamento e giro que decaem */
  /** @type {Map<number, {t:number, dur:number, dx:number, dy:number, dz:number, yaw:number}>} */
  const quedas = new Map();
  /** amassado de pouso por celula (todo = a pilha toda; senao so a peca de cima) */
  /** @type {Map<number, {t:number, todo:boolean}>} */
  const pulos = new Map();
  /** bandeja: animacao de chegada por vaga */
  const chegada = [1, 1, 1];
  /** giro da pilha arrastada (encaixa no giro da colmeia) */
  let yawArrasto = 0;
  /** particulas (gotas de mel, gelo) */
  /** @type {{ s: THREE.Sprite, vx:number, vy:number, vz:number, t:number, dur:number, ativo:boolean, tam:number }[]} */
  const particulas = [];
  for (let i = 0; i < 56; i++) {
    const s = sprite(i % 5 === 4 ? 'icones/icone-07' : 'icones/icone-01', 0.35);
    s.visible = false;
    s.center.set(0.5, 0.5);
    s.renderOrder = 5;
    cena.add(s);
    particulas.push({ s, vx: 0, vy: 0, vz: 0, t: 0, dur: 1, ativo: false, tam: 0.35 });
  }
  /** abelhas que buscam o mel (pool) */
  /** @type {{ s: THREE.Sprite, sd: THREE.Sprite, t:number, dur:number, ativo:boolean, a:THREE.Vector3, b:THREE.Vector3, c:THREE.Vector3 }[]} */
  const abelhas = [];
  for (let i = 0; i < 6; i++) {
    const s = sprite('abelhas/abelha-01', 0.95);
    const sd = sprite('abelhas/abelha-01', 0.95, true);
    s.center.set(0.5, 0.5);
    sd.center.set(0.5, 0.5);
    s.visible = sd.visible = false;
    s.renderOrder = sd.renderOrder = 6;
    cena.add(s, sd);
    abelhas.push({ s, sd, t: 0, dur: 1, ativo: false, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() });
  }
  /** abelhas do jardim (ambiente) */
  const passeio = [0, 1].map((k) => {
    const s = sprite('abelhas/abelha-04', 0.7);
    const sd = sprite('abelhas/abelha-04', 0.7, true);
    s.center.set(0.5, 0.5);
    sd.center.set(0.5, 0.5);
    cena.add(s, sd);
    return { s, sd, fase: k * 2.7, raio: 0 };
  });
  /** jardim */
  /** @type {THREE.Sprite[]} */
  let plantas = [];
  /** @type {{ s: THREE.Sprite, t: number }|null} */
  let brotando = null;
  let jardimQtd = 0;
  let retratoJardim = true;
  /** rotulos das trancas */
  /** @type {THREE.Sprite[]} */
  let rotulos = [];
  /** tampas que saem (trancas abertas) */
  /** @type {{ m: THREE.Mesh, t: number }[]} */
  const tampas = [];

  // ---------------------------------------------------------------- montagem da fase
  function rotuloTranca(n) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.font = '700 54px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#3b2412';
    g.strokeText(String(n), 64, 50);
    g.fillStyle = '#ffffff';
    g.fillText(String(n), 64, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    s.scale.set(0.9, 0.675, 1);
    s.center.set(0.5, 0.5);
    s.renderOrder = 7;
    return s;
  }

  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();

  function montarCelulas() {
    if (!fase) return;
    const cel = fase.tab.celulas;
    corpos.count = cel.length;
    const n = { normal: 0, flor: 0, tranca: 0 };
    for (let i = 0; i < cel.length; i++) {
      const c = cel[i];
      m4.makeTranslation(c.x, 0, c.z);
      corpos.setMatrixAt(i, m4);
      const tipo = visTranca[i] > 0 ? 'tranca' : c.flor ? 'flor' : 'normal';
      m4.makeTranslation(c.x, BASE + (tipo === 'tranca' ? 0.012 : 0.004), c.z);
      topos[tipo].setMatrixAt(n[tipo]++, m4);
    }
    for (const [k, m] of Object.entries(topos)) { m.count = n[/** @type {'normal'} */ (k)]; m.instanceMatrix.needsUpdate = true; }
    corpos.instanceMatrix.needsUpdate = true;
    for (const r of rotulos) piv.remove(r);
    rotulos = [];
    for (let i = 0; i < cel.length; i++) {
      if (visTranca[i] <= 0) continue;
      const r = rotuloTranca(visTranca[i]);
      r.position.set(cel[i].x, BASE + 0.55, cel[i].z);
      r.userData.i = i;
      piv.add(r);
      rotulos.push(r);
    }
  }

  function montarJardim(qtd) {
    for (const p of plantas) cena.remove(p);
    plantas = [];
    if (!fase) return;
    jardimQtd = qtd;
    const [flores, grandes] = vagasDoJardim(fase.tab.celulas, qtd + 4, { bandeja: vagas, paisagem: !retrato });
    let nf = 0;
    let ng = 0;
    for (let k = 1; k <= qtd; k++) {
      const it = itemDoJardim(k);
      const vaga = it.grande ? grandes[ng++ % grandes.length] : flores[nf++ % flores.length];
      if (!vaga) continue;
      const alt = it.grande ? (it.sprite.startsWith('arvore') ? 2.6 : 1.9) : 1.15 + ((k * 37) % 7) * 0.05;
      const s = sprite(`jardim/${it.sprite}`, alt);
      s.position.set(vaga.x, 0, vaga.z);
      s.userData.k = k;
      /** @type {THREE.SpriteMaterial} */ (s.material).color.copy(tintaJardim);
      cena.add(s);
      plantas.push(s);
    }
  }

  /**
   * @param {import('../jogo/fases.js').Fase} f
   * @param {number} jardim itens do jardim
   */
  function montarFase(f, jardim) {
    fase = f;
    vis = f.tab.celulas.map((c) => c.pilha.slice());
    visGelo = f.tab.celulas.map((c) => c.gelo);
    visTranca = f.tab.celulas.map((c) => c.tranca);
    indice = new Map(f.tab.celulas.map((c, i) => [chave(c.q, c.r), i]));
    voos = [];
    derretendo = [];
    fila.length = 0;
    atual = null;
    quedas.clear();
    pulos.clear();
    chegada[0] = chegada[1] = chegada[2] = 0;
    // colmeia nova comeca no angulo padrao
    giro.a = 0;
    giro.vel = 0;
    giro.alvo = null;
    giro.segurando = false;
    aplicarGiro();
    layout();
    montarCelulas();
    montarJardim(jardim);
    aplicarEstacao(estacao(f.n));
  }

  function aplicarEstacao(e) {
    const E = ESTACOES[e] || ESTACOES[0];
    /** @type {THREE.Color} */ (cena.background).set(E.ceu);
    /** @type {THREE.Fog} */ (cena.fog).color.set(E.ceu);
    /** @type {THREE.MeshLambertMaterial} */ (chao.material).color.set(E.grama).multiplyScalar(E.chao / (E.solI * 0.84 + E.hemi));
    hemi.color.set(E.hemiCeu);
    hemi.groundColor.set(E.hemiChao);
    hemi.intensity = E.hemi;
    sol.color.set(E.sol);
    sol.intensity = E.solI;
    cena.environmentIntensity = E.amb;
    matPeca.envMapIntensity = E.amb * 1.25;
    tintaJardim.set(E.tinta);
    for (const p of plantas) /** @type {THREE.SpriteMaterial} */ (p.material).color.copy(tintaJardim);
  }
  const tintaJardim = new THREE.Color(0xffffff);

  // ---------------------------------------------------------------- camera
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** margens do HUD em px CSS (o main ajusta) */
  const margem = { topo: 70, base: 80, lado: 12 };

  function layout() {
    W = Math.max(1, canvas.clientWidth || window.innerWidth);
    H = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    retrato = W / H < 1.1;
    if (!fase) { camera.updateProjectionMatrix(); return; }
    const cel = fase.tab.celulas;
    if (retratoJardim !== retrato && plantas.length) { retratoJardim = retrato; queue(() => montarJardim(jardimQtd)); }
    retratoJardim = retrato;
    // a colmeia gira: o enquadramento e a bandeja usam o circulo que ela varre, nao a forma de agora
    raioTab = 0;
    for (const c of cel) raioTab = Math.max(raioTab, Math.hypot(c.x, c.z));
    const R = raioTab;
    if (retrato) {
      const z = R + 2.95;
      const dx = Math.min(2.35, Math.max(2.1, (2 * R) / 3.2));
      vagas = [{ x: -dx, z }, { x: 0, z }, { x: dx, z }];
    } else {
      const x = R + 2.6;
      vagas = [{ x, z: -2.25 }, { x, z: 0 }, { x, z: 2.25 }];
    }
    for (let s = 0; s < 3; s++) {
      m4.makeTranslation(vagas[s].x, 0, vagas[s].z);
      placas.setMatrixAt(s, m4);
      m4.makeTranslation(vagas[s].x, 0.165, vagas[s].z);
      topoPlaca.setMatrixAt(s, m4);
    }
    placas.instanceMatrix.needsUpdate = true;
    topoPlaca.instanceMatrix.needsUpdate = true;
    // mancha embaixo do tabuleiro
    mancha.position.set(0, 0.01, 0);
    mancha.scale.set((R + 2.2) * 2.2, (R + 2.2) * 2.2, 1);
    // enquadrar: o circulo da colmeia (no chao e na altura das pilhas) e a bandeja, com as margens do HUD
    /** @type {THREE.Vector3[]} */
    const pts = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.98), 0, Math.sin(a) * (R + 0.98)));
      // pilhas altas: a de tras sobe na tela (com o giro, qualquer uma pode ir para tras)
      if (k % 2 === 0) pts.push(new THREE.Vector3(Math.cos(a) * R, 1.8, Math.sin(a) * R));
    }
    for (const v of vagas) {
      pts.push(new THREE.Vector3(v.x - 1.05, 0, v.z), new THREE.Vector3(v.x + 1.05, 0, v.z), new THREE.Vector3(v.x, 0, v.z + 0.95),
        new THREE.Vector3(v.x, 1.2, v.z - 0.9));
    }
    const inclina = THREE.MathUtils.degToRad(retrato ? 57 : 60);
    const dir = new THREE.Vector3(0, -Math.sin(inclina), -Math.cos(inclina));
    const alvo = new THREE.Vector3((Math.min(-R, ...vagas.map((v) => v.x)) + Math.max(R, ...vagas.map((v) => v.x))) / 2, 0,
      (Math.min(-R, ...vagas.map((v) => v.z)) + Math.max(R, ...vagas.map((v) => v.z))) / 2);
    const lim = {
      topo: 1 - (2 * margem.topo) / H,
      base: -1 + (2 * margem.base) / H,
      lado: 1 - (2 * margem.lado) / W,
    };
    const p = new THREE.Vector3();
    const desloc = new THREE.Vector3();
    const foco = new THREE.Vector3();
    const medir = (d) => {
      foco.copy(alvo).add(desloc);
      camera.position.copy(foco).addScaledVector(dir, -d);
      camera.lookAt(foco);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
      for (const t of pts) {
        p.copy(t).project(camera);
        ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x);
      }
      return { ymin, ymax, xmin, xmax };
    };
    const tanMeio = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let d = 30;
    for (let it = 0; it < 4; it++) {
      let lo = 4;
      let hi = 160;
      for (let k = 0; k < 28; k++) {
        const m = (lo + hi) / 2;
        const b = medir(m);
        if (b.ymax <= lim.topo && b.ymin >= lim.base && b.xmax <= lim.lado && b.xmin >= -lim.lado) hi = m; else lo = m;
      }
      d = hi;
      const b = medir(d);
      // desloca a camera no proprio plano para centrar o conteudo entre as margens
      const cima = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const direita = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      // retrato: colmeia e bandeja embaixo (perto do polegar) e o jardim a vista em cima; paisagem: centro
      const dyNdc = retrato ? b.ymin - lim.base : (b.ymax + b.ymin) / 2 - (lim.topo + lim.base) / 2;
      desloc.addScaledVector(cima, dyNdc * d * tanMeio);
      desloc.addScaledVector(direita, ((b.xmax + b.xmin) / 2) * d * tanMeio * camera.aspect);
    }
    medir(d);
    /** @type {THREE.Fog} */ (cena.fog).near = camera.position.length() * 0.9;
    /** @type {THREE.Fog} */ (cena.fog).far = camera.position.length() * 2.6 + 20;
  }

  /** ponto do chao (plano y, no MUNDO) sob o pixel (CSS) */
  function noChao(px, py, y = 0) {
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o2 = ray.ray.origin;
    const d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const k = (y - o2.y) / d.y;
    if (k < 0) return null;
    return { x: o2.x + d.x * k, z: o2.z + d.z * k };
  }
  /** celula da colmeia num ponto do MUNDO */
  function celulaNoMundo(x, z) {
    const h = doMundo(lx(x, z), lz(x, z));
    const i = indice.get(chave(h.q, h.r));
    return i === undefined ? -1 : i;
  }
  /** celula sob o pixel: raio contra as pilhas (cilindros) e os topos das celulas, no espaco da colmeia */
  function celulaSobPixel(px, py) {
    if (!fase) return -1;
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o2 = ray.ray.origin;
    const d = ray.ray.direction;
    const ox = lx(o2.x, o2.z);
    const oz = lz(o2.x, o2.z);
    const oy = o2.y;
    const dx = lx(d.x, d.z);
    const dz = lz(d.x, d.z);
    const dy = d.y;
    const cel = fase.tab.celulas;
    let melhor = -1;
    let tMin = Infinity;
    const r = R_PECA;
    const A = dx * dx + dz * dz;
    for (let i = 0; i < cel.length; i++) {
      const c = cel[i];
      const topo = BASE + vis[i].length * ALT_PECA;
      if (dy < 0) {
        const t = (topo - oy) / dy;
        if (t > 0 && t < tMin) {
          const h = doMundo(ox + dx * t, oz + dz * t);
          if (h.q === c.q && h.r === c.r) { tMin = t; melhor = i; }
        }
      }
      if (vis[i].length && A > 1e-9) {
        const fx = ox - c.x;
        const fz = oz - c.z;
        const B = 2 * (fx * dx + fz * dz);
        const C = fx * fx + fz * fz - r * r;
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const t = (-B - Math.sqrt(disc)) / (2 * A);
          const y = oy + dy * t;
          if (t > 0 && t < tMin && y >= BASE && y <= topo) { tMin = t; melhor = i; }
        }
      }
    }
    return melhor;
  }
  function paraTela(x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H };
  }
  /** ponto da colmeia na tela */
  const daColmeia = (x, y, z) => paraTela(mx(x, z), y, mz(x, z));

  /**
   * Quanto girar para um arrasto de (xa, ya) a (xb, yb) em px: perto da colmeia, "pega" o ponto sob o dedo (o
   * ponto acompanha o dedo); longe dela ou no centro, o arrasto horizontal (atras do centro o sentido inverte).
   */
  function deltaGiro(xa, ya, xb, yb) {
    const c = paraTela(0, BASE, 0);
    const horiz = ((xb - xa) * Math.PI) / (0.6 * Math.max(320, W)) * (ya < c.y ? -1 : 1);
    const a = noChao(xa, ya, BASE);
    const b = noChao(xb, yb, BASE);
    if (!a || !b) return horiz;
    const ra = Math.hypot(a.x, a.z);
    const rb = Math.hypot(b.x, b.z);
    const w = clamp01((Math.min(ra, rb) - 0.8) / 1.2) * clamp01((raioTab + 4 - Math.max(ra, rb)) / 3);
    if (w <= 0) return horiz;
    let dg = Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z);
    if (dg > Math.PI) dg -= 2 * Math.PI;
    else if (dg < -Math.PI) dg += 2 * Math.PI;
    return dg * w + horiz * (1 - w);
  }

  // ---------------------------------------------------------------- fila de animacao
  const topoY = (i, extra = 0) => BASE + (vis[i].length + extra) * ALT_PECA;
  /** pecas a caminho de cada celula */
  const chegando = new Map();

  function particulasMel(x, y, z, n, gelo = false) {
    let k = 0;
    for (const p of particulas) {
      if (p.ativo) continue;
      const ehGelo = /** @type {any} */ (p.s.material).map === tex['icones/icone-07'];
      if (ehGelo !== gelo) continue;
      p.ativo = true;
      p.s.visible = true;
      p.s.position.set(x, y, z);
      const a = rng() * Math.PI * 2;
      const v = 1.4 + rng() * 2.4;
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v * 0.6;
      p.vy = 3 + rng() * 3.4;
      p.t = 0;
      p.dur = 0.7 + rng() * 0.45;
      p.tam = gelo ? 0.32 : 0.24 + rng() * 0.2;
      if (++k >= n) break;
    }
  }

  function abelhaBusca(x, y, z) {
    const b = abelhas.find((a) => !a.ativo);
    if (!b) return;
    b.ativo = true;
    b.t = 0;
    b.dur = 1.5;
    const lado = rng() < 0.5 ? -1 : 1;
    b.a.set(x + lado * 6, 3.5, z + 2);
    b.b.set(x, y + 0.6, z);
    // sai para o pote (canto de cima da tela)
    const alto = noChao(W * 0.5, -H * 0.2, 4) || { x, z: z - 12 };
    b.c.set(alto.x, 4, alto.z);
  }

  /** onda dourada no mel (coordenadas da colmeia) */
  function ondaMel(x, y, z) {
    const o2 = ondas.find((w) => !w.ativo);
    if (!o2) return;
    o2.ativo = true;
    o2.t = 0;
    o2.m.visible = true;
    o2.m.position.set(x, y, z);
  }

  /** inicia o evento da vez @param {{ev:any,o:any}} item */
  function iniciar(item) {
    const ev = item.ev;
    const c = fase ? fase.tab.celulas : [];
    /** @type {{ ev: any, t: number, dur: number, s?: any }} */
    const a = { ev, t: 0, dur: 0.01 };
    switch (ev.tipo) {
      case 'pousar': {
        vis[ev.i] = ev.pilha.slice();
        const de = item.o && item.o.de;
        let dx = 0;
        let dz = 0;
        let dy = 0.6;
        let yaw = 0;
        if (de) {
          dx = lx(de.x, de.z) - c[ev.i].x;
          dz = lz(de.x, de.z) - c[ev.i].z;
          dy = de.y;
          yaw = sexto((de.yaw || 0) - giro.a);
        }
        quedas.set(ev.i, { t: 0, dur: 0.16, dx, dy, dz, yaw });
        a.dur = 0.16;
        if (ao.pousar) ao.pousar();
        break;
      }
      case 'mover': {
        a.dur = (ev.qtd - 1) * GAP_VOO + DUR_VOO + 0.03;
        a.s = { saiu: 0 };
        contaGrupos++;
        if (ao.voar) ao.voar(contaGrupos, ev);
        break;
      }
      case 'mel': {
        const ci = c[ev.i];
        const n0 = vis[ev.i].length - ev.qtd;
        for (let k = 0; k < ev.qtd; k++) {
          derretendo.push({ x: ci.x, y: BASE + (n0 + k) * ALT_PECA, z: ci.z, cor: ev.cor, t: -(ev.qtd - 1 - k) * 0.025, dur: 0.45 });
        }
        vis[ev.i].length = Math.max(0, n0);
        const wx = mx(ci.x, ci.z);
        const wz = mz(ci.x, ci.z);
        particulasMel(wx, BASE + (n0 + ev.qtd) * ALT_PECA, wz, ev.flor ? 16 : 11);
        abelhaBusca(wx, BASE + n0 * ALT_PECA, wz);
        ondaMel(ci.x, BASE + n0 * ALT_PECA + 0.02, ci.z);
        a.dur = 0.5;
        if (ao.mel) ao.mel(ev);
        break;
      }
      case 'degelo': {
        visGelo[ev.i] = ev.resta;
        const ci = c[ev.i];
        particulasMel(mx(ci.x, ci.z), topoY(ev.i), mz(ci.x, ci.z), 6, true);
        a.dur = 0.18;
        if (ao.degelo) ao.degelo(ev);
        break;
      }
      case 'abrir': {
        visTranca[ev.i] = 0;
        const ci = c[ev.i];
        const tampa = new THREE.Mesh(geoTopo, topos.tranca.material);
        tampa.position.set(ci.x, BASE + 0.02, ci.z);
        piv.add(tampa);
        tampas.push({ m: tampa, t: 0 });
        montarCelulas();
        a.dur = 0.3;
        if (ao.abrir) ao.abrir(ev);
        break;
      }
      case 'levar': {
        const ci = c[ev.i];
        const pilha = vis[ev.i];
        pilha.forEach((cor, k) => {
          voos.push({ x0: ci.x, y0: BASE + k * ALT_PECA, z0: ci.z, x1: ci.x + (rng() - 0.5) * 4, y1: 7 + k * 0.2, z1: ci.z - 6,
            cor, t: -k * 0.02, dur: 0.55, giro: new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize(), alto: 1.2, sumir: true });
        });
        vis[ev.i] = [];
        abelhaBusca(mx(ci.x, ci.z), BASE, mz(ci.x, ci.z));
        a.dur = 0.4;
        if (ao.levar) ao.levar(ev);
        break;
      }
      case 'trocar': {
        const A = c[ev.a];
        const B = c[ev.b];
        const pa = vis[ev.a];
        const pb = vis[ev.b];
        const voar = (p, de, para, alvo) => p.forEach((cor, k) => {
          voos.push({ x0: de.x, y0: BASE + k * ALT_PECA, z0: de.z, x1: para.x, y1: BASE + k * ALT_PECA, z1: para.z, cor,
            t: 0, dur: 0.38, giro: new THREE.Vector3(0, 0, 0), alto: 1.4, fim: k === p.length - 1 ? () => { vis[alvo] = p.slice(); pulos.set(alvo, { t: 0, todo: true }); } : undefined });
        });
        vis[ev.a] = [];
        vis[ev.b] = [];
        voar(pa, A, B, ev.b);
        voar(pb, B, A, ev.a);
        a.dur = 0.42;
        if (ao.trocar) ao.trocar(ev);
        break;
      }
      default:
        break;
    }
    return a;
  }

  /** avanca o evento 'mover' (as pecas saem uma a uma) */
  function passoMover(a) {
    const ev = a.ev;
    const c = fase ? fase.tab.celulas : [];
    while (a.s.saiu < ev.qtd && a.t >= a.s.saiu * GAP_VOO) {
      a.s.saiu++;
      const de = c[ev.de];
      const para = c[ev.para];
      vis[ev.de].pop();
      const extra = chegando.get(ev.para) || 0;
      chegando.set(ev.para, extra + 1);
      const dx = para.x - de.x;
      const dz = para.z - de.z;
      voos.push({
        x0: de.x, y0: BASE + vis[ev.de].length * ALT_PECA, z0: de.z,
        x1: para.x, y1: topoY(ev.para, extra), z1: para.z,
        cor: ev.cor, t: 0, dur: DUR_VOO, giro: new THREE.Vector3(dz, 0, -dx).normalize(), alto: 0.9 + Math.hypot(dx, dz) * 0.18,
        fim: () => {
          vis[ev.para].push(ev.cor);
          chegando.set(ev.para, (chegando.get(ev.para) || 1) - 1);
          pulos.set(ev.para, { t: 0, todo: false });
        },
      });
    }
  }
  /** grupos de pecas que ja pularam na cascata atual (o som sobe a cada grupo) */
  let contaGrupos = 0;

  function atualizarFila(dt) {
    let guarda = 0;
    let resto = dt;
    while (guarda++ < 50) {
      if (!atual) {
        const item = fila.shift();
        if (!item) break;
        atual = iniciar(item);
      }
      atual.t += resto;
      resto = 0;
      if (atual.ev.tipo === 'mover') passoMover(atual);
      if (atual.t >= atual.dur) {
        resto = atual.t - atual.dur;
        atual = null;
        if (!fila.length) { contaGrupos = 0; break; }
      } else break;
    }
  }

  function acelerar() {
    if (!fase) return;
    fila.length = 0;
    atual = null;
    for (const v of voos) if (v.fim) v.fim();
    voos = [];
    derretendo = [];
    chegando.clear();
    quedas.clear();
    pulos.clear();
    contaGrupos = 0;
    vis = fase.tab.celulas.map((c) => c.pilha.slice());
    visGelo = fase.tab.celulas.map((c) => c.gelo);
    const mudouTranca = fase.tab.celulas.some((c, i) => c.tranca !== visTranca[i]);
    visTranca = fase.tab.celulas.map((c) => c.tranca);
    if (mudouTranca) montarCelulas();
    if (ao.acelerou) ao.acelerou();
  }

  // ---------------------------------------------------------------- quadro
  const cor = new THREE.Color();
  let np = 0;
  const vPos = new THREE.Vector3();
  const vOff = new THREE.Vector3();
  const vEsc = new THREE.Vector3();
  const vSim = new THREE.Vector3();
  const qT = new THREE.Quaternion();
  const qV = new THREE.Quaternion();
  const qS = new THREE.Quaternion();
  const qVirado = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

  /**
   * Uma peca. (x, y, z) e o pe da peca; local = coordenadas da colmeia (passam pelo giro).
   * @param {number} c cor
   * @param {boolean} local
   * @param {number} s escala
   * @param {number} sq amassado (>0 achata e alarga; <0 estica)
   * @param {THREE.Vector3|null} eixo eixo da virada (na colmeia), gira em volta do meio da peca
   * @param {number} vira angulo da virada
   * @param {number} yaw giro proprio em volta do eixo vertical
   * @param {number} mel 0..1 (dourar)
   * @param {number} luz multiplica a cor (oclusao < 1, brilho > 1)
   * @param {number} simb 0 sem simbolo, 1 no topo, 2 no topo e na base (pecas que viram no ar)
   */
  function poePeca(x, y, z, c, local, s, sq, eixo, vira, yaw, mel, luz, simb) {
    if (np >= MAX_PECAS) return;
    if (local) { vPos.set(mx(x, z), y, mz(x, z)); qT.copy(qA); } else { vPos.set(x, y, z); qT.identity(); }
    qS.identity();
    const virando = !!(eixo && vira);
    if (virando) {
      qV.setFromAxisAngle(/** @type {THREE.Vector3} */ (eixo), vira);
      qT.multiply(qV);
      if (local) qS.copy(qA).multiply(qV).multiply(qAinv); else qS.copy(qV);
    }
    if (yaw) { qV.setFromAxisAngle(EIXO_Y, yaw); qT.multiply(qV); }
    const sy = s * (1 - sq);
    const sxz = s * (1 + sq * 0.5);
    if (virando) {
      vOff.set(0, -H_PECA * sy * 0.5, 0).applyQuaternion(qT);
      vPos.y += H_PECA * sy * 0.5;
      vPos.add(vOff);
    }
    vEsc.set(sxz, sy, sxz);
    m4.compose(vPos, qT, vEsc);
    pecas.setMatrixAt(np, m4);
    cor.copy(cores[c] || cores[0]);
    if (mel > 0) cor.lerp(COR_MEL, mel);
    if (luz !== 1) cor.multiplyScalar(luz);
    pecas.setColorAt(np, cor);
    np++;
    if (!simb || c < 0 || c >= simbolos.length) return;
    const m = simbolos[c];
    vEsc.set(sxz, 1, sxz);
    if (ns[c] < MAX_SIMB) {
      vSim.set(0, H_PECA * sy + 0.004, 0).applyQuaternion(qT).add(vPos);
      m4.compose(vSim, qS, vEsc);
      m.setMatrixAt(ns[c]++, m4);
    }
    if (simb === 2 && ns[c] < MAX_SIMB) {
      vSim.set(0, -0.004, 0).applyQuaternion(qT).add(vPos);
      qV.copy(qS).multiply(qVirado);
      m4.compose(vSim, qV, vEsc);
      m.setMatrixAt(ns[c]++, m4);
    }
  }

  /** sombra de contato (mancha suave no plano y) */
  function sombra(x, y, z, local, tam, forca) {
    if (nsb >= MAX_SOMBRAS || forca <= 0.01) return;
    m4.makeScale(tam, 1, tam);
    m4.setPosition(local ? mx(x, z) : x, y, local ? mz(x, z) : z);
    sombras.setMatrixAt(nsb, m4);
    cor.setRGB(forca, forca, forca);
    sombras.setColorAt(nsb, cor);
    nsb++;
  }

  /** estado da interface vindo do main a cada quadro */
  const ui = {
    /** @type {{ s:number, px:number, py:number, toque:boolean }|null} */
    arrasto: null,
    selecionada: -1,
    alvo: -1,
    /** celula marcada (troca, teclado) */
    marcada: -1,
    /** mostrar a bandeja */
    bandeja: true,
  };

  function posArrasto() {
    if (!ui.arrasto) return null;
    const off = ui.arrasto.toque ? Math.min(90, H * 0.09) : 0;
    const p = noChao(ui.arrasto.px, ui.arrasto.py - off, BASE);
    return p;
  }

  function atualizar(dt) {
    tempo += dt;
    // giro: inercia depois de soltar, ou mola ate o alvo (botoes, teclas, roda, voltar ao padrao)
    if (!giro.segurando) {
      if (giro.alvo !== null) {
        const falta = giro.alvo - giro.a;
        if (Math.abs(falta) < 0.0008) {
          giro.a = giro.alvo;
          giro.total += Math.abs(falta);
          giro.alvo = null;
          aplicarGiro();
        } else somarGiro(falta * (1 - Math.exp(-13 * dt)));
      } else if (Math.abs(giro.vel) > 0.03) {
        somarGiro(giro.vel * dt);
        giro.vel *= Math.exp(-4.5 * dt);
      } else giro.vel = 0;
    }
    if (ui.arrasto) yawArrasto += sexto(giro.a - yawArrasto) * (1 - Math.exp(-18 * dt));
    else yawArrasto = 0;
    atualizarFila(dt);
    for (const v of voos) {
      v.t += dt;
      if (v.t >= v.dur && v.fim) { const f = v.fim; v.fim = undefined; f(); }
    }
    voos = voos.filter((v) => v.t < v.dur);
    for (const d of derretendo) d.t += dt;
    derretendo = derretendo.filter((d) => d.t < d.dur);
    for (const [i, qd] of quedas) {
      qd.t += dt;
      if (qd.t >= qd.dur) { quedas.delete(i); pulos.set(i, { t: 0, todo: true }); }
    }
    for (const [i, pl] of pulos) { pl.t += dt; if (pl.t >= 0.2) pulos.delete(i); }
    for (let s = 0; s < 3; s++) chegada[s] = Math.min(1, chegada[s] + dt * 3.2);
    for (const p of particulas) {
      if (!p.ativo) continue;
      p.t += dt;
      p.vy -= 12 * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const k = p.t / p.dur;
      const esc = p.tam * (1 - k * 0.55);
      p.s.scale.set(esc, esc, 1);
      /** @type {any} */ (p.s.material).opacity = 1 - k * k;
      if (k >= 1) { p.ativo = false; p.s.visible = false; }
    }
    for (const w of ondas) {
      if (!w.ativo) continue;
      w.t += dt;
      const k = clamp01(w.t / 0.55);
      const e = 0.7 + ease(k) * 1.1;
      w.m.scale.set(e, e, 1);
      /** @type {THREE.MeshBasicMaterial} */ (w.m.material).opacity = 0.85 * (1 - k);
      if (k >= 1) { w.ativo = false; w.m.visible = false; }
    }
    for (const b of abelhas) {
      if (!b.ativo) continue;
      b.t += dt;
      const k = b.t / b.dur;
      const pos = new THREE.Vector3();
      if (k < 0.45) pos.lerpVectors(b.a, b.b, easeIO(k / 0.45));
      else if (k < 0.55) pos.copy(b.b);
      else pos.lerpVectors(b.b, b.c, easeIO((k - 0.55) / 0.45));
      pos.y += Math.sin(b.t * 30) * 0.05;
      const vaiDir = k < 0.45 ? b.b.x > b.a.x : b.c.x > b.b.x;
      b.s.visible = !vaiDir;
      b.sd.visible = vaiDir;
      b.s.position.copy(pos);
      b.sd.position.copy(pos);
      const esc = 1 + Math.sin(b.t * 40) * 0.04;
      b.s.scale.set(b.s.userData.base.x, b.s.userData.base.y * esc, 1);
      b.sd.scale.copy(b.s.scale);
      if (k >= 1) { b.ativo = false; b.s.visible = b.sd.visible = false; }
    }
    // abelhas do jardim passeiam em volta do tabuleiro
    if (fase) {
      for (const pb of passeio) {
        const a = tempo * 0.35 + pb.fase;
        const x = Math.sin(a) * (raioTab + 2.2) + Math.sin(a * 2.3) * 0.6;
        const z = -Math.abs(Math.cos(a)) * (raioTab + 1.8) - 0.5;
        const y = 1.6 + Math.sin(tempo * 2.1 + pb.fase) * 0.35;
        const dx = Math.cos(a);
        pb.s.visible = dx < 0;
        pb.sd.visible = dx >= 0;
        pb.s.position.set(x, y, z);
        pb.sd.position.set(x, y, z);
      }
    }
    for (const t of tampas) {
      t.t += dt;
      t.m.position.y += dt * 3.5;
      t.m.rotation.z += dt * 4;
      t.m.scale.setScalar(Math.max(0.01, 1 - t.t * 2.5));
      if (t.t > 0.4) piv.remove(t.m);
    }
    for (let i = tampas.length - 1; i >= 0; i--) if (tampas[i].t > 0.4) tampas.splice(i, 1);
    if (brotando) {
      brotando.t += dt;
      const k = clamp01(brotando.t / 0.7);
      const e = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k) : 1;
      const base = brotando.s.userData.base;
      brotando.s.scale.set(base.x * ease(k) * e, base.y * ease(k) * e, 1);
      if (k >= 1) brotando = null;
    }
  }

  // ---------------------------------------------------------------- qualidade: pixel ratio que se ajusta
  let ultimoQuadro = 0;
  let mediaQuadro = 16.7;
  let lentos = 0;
  function medirQuadro() {
    if (o.filme || document.visibilityState !== 'visible') { ultimoQuadro = 0; return; }
    const agora = performance.now();
    if (ultimoQuadro) {
      const d = agora - ultimoQuadro;
      if (d < 200) mediaQuadro = mediaQuadro * 0.95 + d * 0.05;
    }
    ultimoQuadro = agora;
    // abaixo de ~45 fps sem parar por ~2 s (nao um soluco de carga): menos pixels, nunca abaixo de 1
    lentos = mediaQuadro > 22 ? lentos + 1 : 0;
    if (lentos > 100 && dpr > 1.01) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      lentos = 0;
      mediaQuadro = 16.7;
    }
  }

  function desenhar() {
    np = 0;
    nsb = 0;
    ns.fill(0);
    if (fase) {
      const c = fase.tab.celulas;
      let ng = 0;
      for (let i = 0; i < c.length; i++) {
        const p = vis[i];
        const n = p.length;
        const qd = quedas.get(i);
        let ox = 0, oy = 0, oz = 0, yaw = 0;
        if (qd) {
          const k = 1 - ease(clamp01(qd.t / qd.dur));
          ox = qd.dx * k; oy = qd.dy * k; oz = qd.dz * k; yaw = qd.yaw * k;
        }
        const pl = pulos.get(i);
        const am = pl ? amassar(pl.t) : 0;
        const todo = !!(pl && pl.todo);
        for (let k = 0; k < n; k++) {
          // oclusao entre pilhas: cada vizinha mais alta que esta camada escurece um pouco
          let occ = 0;
          for (const j of c[i].viz) if (vis[j].length > k) occ++;
          const topo = k === n - 1;
          const sq = todo ? am * 0.55 : topo ? am : 0;
          const y = BASE + k * ALT_PECA * (todo ? 1 - am * 0.55 : 1) + oy;
          poePeca(c[i].x + ox, y, c[i].z + oz, p[k], true, 1, sq, null, 0, yaw, 0, 1 - 0.055 * occ, topo ? 1 : 0);
        }
        if (n) sombra(c[i].x + ox, BASE + 0.006, c[i].z + oz, true, 2.15, 0.5);
        if (visGelo[i] > 0) {
          const alt = Math.max(0.5, n * ALT_PECA + 0.12);
          m4.makeScale(1, alt, 1);
          m4.setPosition(c[i].x, BASE - 0.02, c[i].z);
          gelos.setMatrixAt(ng, m4);
          m4.makeTranslation(c[i].x, BASE + alt - 0.01, c[i].z);
          topoGelo.setMatrixAt(ng, m4);
          ng++;
        }
      }
      gelos.count = ng;
      topoGelo.count = ng;
      gelos.instanceMatrix.needsUpdate = true;
      topoGelo.instanceMatrix.needsUpdate = true;
      // voos (viradas em arco, esticam no ar e amassam ao pousar) e a sombra deles na pilha de baixo
      for (const v of voos) {
        if (v.t < 0) continue;
        const k = clamp01(v.t / v.dur);
        const e = easeIO(k);
        const x = v.x0 + (v.x1 - v.x0) * e;
        const z = v.z0 + (v.z1 - v.z0) * e;
        const y = v.y0 + (v.y1 - v.y0) * e + Math.sin(e * Math.PI) * v.alto;
        const s = v.sumir ? 1 - e * 0.7 : 1;
        const gira = v.giro.lengthSq() > 0;
        poePeca(x, y, z, v.cor, true, s, -0.16 * Math.sin(k * Math.PI), gira ? v.giro : null, gira ? e * Math.PI : 0, 0, 0, 1, gira ? 2 : 1);
        if (!v.sumir) {
          const h = doMundo(x, z);
          const j = indice.get(chave(h.q, h.r));
          const chao2 = j === undefined ? 0.012 : BASE + vis[j].length * ALT_PECA + 0.006;
          const alto = Math.max(0, y - chao2);
          sombra(x, chao2, z, true, 1.4 + alto * 0.35, 0.42 * clamp01(1 - alto / 2.6));
        }
      }
      // mel: as pecas douram, brilham e derretem
      for (const d of derretendo) {
        if (d.t < 0) { poePeca(d.x, d.y, d.z, d.cor, true, 1, 0, null, 0, 0, 0, 1, 0); continue; }
        const k = clamp01(d.t / d.dur);
        const brilho = 1 + 0.35 * Math.sin(Math.min(1, k * 2.5) * Math.PI);
        poePeca(d.x, d.y + k * 0.32, d.z, d.cor, true, 1 - ease(k) * 0.92, k * 0.4, null, 0, 0, Math.min(1, k * 4), brilho, 0);
      }
      // bandeja e pilha arrastada (mundo)
      const pa = posArrasto();
      for (let s = 0; s < 3; s++) {
        const p = fase.bandeja[s];
        if (!p || !ui.bandeja) continue;
        let x = vagas[s].x;
        let z = vagas[s].z;
        let y = 0.17;
        let esc = 0.86 * ease(chegada[s]);
        let yaw = 0;
        const arrastada = !!(ui.arrasto && ui.arrasto.s === s && pa);
        if (arrastada && pa) {
          x = pa.x; z = pa.z; y = BASE + 0.55; esc = 1; yaw = yawArrasto;
          // sombra onde a pilha cai: no topo da pilha de baixo, ou no chao
          const j = celulaNoMundo(x, z);
          const chao2 = j < 0 ? 0.012 : BASE + vis[j].length * ALT_PECA + 0.006;
          sombra(x, chao2, z, false, 1.9, 0.38);
        } else {
          if (ui.selecionada === s) y += 0.35 + Math.sin(tempo * 6) * 0.06;
          sombra(x, 0.176, z, false, 2.0 * Math.max(0.01, esc), 0.45);
        }
        for (let k = 0; k < p.length; k++) {
          poePeca(x, y + k * ALT_PECA * esc, z, p[k], false, esc, 0, null, 0, yaw, 0, 1, k === p.length - 1 ? 1 : 0);
        }
      }
      // alvo
      const alvo = ui.alvo >= 0 ? ui.alvo : ui.marcada;
      if (alvo >= 0 && c[alvo]) {
        anel.visible = true;
        anel.position.set(c[alvo].x, BASE + 0.02 + vis[alvo].length * ALT_PECA, c[alvo].z);
        const pul = 1 + Math.sin(tempo * 8) * 0.04;
        anel.scale.set(pul, pul, 1);
        /** @type {THREE.MeshBasicMaterial} */ (anel.material).color.set(ui.alvo >= 0 ? 0xfff3a0 : 0xffffff);
      } else anel.visible = false;
    }
    pecas.count = np;
    pecas.instanceMatrix.needsUpdate = true;
    if (pecas.instanceColor) pecas.instanceColor.needsUpdate = true;
    for (let k = 0; k < simbolos.length; k++) {
      simbolos[k].count = ns[k];
      simbolos[k].instanceMatrix.needsUpdate = true;
    }
    sombras.count = nsb;
    sombras.instanceMatrix.needsUpdate = true;
    if (sombras.instanceColor) sombras.instanceColor.needsUpdate = true;
    medirQuadro();
    renderer.render(cena, camera);
  }

  // ---------------------------------------------------------------- api
  const api = {
    renderer,
    camera,
    get vagas() { return vagas; },
    margem,
    /** ganchos de som e HUD: voar(n, ev), pousar(), mel(ev), degelo(ev), abrir(ev), levar(ev), trocar(ev), acelerou() */
    ao,
    ui,
    montarFase,
    layout,
    /** @param {any[]} eventos @param {{ de?: {x:number,y:number,z:number,yaw?:number} }} [o2] */
    enfileirar(eventos, o2 = {}) {
      for (const ev of eventos) fila.push({ ev, o: ev.tipo === 'pousar' ? o2 : null });
    },
    get ocupado() { return !!atual || fila.length > 0 || voos.length > 0; },
    /** pecas no ar agora (prints da cascata) */
    get voando() { return voos.filter((v) => v.t > 0).length; },
    acelerar,
    atualizar,
    desenhar,
    /** pilha nova na bandeja (anima a chegada) @param {number[]} [quais] */
    chegouBandeja(quais = [0, 1, 2]) { for (const s of quais) chegada[s] = 0; },
    /** onde a pilha arrastada esta (celula da colmeia sob ela) */
    celulaDoArrasto() {
      const p = posArrasto();
      return p ? celulaNoMundo(p.x, p.z) : -1;
    },
    /** posicao 3D atual da pilha arrastada (origem do pousar, no mundo) */
    origemArrasto() {
      const p = posArrasto();
      return p ? { x: p.x, y: 0.55, z: p.z, yaw: yawArrasto } : null;
    },
    origemVaga(s) { return { x: vagas[s].x, y: 0.4, z: vagas[s].z, yaw: 0 }; },
    /** celula sob o pixel (ou -1): raio contra as pilhas, com a colmeia girada */
    celulaEm(px, py) { return celulaSobPixel(px, py); },
    /** vaga da bandeja sob o pixel (ou -1), com folga para o dedo */
    vagaEm(px, py) {
      let melhor = -1;
      let dm = Infinity;
      const lim = Math.max(46, Math.min(W, H) * 0.11);
      for (let s = 0; s < 3; s++) {
        const p = fase && fase.bandeja[s];
        const alt = p ? p.length * ALT_PECA * 0.86 : 0;
        const a = paraTela(vagas[s].x, 0.17, vagas[s].z);
        const b = paraTela(vagas[s].x, 0.17 + alt, vagas[s].z);
        const y = Math.max(b.y, Math.min(a.y, py));
        const d = Math.hypot(px - a.x, py - y);
        if (d < dm) { dm = d; melhor = s; }
      }
      return dm <= lim ? melhor : -1;
    },
    /** px CSS do centro da celula (topo da pilha) */
    telaDaCelula(i) {
      if (!fase || !fase.tab.celulas[i]) return { x: W / 2, y: H / 2 };
      const c = fase.tab.celulas[i];
      return daColmeia(c.x, BASE + vis[i].length * ALT_PECA, c.z);
    },
    telaDaVaga(s) {
      const p = fase && fase.bandeja[s];
      return paraTela(vagas[s].x, 0.17 + (p ? p.length * ALT_PECA * 0.43 : 0), vagas[s].z);
    },
    /** px CSS de um ponto do mundo (ex.: a frente da colmeia, para a mao-guia do giro) */
    telaDoMundo(x, y, z) { return paraTela(x, y, z); },
    get raio() { return raioTab; },
    // -------------------------------------------------------------- giro
    /** quanto girar (rad) para um arrasto de (xa, ya) a (xb, yb) em px (o ponto sob o dedo acompanha o dedo) */
    deltaGiro(xa, ya, xb, yb) { return deltaGiro(xa, ya, xb, yb); },
    /** gira d rad agora, com o dedo (mede a velocidade para a inercia) @param {number} d */
    girarPor(d) {
      if (!d) return;
      const agora = performance.now();
      amostras.push({ t: agora, d });
      while (amostras.length && agora - amostras[0].t > 100) amostras.shift();
      giro.vel = 0;
      giro.alvo = null;
      giro.segurando = true;
      somarGiro(d);
    },
    /** o dedo soltou: segue na inercia, suave, com a velocidade dos ultimos 100 ms (parado antes de soltar = para) */
    soltarGiro() {
      if (!giro.segurando) return;
      giro.segurando = false;
      const agora = performance.now();
      while (amostras.length && agora - amostras[0].t > 100) amostras.shift();
      if (!amostras.length) { giro.vel = 0; return; }
      const soma = amostras.reduce((s2, a) => s2 + a.d, 0);
      const janela = Math.max(0.05, (agora - amostras[0].t) / 1000);
      amostras.length = 0;
      giro.vel = Math.max(-6, Math.min(6, (soma / janela) * 0.7));
    },
    /** gira d rad com mola (botoes, teclas, roda) @param {number} d */
    girarAlvo(d) {
      giro.vel = 0;
      giro.segurando = false;
      giro.alvo = (giro.alvo ?? giro.a) + d;
    },
    /** volta ao angulo padrao pelo caminho curto */
    girarPadrao() {
      giro.vel = 0;
      giro.segurando = false;
      giro.alvo = giro.a - normalAng(giro.a);
    },
    /** angulo exato, sem animacao (prints) @param {number} a */
    girarPara(a) {
      giro.a = a;
      giro.vel = 0;
      giro.alvo = null;
      aplicarGiro();
    },
    /** angulo atual em (-pi, pi] */
    get angulo() { return normalAng(giro.a); },
    /** rad girados desde o comeco (a dica do giro some quando o jogador gira) */
    get giroTotal() { return giro.total; },
    get girando() { return giro.segurando || giro.alvo !== null || Math.abs(giro.vel) > 0.03; },
    /** o item k do jardim brota (anima) @param {number} k */
    brotar(k) {
      montarJardim(k);
      const s = plantas.find((p) => p.userData.k === k);
      if (s) { s.scale.set(0.001, 0.001, 1); brotando = { s, t: 0 }; }
      return s ? paraTela(s.position.x, s.userData.base.y * 0.5, s.position.z) : null;
    },
    /** onde fica o item k do jardim na tela (festa) */
    telaDoJardim(k) {
      const s = plantas.find((p) => p.userData.k === k);
      return s ? paraTela(s.position.x, s.userData.base.y * 0.5, s.position.z) : null;
    },
    get retrato() { return retrato; },
    get pixelRatio() { return dpr; },
    /** quadro em JPEG (?filme) */
    jpeg(q2 = 0.9) { return canvas.toDataURL('image/jpeg', q2); },
  };
  aplicarGiro();
  return /** @type {any} */ (api);
}
