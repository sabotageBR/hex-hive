// Montagem do Combloom: o UNICO modulo que toca portal, DOM, audio e salvamento (test/estilo.test.js).
// Ciclo do portal como no kit multiportal (jogos/distribuicao/kit/src/main.js):
//
//  1. ganchos do portal ANTES do init (anuncio cala o audio e congela o laco; mudo e pausa do portal);
//  2. portal.init() primeiro, sem nada pesado antes (o handshake do californiagames.io dura 1,5 s);
//  3. carregar a arte com gameLoadingProgress; o laco so comeca depois do init;
//  4. idioma do portal (Poki: vazio, vale o navegador); progresso da nuvem do portal quando existe;
//  5. gameLoadingFinished no primeiro quadro; gameplayStart SO em jogadorAgiu() (gesto real);
//  6. commercialBreak SO em pausa natural (troca de fase, "tentar de novo") e so a partir da FASE_PRIMEIRO_INTERVALO;
//  7. video premiado so por escolha, fora da tela de jogo ativa (menu de pausa e painel "sem espaco"), com opcao
//     gratis do mesmo tamanho;
//  8. ESC, espaco ou P pausam; aba oculta pausa; o mudo do portal nao desfaz o do jogador;
//  9. portal.intervaloSoNoClique (Y8): o intervalo so sai logo depois de um clique num botao ("Continuar" na troca
//     de fase, ou o proprio "Tentar de novo"), e no maximo 1 a cada 180 s de jogo; portal.pausaNoBlur (Y8): perder
//     o foco abre a pausa.
import { portal, PLATAFORMA } from './core/plataforma.js';
import { criarArmazem } from './core/armazenamento.js';
import { criarAudio } from './core/audio.js';
import { criarHaptico } from './core/haptico.js';
import { criarLaco } from './core/laco.js';
import { criarEntrada } from './core/entrada.js';
import { lerDepuracao } from './core/depuracao.js';
import { criarTelemetria } from './core/telemetria.js';
import { escolherIdioma, definirIdioma, aplicarTextos, t, idioma } from './i18n/textos.js';
import { criarMao, celebrar, botaoPremiado } from './ui/kit.js';
import { SONS } from './som/sons.js';
import { criarFase, encherBandeja, embaralharBandeja, configFase } from './jogo/fases.js';
import { colocar, venceu, cheio, martelar, trocar, resgatar, livre, ativa } from './jogo/regras.js';
import { melhorJogada } from './jogo/bot.js';
import { itemDoJardim } from './jogo/jardim.js';

/** Sem intervalo comercial antes desta fase (regra do estudio: nada nas primeiras 5 a 7 fases). */
const FASE_PRIMEIRO_INTERVALO = 6;
/** Ajuda automatica: parado por este tempo (s)... */
const AJUDA_APOS = 7;
/** ...ou jogando sem fazer mel por estas jogadas (ajuda sem ocio). */
const AJUDA_JOGADAS = 6;
/** Reforcos e a fase em que cada um chega (docs/GDD.md). */
const REFORCOS = /** @type {const} */ (['martelo', 'troca', 'embaralhar']);
/** @type {Record<string, number>} */
const CHEGA = { martelo: 4, troca: 7, embaralhar: 10 };
const DICAS = { flor: 'dicaFlor', martelo: 'dicaMartelo', tranca: 'dicaTranca', troca: 'dicaTroca', gelo: 'dicaGelo',
  embaralhar: 'dicaEmbaralhar', antigas: 'dicaAntigas', maior: 'dicaMaior', grande: 'dicaGrande' };
/** Fase em que o giro da colmeia e ensinado (mao-guia e botoes): a novidade 'girar' do src/jogo/fases.js. */
const FASE_GIRO = (() => { for (let n = 1; n <= 30; n++) if (configFase(n).novidade === 'girar') return n; return 6; })();
/** Um passo dos botoes e das teclas Q/E: um lado do hexagono. */
const PASSO_GIRO = Math.PI / 3;

const dbg = lerDepuracao();
const armazem = criarArmazem({ prefixo: 'hexhive.' });
const audio = criarAudio();
const haptico = criarHaptico();
const tele = criarTelemetria(portal);

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const tela = /** @type {HTMLCanvasElement} */ ($('tela'));
const camada = $('camada');
const mao = criarMao(camada);
if (dbg.limpo) document.body.classList.add('limpo');

// ------------------------------------------------------------------ estado
const E = {
  fase: 1,
  /** @type {import('./jogo/fases.js').Fase|null} */
  atual: null,
  semente: dbg.semente || 7,
  tentativa: 0,
  t: 0,
  semProgresso: 0,
  semMel: 0,
  emFesta: false,
  pausado: false,
  pausaPortal: false,
  menu: false,
  painel: false,
  jogou: false,
  jardim: 0,
  /** @type {Record<string, number>} */
  reforcos: { martelo: 0, troca: 0, embaralhar: 0 },
  /** @type {string[]} novidades ja apresentadas */
  vistos: /** @type {string[]} */ ([]),
  dia: '',
  /** @type {'martelo'|'troca'|null} */
  modo: null,
  trocaA: -1,
  sel: -1,
  cursor: -1,
  /** @type {{ s:number, px:number, py:number, toque:boolean, x0:number, y0:number, moveu:boolean }|null} */
  arrasto: null,
  /** @type {'fim'|'cheio'|'resgate'|null} */
  pendente: null,
  melVisto: 0,
  cascata: 0,
  /** @type {{ s:number, i:number }|null} */
  sugestao: null,
  ajudaContada: false,
  ultimoAuto: 0,
  /** mao-guia do giro ativa (uma vez, na FASE_GIRO) e quanto ja tinha girado quando ela comecou */
  ensinarGiro: false,
  giro0: 0,
};

/** @type {any} */
let cena = null;
/** resolve quando a cena e a primeira fase estao prontas (roteiros e gravacao) */
let avisarPronto = () => {};
const pronto = new Promise((r) => { avisarPronto = r; });

function carregarProgresso() {
  const p = dbg.novo ? null : armazem.ler('progresso', null);
  E.fase = dbg.fase || (p && p.fase) || 1;
  E.jardim = p && Number.isFinite(p.jardim) ? p.jardim : E.fase - 1;
  E.vistos = (p && Array.isArray(p.vistos)) ? p.vistos.slice() : [];
  E.dia = (p && p.dia) || '';
  for (const k of REFORCOS) {
    const salvo = p && p.reforcos && Number.isFinite(p.reforcos[k]) ? p.reforcos[k] : null;
    // fase pulada pela URL (?fase=N): os reforcos ja apresentados vem com 2
    E.reforcos[k] = salvo !== null ? salvo : (CHEGA[k] < E.fase ? 2 : 0);
    if (salvo === null && CHEGA[k] < E.fase && !E.vistos.includes(k)) E.vistos.push(k);
  }
  // fase pulada pela URL sem progresso salvo: o giro ja foi apresentado (quem vem da 1.0 com progresso ve a dica)
  if (!p && FASE_GIRO < E.fase && !E.vistos.includes('girar')) E.vistos.push('girar');
}
function salvar() {
  armazem.gravar('progresso', { fase: E.fase, jardim: E.jardim, reforcos: E.reforcos, vistos: E.vistos, dia: E.dia });
}

// ------------------------------------------------------------------ portal: ganchos antes do init
const laco = criarLaco({ passo, desenhar });
portal.onAdStart = () => {
  audio.mudoParaAnuncio();
  laco.pausar(true);
};
portal.onAdEnd = () => {
  audio.voltarDoAnuncio();
  if (!congelado()) laco.pausar(false);
};
portal.onMudoPlataforma = (m) => audio.definirMudoPlataforma(m);
portal.onPausaPlataforma = (p) => {
  E.pausaPortal = p;
  if (p) portal.gameplayStop();
  laco.pausar(congelado() || portal.emAnuncio);
};
portal.onSemAnuncios = () => atualizarVideo();

const congelado = () => E.pausado || E.pausaPortal || E.menu;

/** Unico lugar com gameplayStart: gesto real do jogador, fora de pausa, painel e anuncio. */
function jogadorAgiu() {
  if (congelado() || E.painel || portal.emAnuncio) return;
  E.jogou = true;
  portal.gameplayStart();
}

// ------------------------------------------------------------------ HUD e avisos
function atualizarHud() {
  if (!E.atual) return;
  const meta = E.atual.tab.meta;
  const mel = Math.min(meta, E.melVisto);
  $('hudFase').textContent = t('fase', { n: E.fase });
  $('hudJardim').textContent = String(E.jardim);
  $('hudMel').textContent = `${mel}/${meta}`;
  $('hudBarra').style.width = `${(mel / meta) * 100}%`;
}
function atualizarReforcos() {
  const giro = E.fase >= FASE_GIRO;
  $('btGiroEsq').hidden = !giro;
  $('btGiroDir').hidden = !giro;
  let algum = giro;
  for (const k of REFORCOS) {
    const bt = $(`rf-${k}`);
    const tem = CHEGA[k] <= E.fase;
    bt.hidden = !tem;
    algum = algum || tem;
    /** @type {HTMLElement} */ (bt.querySelector('b')).textContent = String(E.reforcos[k]);
    bt.classList.toggle('vazio', E.reforcos[k] <= 0);
    bt.classList.toggle('ativo', E.modo === k);
  }
  if (cena) {
    const base = algum ? 84 : 14;
    if (cena.margem.base !== base) { cena.margem.base = base; cena.layout(); }
  }
}
let dicaAte = 0;
/** @param {string} texto @param {number} [s] segundos (0 = ate esconder) */
function mostrarDica(texto, s = 5) {
  const d = $('dica');
  d.textContent = texto;
  d.hidden = false;
  dicaAte = s ? E.t + s : Infinity;
}
function esconderDica() { $('dica').hidden = true; dicaAte = 0; }
/** @param {string} texto @param {string} [icone] */
function avisar(texto, icone) {
  if (dbg.filme) return;
  const el = document.createElement('div');
  el.className = 'aviso';
  if (icone) { const i = document.createElement('img'); i.src = icone; i.alt = ''; el.appendChild(i); }
  el.appendChild(document.createTextNode(texto));
  $('avisos').appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
const ICONE = { martelo: 'src/arte/icones/icone-03.webp', troca: 'src/arte/icones/icone-04.webp', embaralhar: 'src/arte/icones/icone-05.webp' };
/** "+N" de mel subindo da celula */
function flutuar(x, y, texto, dobro) {
  if (dbg.limpo) return;
  const el = document.createElement('div');
  el.className = `flutua${dobro ? ' dobro' : ''}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.textContent = texto;
  camada.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ------------------------------------------------------------------ fases
function novaFase() {
  E.atual = criarFase(E.fase, E.semente, E.tentativa);
  E.melVisto = 0;
  E.semMel = 0;
  E.semProgresso = 0;
  E.pendente = null;
  E.sugestao = null;
  E.ajudaContada = false;
  E.sel = -1;
  E.cursor = -1;
  cancelarModo();
  cena.montarFase(E.atual, E.jardim);
  cena.chegouBandeja();
  atualizarHud();
  atualizarReforcos();
  tele.fase(E.fase, 'start');
  // dicas: as 3 primeiras fases e cada novidade
  const nov = E.atual.cfg.novidade;
  E.ensinarGiro = false;
  if (E.fase === 1) mostrarDica(t('dicaArraste'), 0);
  else if (E.fase === 2) mostrarDica(t('dicaMel'), 6);
  // o giro: na fase dele, ou (quem ja tinha passado dela na 1.0) na proxima fase sem outra novidade
  else if (!E.vistos.includes('girar') && (nov === 'girar' || (E.fase > FASE_GIRO && !(nov && DICAS[/** @type {keyof typeof DICAS} */ (nov)])))) {
    E.ensinarGiro = true;
    E.giro0 = cena.giroTotal;
    mostrarDica(t('dicaGirar'), 0);
  }
  else if (nov && DICAS[/** @type {keyof typeof DICAS} */ (nov)]) mostrarDica(t(DICAS[/** @type {keyof typeof DICAS} */ (nov)]), 6);
  else esconderDica();
  if (/** @type {readonly string[]} */ (REFORCOS).includes(nov) && !E.vistos.includes(nov)) {
    E.vistos.push(nov);
    E.reforcos[nov] += 2;
    salvar();
    atualizarReforcos();
    setTimeout(() => avisar(t('ganhou', { n: 2, nome: t(nov) }), ICONE[/** @type {'martelo'} */ (nov)]), 600);
  }
}

/** depois de cada lance: o que fazer quando a animacao acabar */
function avaliarFim() {
  const f = E.atual;
  if (!f) return;
  if (venceu(f.tab)) E.pendente = 'fim';
  else if (cheio(f.tab)) E.pendente = f.cfg.protegida ? 'resgate' : 'cheio';
  else E.pendente = null;
}

/**
 * Solta a pilha s da bandeja na celula i.
 * @param {number} s @param {number} i @param {{x:number,y:number,z:number}|null} origem
 */
function soltarEm(s, i, origem) {
  const f = E.atual;
  if (!f || !f.bandeja[s] || E.emFesta || E.pendente === 'fim') return false;
  const c = f.tab.celulas[i];
  if (!c || !livre(c)) {
    audio.tocarReceita(SONS.erro, {}, { chave: 'erro' });
    return false;
  }
  if (cena.ocupado) cena.acelerar();
  const pilha = /** @type {number[]} */ (f.bandeja[s]);
  f.bandeja[s] = null;
  const ev = colocar(f.tab, i, pilha);
  cena.enfileirar(ev, { de: origem || cena.origemVaga(s) });
  E.semProgresso = 0;
  E.sugestao = null;
  E.sel = -1;
  mao.esconder();
  const fezMel = ev.some((e) => e.tipo === 'mel');
  E.semMel = fezMel ? 0 : E.semMel + 1;
  if (fezMel && E.fase === 1) esconderDica();
  if (E.fase === 2 && f.tab.jogadas >= 3 && dicaAte === Infinity) esconderDica();
  if (encherBandeja(f)) {
    cena.chegouBandeja();
    audio.tocarReceita(SONS.bandeja, {}, { chave: 'bandeja', atraso: 0.15 });
  }
  avaliarFim();
  return true;
}

async function faseCompleta() {
  E.emFesta = true;
  E.pendente = null;
  mao.esconder();
  cancelarModo();
  esconderDica();
  tele.fase(E.fase, 'complete');
  audio.tocarReceita(SONS.festa, {}, { chave: 'festa' });
  haptico.vibrar(30);
  E.jardim++;
  const item = itemDoJardim(E.jardim);
  E.fase++;
  E.tentativa = 0;
  // +1 reforco a cada 3 fases, em rodizio entre os que ja chegaram
  const chegados = REFORCOS.filter((k) => CHEGA[k] < E.fase);
  if (E.fase % 3 === 0 && chegados.length) {
    const k = chegados[(E.fase / 3) % chegados.length];
    E.reforcos[k]++;
    setTimeout(() => avisar(t('ganhou', { n: 1, nome: t(k) }), ICONE[k]), 900);
  }
  salvar();
  if (item.grande) portal.festa();
  if (item.grande) tele.evento('jardim', `grande-${E.jardim}`);
  const frases = t('festas').split('|');
  const festa = celebrar(camada, frases[(E.fase - 2) % frases.length], { ms: 2100, sub: item.grande ? t('pecaGrande') : t('plantaNova') });
  await espera(450);
  cena.brotar(E.jardim);
  $('hudJardim').textContent = String(E.jardim);
  audio.tocarReceita(SONS.brotar, {}, { chave: 'brotar' });
  await festa;
  // pausa natural: o unico ponto do intervalo comercial (alem de "tentar de novo")
  await intervalo();
  novaFase();
  E.emFesta = false;
}

/** @param {number} ms */
const espera = (ms) => new Promise((r) => setTimeout(r, dbg.filme ? 0 : ms));

/** s de jogo no ultimo intervalo pedido (so para o portal que exige clique) */
let ultimoIntervalo = -Infinity;
/** @param {boolean} [clicou] o intervalo vem logo depois de um clique num botao (ex.: "Tentar de novo") */
async function intervalo(clicou = false) {
  if (dbg.semAnuncio || !portal.temAnuncios || E.fase < FASE_PRIMEIRO_INTERVALO) return;
  if (portal.intervaloSoNoClique) {
    // Y8: o intersticial so pode sair logo depois de um clique num botao (nunca automatico), e o portal so exibe
    // um a cada ~3 min: o "Continuar" so aparece quando o intervalo pode sair de fato.
    if (tele.segundos - ultimoIntervalo < 180) return;
    if (!clicou) await esperarClique(/** @type {HTMLButtonElement} */ ($('btSeguir')));
  }
  ultimoIntervalo = tele.segundos;
  await portal.commercialBreak();
}
/** @param {HTMLButtonElement} bt */
function esperarClique(bt) {
  return new Promise((ok) => {
    bt.hidden = false;
    bt.addEventListener('click', () => { bt.hidden = true; ok(undefined); }, { once: true });
  });
}

/** presente do dia: o primeiro mel de cada dia traz 1 reforco (sem sequencia, sem FOMO) */
function presenteDoDia() {
  if (dbg.filme) return;
  const hoje = new Date().toLocaleDateString('sv-SE');
  const chegados = REFORCOS.filter((k) => CHEGA[k] <= E.fase);
  if (E.dia === hoje || !chegados.length) return;
  E.dia = hoje;
  const k = chegados[new Date().getDate() % chegados.length];
  E.reforcos[k]++;
  salvar();
  atualizarReforcos();
  tele.evento('presente', 'dia');
  audio.tocarReceita(SONS.presente, {}, { chave: 'presente', atraso: 0.4 });
  setTimeout(() => avisar(t('presente', { nome: t(k) }), 'src/arte/icones/icone-09.webp'), 500);
}

// ------------------------------------------------------------------ painel "sem espaco" (pausa natural)
function abrirFim() {
  E.painel = true;
  E.pendente = null;
  mao.esconder();
  portal.gameplayStop();
  tele.fase(E.fase, 'fail');
  audio.tocarReceita(SONS.cheio, {}, { chave: 'cheio' });
  const btE = /** @type {HTMLButtonElement} */ ($('btEspaco'));
  btE.hidden = !portal.temVideo;
  const btM = $('btUsarMartelo');
  btM.hidden = E.reforcos.martelo <= 0;
  btM.textContent = t('usarReforco', { n: E.reforcos.martelo });
  $('fim').hidden = false;
}
function fecharFim() {
  E.painel = false;
  $('fim').hidden = true;
}
async function tentarDeNovo() {
  fecharFim();
  E.tentativa++;
  await intervalo(true);
  novaFase();
}
async function abrirEspaco() {
  const ok = await portal.rewardedBreak('small');
  if (!ok || !E.atual) { atualizarVideo(); return; }
  fecharFim();
  tele.evento('premio', 'espaco');
  cena.enfileirar(resgatar(E.atual.tab, 3));
  avisar(t('resgate'), 'src/arte/abelhas/abelha-08.webp');
}

// ------------------------------------------------------------------ reforcos
/** @param {'martelo'|'troca'|'embaralhar'} k */
function usarReforco(k) {
  if (E.emFesta || congelado() || E.painel || !E.atual || E.pendente === 'fim') return;
  jogadorAgiu();
  if (E.modo === k) { cancelarModo(); return; }
  if (E.reforcos[k] <= 0) {
    audio.tocarReceita(SONS.erro, {}, { chave: 'erro' });
    return;
  }
  if (k === 'embaralhar') {
    cena.acelerar();
    embaralharBandeja(E.atual);
    E.reforcos[k]--;
    cena.chegouBandeja();
    audio.tocarReceita(SONS.trocar, {}, { chave: 'trocar' });
    tele.evento('reforco', k);
    E.sugestao = null;
    salvar();
    atualizarReforcos();
    return;
  }
  E.modo = k;
  E.trocaA = -1;
  E.sel = -1;
  $('modoTexto').textContent = t(k === 'martelo' ? 'usarMartelo' : 'usarTroca');
  $('modo').hidden = false;
  mao.esconder();
  atualizarReforcos();
}
function cancelarModo() {
  E.modo = null;
  E.trocaA = -1;
  if (cena) cena.ui.marcada = -1;
  $('modo').hidden = true;
  atualizarReforcos();
}
/** toque no tabuleiro durante um reforco @param {number} px @param {number} py */
function tocarModo(px, py) {
  const f = E.atual;
  if (!f) return;
  const i = cena.celulaEm(px, py);
  const c = i >= 0 ? f.tab.celulas[i] : null;
  if (E.modo === 'martelo') {
    if (!c || !ativa(c) || !c.pilha.length) { audio.tocarReceita(SONS.erro, {}, { chave: 'erro' }); return; }
    cena.acelerar();
    cena.enfileirar(martelar(f.tab, i));
    gastar('martelo');
  } else if (E.modo === 'troca') {
    if (!c || !ativa(c)) { audio.tocarReceita(SONS.erro, {}, { chave: 'erro' }); return; }
    if (E.trocaA < 0) {
      if (!c.pilha.length) { audio.tocarReceita(SONS.erro, {}, { chave: 'erro' }); return; }
      E.trocaA = i;
      cena.ui.marcada = i;
      audio.tocarReceita(SONS.pegar, {}, { chave: 'pegar' });
      return;
    }
    if (i === E.trocaA) { E.trocaA = -1; cena.ui.marcada = -1; return; }
    cena.acelerar();
    const ev = trocar(f.tab, E.trocaA, i);
    if (!ev.length) { audio.tocarReceita(SONS.erro, {}, { chave: 'erro' }); return; }
    cena.enfileirar(ev);
    if (ev.some((e) => e.tipo === 'mel')) E.semMel = 0;
    gastar('troca');
  }
}
/** @param {'martelo'|'troca'} k */
function gastar(k) {
  E.reforcos[k]--;
  tele.evento('reforco', k);
  E.sugestao = null;
  cancelarModo();
  salvar();
  avaliarFim();
}

// ------------------------------------------------------------------ sons e HUD a partir da animacao
function ligarCena() {
  // cascata: um som limpo por GRUPO de pecas que pula (nada de tique por peca nem vibracao em rajada)
  cena.ao.voar = (/** @type {number} */ n) => {
    audio.tocarReceita(SONS.voar, { n: n - 1 }, { chave: 'voar', max: 2 });
  };
  cena.ao.pousar = () => { audio.tocarReceita(SONS.pousar, {}, { chave: 'pousar' }); haptico.vibrar(10); };
  cena.ao.mel = (/** @type {any} */ ev) => {
    E.cascata++;
    E.melVisto += ev.ganho;
    audio.tocarReceita(SONS.mel, { k: E.cascata - 1 }, { chave: 'mel', max: 2 });
    haptico.vibrar(22);
    const p = cena.telaDaCelula(ev.i);
    flutuar(p.x, p.y - 20, `+${ev.ganho}`, ev.flor);
    atualizarHud();
    const pote = $('pote');
    pote.classList.remove('pulsa');
    void pote.offsetWidth;
    pote.classList.add('pulsa');
  };
  cena.ao.degelo = () => audio.tocarReceita(SONS.gelo, {}, { chave: 'gelo' });
  cena.ao.abrir = () => audio.tocarReceita(SONS.abrir, {}, { chave: 'abrir' });
  cena.ao.levar = () => audio.tocarReceita(SONS.levar, {}, { chave: 'levar' });
  cena.ao.trocar = () => audio.tocarReceita(SONS.trocar, {}, { chave: 'trocar' });
  cena.ao.acelerou = () => {
    if (E.atual) E.melVisto = E.atual.tab.mel;
    atualizarHud();
  };
}

// ------------------------------------------------------------------ laco (passo fixo; criado acima)
/** @param {number} dt */
function passo(dt) {
  if (congelado() || !cena || !E.atual) return;
  E.t += dt;
  if (portal.jogando && !E.painel) tele.jogando(dt);
  cena.atualizar(dt);
  if (dicaAte && E.t > dicaAte) esconderDica();
  if (E.painel) { mao.esconder(); return; }
  const ocupado = cena.ocupado;
  if (!ocupado) E.cascata = 0;
  if (E.pendente && !ocupado && !E.emFesta) {
    const p = E.pendente;
    E.pendente = null;
    if (p === 'fim') { faseCompleta(); return; }
    if (p === 'resgate') {
      cena.enfileirar(resgatar(E.atual.tab, 3));
      avisar(t('resgate'), 'src/arte/abelhas/abelha-08.webp');
    } else if (p === 'cheio') {
      if (dbg.auto) { tentarDeNovo(); return; }
      abrirFim();
      return;
    }
  }
  // giro ensinado uma vez: some quando o jogador gira ~35 graus (ou depois de 3 jogadas sem girar)
  if (E.ensinarGiro && (cena.giroTotal - E.giro0 > 0.6 || E.atual.tab.jogadas >= 3)) {
    E.ensinarGiro = false;
    if (!E.vistos.includes('girar')) { E.vistos.push('girar'); salvar(); }
    esconderDica();
    mao.esconder();
  }
  if (E.ensinarGiro && !E.emFesta && !E.arrasto && !E.modo && !E.pendente && !dbg.auto && !dbg.limpo) {
    // a mao arrasta na frente da colmeia, da esquerda para a direita (a frente acompanha o dedo)
    const r = cena.raio * 0.55;
    const a = cena.telaDoMundo(-r, 0.4, r);
    const b = cena.telaDoMundo(r, 0.4, r);
    mao.mostrar(a.x, a.y, { ateX: b.x, ateY: b.y });
  } else if (!E.emFesta && !ocupado && !E.arrasto && !E.modo && !E.pendente) {
    E.semProgresso += dt;
    const f = E.atual;
    const precisa = (E.fase === 1 && E.semProgresso > 1.2) || (E.fase === 2 && f.tab.jogadas === 0 && E.semProgresso > 2)
      || E.semProgresso > AJUDA_APOS || E.semMel >= AJUDA_JOGADAS;
    if (precisa && !dbg.auto && !dbg.limpo) {
      if (!E.sugestao) E.sugestao = melhorJogada(f);
      if (E.sugestao) {
        const a = cena.telaDaVaga(E.sugestao.s);
        const b = cena.telaDaCelula(E.sugestao.i);
        mao.mostrar(a.x, a.y, { ateX: b.x, ateY: b.y });
        if (E.fase > 1 && !E.ajudaContada) { E.ajudaContada = true; tele.ajuda(E.fase); }
      }
    } else mao.esconder();
  } else if (E.arrasto || E.modo) mao.esconder();
  if (dbg.auto && !E.emFesta && !ocupado && !E.pendente && E.t - E.ultimoAuto >= dbg.ritmo) {
    E.ultimoAuto = E.t;
    const j = melhorJogada(E.atual);
    if (j) soltarEm(j.s, j.i, cena.origemVaga(j.s));
  }
}

// ------------------------------------------------------------------ desenho
function desenhar() {
  if (!cena) return;
  if (E.arrasto && E.atual) {
    const i = cena.celulaDoArrasto();
    cena.ui.alvo = E.arrasto.moveu && i >= 0 && livre(E.atual.tab.celulas[i]) ? i : -1;
  }
  atualizarBussola();
  cena.ui.arrasto = E.arrasto;
  cena.ui.selecionada = E.sel;
  if (!E.modo) cena.ui.marcada = E.sel >= 0 ? E.cursor : -1;
  cena.desenhar();
  primeiroQuadro();
}

/** bussola: aparece com a colmeia girada, aponta o giro e volta ao padrao com um toque */
let bussolaAng = NaN;
function atualizarBussola() {
  const a = cena.angulo;
  if (Math.abs(a - bussolaAng) < 0.004) return;
  bussolaAng = a;
  const bt = $('btBussola');
  bt.hidden = Math.abs(a) < 0.04 || !!dbg.limpo;
  /** @type {HTMLElement} */ (bt.firstElementChild).style.transform = `rotate(${-a}rad)`;
}

let carregouJa = false;
function primeiroQuadro() {
  if (carregouJa) return;
  carregouJa = true;
  portal.gameLoadingFinished();
  $('carregando').classList.add('saindo');
  setTimeout(() => $('carregando').remove(), 400);
}

// ------------------------------------------------------------------ menu de pausa e premiado
function abrirMenu() {
  if (E.menu || E.painel) return;
  E.menu = true;
  if (E.arrasto) { E.arrasto = null; cena.ui.alvo = -1; }
  dedos.clear();
  if (cena) cena.soltarGiro();
  portal.gameplayStop();
  laco.pausar(true);
  atualizarVideo();
  $('menu').hidden = false;
}
function fecharMenu() {
  if (!E.menu) return;
  E.menu = false;
  $('menu').hidden = true;
  laco.pausar(congelado() || portal.emAnuncio);
}
function atualizarVideo() {
  const bt = /** @type {HTMLButtonElement} */ ($('btBonus'));
  bt.hidden = !portal.temVideo || !REFORCOS.some((k) => CHEGA[k] <= E.fase);
  if (E.painel) $('btEspaco').hidden = !portal.temVideo;
}
async function pedirBonus() {
  const ok = await portal.rewardedBreak('small');
  if (ok) {
    const chegados = REFORCOS.filter((k) => CHEGA[k] <= E.fase);
    const k = chegados.slice().sort((a, b) => E.reforcos[a] - E.reforcos[b])[0] || 'martelo';
    E.reforcos[k]++;
    salvar();
    tele.evento('premio', 'reforco');
    fecharMenu();
    atualizarReforcos();
    audio.tocarReceita(SONS.presente, {}, { chave: 'presente' });
    avisar(t('ganhou', { n: 1, nome: t(k) }), ICONE[k]);
  }
  atualizarVideo();
}

// ------------------------------------------------------------------ teclado: cursor nas celulas
/** @param {number} dx @param {number} dz */
function moverCursor(dx, dz) {
  const f = E.atual;
  if (!f) return;
  const cel = f.tab.celulas;
  if (E.cursor < 0) {
    E.cursor = cel.reduce((m, c, i) => (Math.hypot(c.x, c.z) < Math.hypot(cel[m].x, cel[m].z) ? i : m), 0);
    return;
  }
  // as setas seguem a tela: passa a direcao para o espaco da colmeia girada
  const ang = cena ? cena.angulo : 0;
  const ldx = dx * Math.cos(ang) - dz * Math.sin(ang);
  const ldz = dx * Math.sin(ang) + dz * Math.cos(ang);
  dx = ldx;
  dz = ldz;
  const a = cel[E.cursor];
  let melhor = -1;
  let nota = Infinity;
  cel.forEach((c, i) => {
    if (i === E.cursor) return;
    const vx = c.x - a.x;
    const vz = c.z - a.z;
    const d = Math.hypot(vx, vz);
    const al = (vx * dx + vz * dz) / d;
    if (al < 0.45) return;
    const n = d * (2 - al);
    if (n < nota) { nota = n; melhor = i; }
  });
  if (melhor >= 0) E.cursor = melhor;
}

// ------------------------------------------------------------------ entrada: pilhas, toques e giro da colmeia
// Um dedo (ou o botao esquerdo) numa pilha da bandeja arrasta a pilha; em qualquer outro lugar, toque = tocar (soltar
// a pilha escolhida na celula, martelo, troca) e arrasto = girar a colmeia. Dois dedos giram (torcer ou arrastar
// juntos); segurando uma pilha, outro dedo gira a colmeia por baixo dela. Botao direito ou do meio, roda do mouse,
// botoes de giro e as teclas Q/E tambem giram; a bussola (ou R) volta ao angulo padrao.
/** @typedef {{ x:number, y:number, x0:number, y0:number, papel:'pilha'|'fundo'|'giro'|'pinca' }} Dedo */
/** @type {Map<number, Dedo>} */
const dedos = new Map();
/** @returns {Dedo} */
const novoDedo = (/** @type {number} */ x, /** @type {number} */ y, /** @type {Dedo['papel']} */ papel) => ({ x, y, x0: x, y0: y, papel });
const girandoComDedo = () => [...dedos.values()].some((d) => d.papel === 'giro' || d.papel === 'pinca');

/** toque sem arrasto fora da bandeja @param {number} x @param {number} y */
function tocar(x, y) {
  if (E.emFesta || !E.atual || !cena) return;
  if (E.modo) { tocarModo(x, y); return; }
  if (E.sel >= 0) {
    const i = cena.celulaEm(x, y);
    if (i >= 0) soltarEm(E.sel, i, cena.origemVaga(E.sel));
    else E.sel = -1;
  }
}
/** a pilha arrastada foi solta */
function soltarPilha() {
  const a = E.arrasto;
  if (!a || !E.atual) return;
  const i = cena.celulaDoArrasto();
  const alvo = i >= 0 && livre(E.atual.tab.celulas[i]) ? i : -1;
  const origem = cena.origemArrasto();
  E.arrasto = null;
  cena.ui.alvo = -1;
  if (!a.moveu) {
    E.sel = E.sel === a.s ? -1 : a.s;
    return;
  }
  if (alvo >= 0) soltarEm(a.s, alvo, origem);
}
/** dois dedos: torcer gira junto, e arrastar os dois tambem (pelo meio deles) @param {number} id @param {number} xa @param {number} ya */
function moverPinca(id, xa, ya) {
  const d = /** @type {Dedo} */ (dedos.get(id));
  const outro = [...dedos.entries()].find(([k, o]) => k !== id && o.papel === 'pinca');
  if (!outro) { cena.girarPor(cena.deltaGiro(xa, ya, d.x, d.y)); return; }
  const o = outro[1];
  let torcao = Math.atan2(o.y - d.y, o.x - d.x) - Math.atan2(o.y - ya, o.x - xa);
  if (torcao > Math.PI) torcao -= 2 * Math.PI;
  else if (torcao < -Math.PI) torcao += 2 * Math.PI;
  // torcer no sentido do relogio (na tela) gira a colmeia no sentido do relogio
  cena.girarPor(-torcao + cena.deltaGiro((xa + o.x) / 2, (ya + o.y) / 2, (d.x + o.x) / 2, (d.y + o.y) / 2));
}

criarEntrada(window, {
  primeiroGesto: () => audio.iniciar(),
  multi: () => true,
  ponteiro: (fase, x, y, e) => {
    const id = e.pointerId;
    const toque = e.pointerType !== 'mouse';
    if (fase === 'baixo') {
      tele.gesto(toque ? 'toque' : 'mouse');
      jogadorAgiu();
      if (congelado() || E.painel || !E.atual || !cena) return;
      // botao direito ou do meio: so gira
      if (!toque && e.button > 0) { dedos.set(id, novoDedo(x, y, 'giro')); return; }
      if (dedos.size) {
        // segurando uma pilha, este dedo gira a colmeia por baixo dela
        if (E.arrasto) { dedos.set(id, novoDedo(x, y, 'giro')); return; }
        // segundo dedo: os dois giram juntos (e nenhum vira toque)
        for (const o of dedos.values()) if (o.papel === 'fundo' || o.papel === 'giro') o.papel = 'pinca';
        dedos.set(id, novoDedo(x, y, 'pinca'));
        return;
      }
      const s = E.modo || E.emFesta ? -1 : cena.vagaEm(x, y);
      if (s >= 0 && E.atual.bandeja[s]) {
        E.arrasto = { s, px: x, py: y, toque, x0: x, y0: y, moveu: false };
        dedos.set(id, novoDedo(x, y, 'pilha'));
        audio.tocarReceita(SONS.pegar, {}, { chave: 'pegar' });
        mao.esconder();
        return;
      }
      dedos.set(id, novoDedo(x, y, 'fundo'));
    } else if (fase === 'mover') {
      const d = dedos.get(id);
      if (!d || !cena) return;
      const xa = d.x;
      const ya = d.y;
      d.x = x;
      d.y = y;
      if (d.papel === 'pilha') {
        const a = E.arrasto;
        if (!a) return;
        a.px = x;
        a.py = y;
        if (Math.hypot(x - a.x0, y - a.y0) > 10) a.moveu = true;
      } else if (d.papel === 'fundo') {
        if (Math.hypot(x - d.x0, y - d.y0) > 10) {
          d.papel = 'giro';
          cena.girarPor(cena.deltaGiro(d.x0, d.y0, x, y));
        }
      } else if (d.papel === 'giro') cena.girarPor(cena.deltaGiro(xa, ya, x, y));
      else moverPinca(id, xa, ya);
    } else if (fase === 'cima') {
      const d = dedos.get(id);
      dedos.delete(id);
      if (!d || !cena) return;
      if (d.papel === 'pilha') { soltarPilha(); return; }
      if (d.papel === 'fundo') { tocar(x, y); return; }
      // um dos dois dedos saiu: o outro segue girando sozinho
      for (const o of dedos.values()) if (o.papel === 'pinca') o.papel = 'giro';
      if (!girandoComDedo()) cena.soltarGiro();
    }
  },
  tecla: (codigo, baixo) => {
    if (!baixo) return;
    if (codigo === 'Escape' && E.modo) { cancelarModo(); return; }
    if (codigo === 'Escape' || codigo === 'Space' || codigo === 'KeyP') {
      if (E.menu) fecharMenu();
      else abrirMenu();
      return;
    }
    jogadorAgiu();
    if (!E.atual || !cena || congelado() || E.painel) return;
    const passoGiro = { KeyQ: PASSO_GIRO, KeyE: -PASSO_GIRO }[codigo];
    if (passoGiro) { cena.girarAlvo(passoGiro); return; }
    if (codigo === 'KeyR') { cena.girarPadrao(); return; }
    if (E.emFesta) return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[codigo];
    if (n !== undefined) {
      if (E.atual.bandeja[n]) { E.sel = n; if (E.cursor < 0) moverCursor(0, 0); }
      return;
    }
    const setas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[codigo];
    if (setas) { moverCursor(setas[0], setas[1]); return; }
    if ((codigo === 'Enter' || codigo === 'NumpadEnter') && E.sel >= 0 && E.cursor >= 0) soltarEm(E.sel, E.cursor, cena.origemVaga(E.sel));
  },
});
// dedo cancelado pelo sistema (gesto do navegador, chamada): solta o que ele segurava
window.addEventListener('pointercancel', (e) => {
  const d = dedos.get(e.pointerId);
  dedos.delete(e.pointerId);
  if (!d || !cena) return;
  if (d.papel === 'pilha') { E.arrasto = null; cena.ui.alvo = -1; } else if (!girandoComDedo()) cena.soltarGiro();
});
// roda do mouse (e o arrasto de dois dedos no trackpad) gira com mola
window.addEventListener('wheel', (e) => {
  if (!cena || !E.atual || congelado() || E.painel) return;
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k;
  if (!d) return;
  jogadorAgiu();
  cena.girarAlvo(Math.max(-0.6, Math.min(0.6, d * 0.0045)));
}, { passive: true });
$('btGiroEsq').addEventListener('click', () => { jogadorAgiu(); if (cena) cena.girarAlvo(PASSO_GIRO); });
$('btGiroDir').addEventListener('click', () => { jogadorAgiu(); if (cena) cena.girarAlvo(-PASSO_GIRO); });
$('btBussola').addEventListener('click', () => { jogadorAgiu(); if (cena) cena.girarPadrao(); });
$('btPausa').addEventListener('click', () => abrirMenu());
$('btContinuar').addEventListener('click', () => { fecharMenu(); jogadorAgiu(); });
$('btBonus').addEventListener('click', () => pedirBonus());
$('btSom').addEventListener('click', () => {
  audio.definirMudo(!audio.mudo);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  armazem.gravar('mudo', audio.mudo);
});
$('btTentar').addEventListener('click', () => tentarDeNovo());
$('btEspaco').addEventListener('click', () => abrirEspaco());
$('btUsarMartelo').addEventListener('click', () => { fecharFim(); usarReforco('martelo'); });
$('btCancelar').addEventListener('click', () => cancelarModo());
for (const k of REFORCOS) $(`rf-${k}`).addEventListener('click', () => usarReforco(k));
document.addEventListener('visibilitychange', () => {
  audio.pausarAba(document.hidden);
  if (document.hidden) {
    portal.gameplayStop();
    laco.pausar(true);
  } else laco.pausar(congelado() || portal.emAnuncio);
});
// o iframe do portal precisa de foco para o teclado (espaco nao rola a pagina do portal)
window.addEventListener('pointerdown', () => { try { window.focus(); } catch { /* ignora */ } });
window.addEventListener('resize', () => { if (cena) cena.layout(); });
// Y8: perder o foco abre a pausa
window.addEventListener('blur', () => { if (portal.pausaNoBlur && carregouJa && !E.painel) abrirMenu(); });

// ------------------------------------------------------------------ partida
async function iniciar() {
  const pedidoInit = portal.init();
  const barra = /** @type {HTMLElement|null} */ (document.querySelector('#carregando .barra i'));
  const progresso = (/** @type {number} */ f) => {
    portal.gameLoadingProgress(f);
    if (barra) barra.style.width = `${f * 100}%`;
  };
  // o three.js (2 MB) e a cena so entram depois do aperto de mao com o portal: nada pesado durante o init
  progresso(0.05);
  await pedidoInit;
  const { criarCena } = await import('./render/cena.js');
  progresso(0.15);
  cena = await criarCena(tela, { filme: !!dbg.filme, progresso: (f) => progresso(0.15 + f * 0.85) });
  ligarCena();
  armazem.usarFonte(await portal.fonteDados(), ['progresso', 'mudo']);
  definirIdioma(escolherIdioma(dbg.lang || portal.idioma || navigator.language));
  document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es' }[idioma()];
  aplicarTextos(document);
  botaoPremiado(/** @type {HTMLButtonElement} */ ($('btBonus')), t('bonus'));
  botaoPremiado(/** @type {HTMLButtonElement} */ ($('btEspaco')), t('abrirEspaco'));
  audio.definirMudo(armazem.ler('mudo', false) === true);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  try { await document.fonts.load('700 54px Fredoka'); } catch { /* sem fonte, segue */ }
  carregarProgresso();
  novaFase();
  avisarPronto();
  if (dbg.filme) {
    desenhar();
    return;
  }
  laco.iniciar();
}

// ------------------------------------------------------------------ ganchos de teste (so local)
if (dbg.ganchos) {
  /** @type {any} */ (window).__jogo = {
    E,
    portal,
    audio,
    plataforma: PLATAFORMA,
    get cena() { return cena; },
    get lang() { return idioma(); },
    get jogou() { return portal.jogando; },
    get emAnuncio() { return portal.emAnuncio; },
    get menuAberto() { return E.menu; },
    get painelAberto() { return E.painel; },
    get totalReforcos() { return REFORCOS.reduce((s, k) => s + E.reforcos[k], 0); },
    /** lance sugerido em px CSS: de (pilha da bandeja) e para (celula), para toques reais dos roteiros */
    lance() {
      if (!E.atual || !cena) return null;
      cena.acelerar();
      const j = melhorJogada(E.atual);
      return j ? { s: j.s, i: j.i, de: cena.telaDaVaga(j.s), para: cena.telaDaCelula(j.i) } : null;
    },
    /** gira a colmeia para o angulo a (rad), sem animacao (prints) @param {number} a */
    girar(a) { if (cena) cena.girarPara(a); },
    /** um lance do bot (prints) */
    jogar() {
      const j = E.atual && melhorJogada(E.atual);
      if (j) soltarEm(j.s, j.i, cena.origemVaga(j.s));
      return !!j;
    },
    /** completa a fase atual na logica (prints e provas) */
    completar() {
      if (!E.atual) return;
      cena.acelerar();
      E.atual.tab.mel = E.atual.tab.meta;
      E.melVisto = E.atual.tab.meta;
      E.pendente = 'fim';
    },
    /** promessa: cena e fase prontas */
    pronto: () => pronto,
    /** um quadro de video sem relogio real (?filme): avanca 1/fps e devolve o JPEG (espera a carga se preciso) */
    quadro(fps = 30) {
      if (!cena || !E.atual) return pronto.then(() => this.quadro(fps));
      passo(1 / fps);
      desenhar();
      return cena.jpeg(0.9);
    },
  };
}

iniciar();
