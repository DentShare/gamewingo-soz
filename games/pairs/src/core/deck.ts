import { shuffle } from './rng';

/** Символы карточек — эмодзи-животные (системный emoji-шрифт, ничего не бандлим). */
export const SYMBOLS = [
  '🐱', '🐶', '🦊', '🐼', '🐸', '🦁', '🐷', '🐵',
  '🐰', '🐻', '🐨', '🐯', '🦉', '🐢', '🐳',
] as const;

export type LevelId = 'easy' | 'medium' | 'hard';

export interface LevelSpec { cols: number; rows: number; pairs: number; }

export const LEVELS: Record<LevelId, LevelSpec> = {
  easy: { cols: 3, rows: 4, pairs: 6 },
  medium: { cols: 4, rows: 5, pairs: 10 },
  hard: { cols: 5, rows: 6, pairs: 15 },
};

export interface Card { symbol: string; }

/** Колода уровня: pairs случайных символов × 2, перетасовано. */
export function buildDeck(pairs: number, rnd: () => number): Card[] {
  if (pairs > SYMBOLS.length) throw new Error(`max ${SYMBOLS.length} pairs`);
  const picked = shuffle(SYMBOLS, rnd).slice(0, pairs);
  const cards = [...picked, ...picked].map((symbol) => ({ symbol }));
  return shuffle(cards, rnd);
}
