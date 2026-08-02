import { shuffle } from './rng';

/**
 * Символы карточек — имена векторных значков каталога (`makeGlyph`): каждый
 * отличается и формой, и цветом. Эмодзи не используем — их рисует шрифт устройства.
 */
export const SYMBOLS = [
  'apple', 'star', 'ball', 'heart', 'flower', 'leaf', 'fish', 'balloon',
  'drop', 'ring', 'square', 'triangle', 'diamond', 'hexagon', 'bolt',
] as const;

export interface Card { symbol: string; }

/** Колода уровня: pairs случайных символов × 2, перетасовано. */
export function buildDeck(pairs: number, rnd: () => number): Card[] {
  if (pairs > SYMBOLS.length) throw new Error(`max ${SYMBOLS.length} pairs`);
  const picked = shuffle(SYMBOLS, rnd).slice(0, pairs);
  const cards = [...picked, ...picked].map((symbol) => ({ symbol }));
  return shuffle(cards, rnd);
}
