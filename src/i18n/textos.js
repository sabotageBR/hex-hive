// Textos em pt (pt-BR), en e es. O idioma vem do portal (portal.idioma: 'pt-BR' | 'en' | 'es'; vazio na Poki,
// e ai vale o do navegador), nunca so do navegador no californiagames.io. Ingles e obrigatorio na CrazyGames:
// na duvida, en. No HTML, data-t="chave" troca o textContent e data-t-aria="chave" o aria-label.

/** @typedef {'pt'|'en'|'es'} Idioma */

export const TEXTOS = {
  pt: {
    titulo: 'Combloom',
    continuar: 'Continuar',
    seguir: 'Continuar ▶',
    pausa: 'Pausa',
    som: 'Som',
    bonus: '+1 reforço',
    semVideo: 'Sem vídeo agora',
    fase: 'Fase {n}',
    muitoBem: 'Muito bem!',
    festas: 'Muito bem!|Que doce!|Floresceu!|Mel de sobra!|Incrível!',
    plantaNova: 'Nova planta no jardim!',
    pecaGrande: 'O jardim cresceu!',
    dicaArraste: 'Arraste a pilha para a colmeia!',
    dicaMel: '10 da mesma cor viram mel!',
    dicaFlor: 'Mel na flor vale dobrado!',
    dicaMartelo: 'Novo: o martelo tira uma pilha!',
    dicaTranca: 'O cadeado abre quando o pote chega ao número!',
    dicaTroca: 'Novo: a troca muda duas pilhas de lugar!',
    dicaGelo: 'Faça mel ao lado do gelo para derreter!',
    dicaEmbaralhar: 'Novo: embaralhar troca a bandeja!',
    dicaAntigas: 'Pilhas antigas: cave até o fundo!',
    dicaMaior: 'Colmeia maior e uma cor nova!',
    dicaGrande: 'A maior colmeia de todas!',
    dicaGirar: 'Novo: arraste fora das pilhas para girar a colmeia!',
    girarEsq: 'Girar para a esquerda',
    girarDir: 'Girar para a direita',
    bussola: 'Voltar a colmeia ao normal',
    martelo: 'Martelo',
    troca: 'Troca',
    embaralhar: 'Embaralhar',
    usarMartelo: 'Toque numa pilha para tirá-la',
    usarTroca: 'Toque em duas pilhas para trocar',
    cancelar: 'Cancelar',
    semEspaco: 'Sem espaço!',
    semEspacoSub: 'A colmeia encheu.',
    tentar: 'Tentar de novo',
    abrirEspaco: 'Abrir espaço',
    usarReforco: 'Usar martelo ({n})',
    resgate: 'As abelhas abriram espaço!',
    presente: 'Presente do dia: +1 {nome}',
    ganhou: '+{n} {nome}',
    jardim: 'Jardim',
    mel: 'Mel',
  },
  en: {
    titulo: 'Combloom',
    continuar: 'Continue',
    seguir: 'Continue ▶',
    pausa: 'Paused',
    som: 'Sound',
    bonus: '+1 booster',
    semVideo: 'No video right now',
    fase: 'Level {n}',
    muitoBem: 'Great!',
    festas: 'Great!|So sweet!|In bloom!|Honey galore!|Amazing!',
    plantaNova: 'A new plant in the garden!',
    pecaGrande: 'The garden grew!',
    dicaArraste: 'Drag the stack onto the hive!',
    dicaMel: '10 of the same color turn into honey!',
    dicaFlor: 'Honey on a flower counts double!',
    dicaMartelo: 'New: the hammer removes a stack!',
    dicaTranca: 'The lock opens when the jar reaches its number!',
    dicaTroca: 'New: swap moves two stacks around!',
    dicaGelo: 'Make honey next to the ice to melt it!',
    dicaEmbaralhar: 'New: shuffle gives you a new tray!',
    dicaAntigas: 'Old stacks: dig down to the bottom!',
    dicaMaior: 'A bigger hive and a new color!',
    dicaGrande: 'The biggest hive of all!',
    dicaGirar: 'New: drag outside the stacks to turn the hive!',
    girarEsq: 'Turn left',
    girarDir: 'Turn right',
    bussola: 'Reset the hive view',
    martelo: 'Hammer',
    troca: 'Swap',
    embaralhar: 'Shuffle',
    usarMartelo: 'Tap a stack to remove it',
    usarTroca: 'Tap two stacks to swap them',
    cancelar: 'Cancel',
    semEspaco: 'Out of space!',
    semEspacoSub: 'The hive is full.',
    tentar: 'Try again',
    abrirEspaco: 'Make room',
    usarReforco: 'Use hammer ({n})',
    resgate: 'The bees made some room!',
    presente: 'Daily gift: +1 {nome}',
    ganhou: '+{n} {nome}',
    jardim: 'Garden',
    mel: 'Honey',
  },
  es: {
    titulo: 'Combloom',
    continuar: 'Continuar',
    seguir: 'Continuar ▶',
    pausa: 'Pausa',
    som: 'Sonido',
    bonus: '+1 potenciador',
    semVideo: 'Sin video ahora',
    fase: 'Nivel {n}',
    muitoBem: '¡Muy bien!',
    festas: '¡Muy bien!|¡Qué dulce!|¡Floreció!|¡Miel de sobra!|¡Increíble!',
    plantaNova: '¡Una planta nueva en el jardín!',
    pecaGrande: '¡El jardín creció!',
    dicaArraste: '¡Arrastra la pila a la colmena!',
    dicaMel: '¡10 del mismo color se vuelven miel!',
    dicaFlor: '¡La miel en la flor vale doble!',
    dicaMartelo: 'Nuevo: ¡el martillo quita una pila!',
    dicaTranca: '¡El candado se abre cuando el tarro llega a su número!',
    dicaTroca: 'Nuevo: ¡el cambio mueve dos pilas!',
    dicaGelo: '¡Haz miel junto al hielo para derretirlo!',
    dicaEmbaralhar: 'Nuevo: ¡mezclar cambia la bandeja!',
    dicaAntigas: 'Pilas antiguas: ¡cava hasta el fondo!',
    dicaMaior: '¡Una colmena más grande y un color nuevo!',
    dicaGrande: '¡La colmena más grande de todas!',
    dicaGirar: 'Nuevo: ¡arrastra fuera de las pilas para girar la colmena!',
    girarEsq: 'Girar a la izquierda',
    girarDir: 'Girar a la derecha',
    bussola: 'Volver la colmena a la vista normal',
    martelo: 'Martillo',
    troca: 'Cambio',
    embaralhar: 'Mezclar',
    usarMartelo: 'Toca una pila para quitarla',
    usarTroca: 'Toca dos pilas para cambiarlas',
    cancelar: 'Cancelar',
    semEspaco: '¡Sin espacio!',
    semEspacoSub: 'La colmena se llenó.',
    tentar: 'Intentar de nuevo',
    abrirEspaco: 'Abrir espacio',
    usarReforco: 'Usar martillo ({n})',
    resgate: '¡Las abejas abrieron espacio!',
    presente: 'Regalo del día: +1 {nome}',
    ganhou: '+{n} {nome}',
    jardim: 'Jardín',
    mel: 'Miel',
  },
};

/**
 * 'pt-BR', 'pt', 'es-419', 'en-US'... -> pt | en | es (o resto vira en).
 * @param {string} codigo
 * @returns {Idioma}
 */
export function escolherIdioma(codigo) {
  const c = String(codigo || '').toLowerCase();
  if (c.startsWith('pt')) return 'pt';
  if (c.startsWith('es')) return 'es';
  return 'en';
}

/** @type {Idioma} */
let atual = 'en';

/** @param {Idioma} i */
export function definirIdioma(i) {
  atual = TEXTOS[i] ? i : 'en';
}

export const idioma = () => atual;

/**
 * @param {string} chave
 * @param {Record<string, string|number>} [vars]
 */
export function t(chave, vars) {
  const tabela = /** @type {Record<string, string>} */ (TEXTOS[atual]);
  let s = tabela[chave] ?? /** @type {Record<string, string>} */ (TEXTOS.en)[chave] ?? chave;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** @param {ParentNode} raiz */
export function aplicarTextos(raiz) {
  for (const el of raiz.querySelectorAll('[data-t]')) el.textContent = t(/** @type {string} */ (el.getAttribute('data-t')));
  for (const el of raiz.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(/** @type {string} */ (el.getAttribute('data-t-aria'))));
}
