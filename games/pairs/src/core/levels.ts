import type { LevelDef, StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Найди пару»: пятнадцать уровней от восьми карточек без ограничений
 * до тридцати с лимитом ходов и таймером.
 *
 * Сложность растёт тремя рычагами, а не одним «больше карточек»:
 * поле → лимит ходов → лимит времени. Каждый новый рычаг сначала появляется
 * на уже знакомом поле, и только потом поле снова растёт.
 */

export interface PairsParams {
  pairs: number;
  cols: number;
  rows: number;
  /** Потолок ходов; 0 — без лимита. Исчерпал — уровень не пройден. */
  moveLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type PairsLevel = LevelDef<PairsParams>;

/** Раскладки поля по числу пар — подобраны так, чтобы карточки оставались крупными в портрете. */
const GRID: Record<number, [cols: number, rows: number]> = {
  4: [2, 4],
  5: [2, 5],
  6: [3, 4],
  8: [4, 4],
  9: [3, 6],
  10: [4, 5],
  12: [4, 6],
  15: [5, 6],
};

/** Уровни как таблица: так кривую сложности видно целиком и её легко править. */
const TABLE: Array<[pairs: number, moveLimit: number, timeLimitSec: number, gold: number, silver: number]> = [
  [4, 0, 0, 5, 8],
  [5, 0, 0, 7, 10],
  [6, 0, 0, 8, 12],
  [6, 14, 0, 8, 11],
  [8, 0, 0, 11, 16],
  [8, 18, 0, 11, 15],
  [9, 0, 0, 13, 18],
  [9, 20, 90, 12, 16],
  [10, 0, 0, 14, 20],
  [10, 22, 80, 14, 18],
  [12, 0, 0, 17, 24],
  [12, 26, 90, 16, 21],
  [15, 0, 0, 21, 30],
  [15, 32, 100, 20, 26],
  [15, 28, 80, 19, 24],
];

export const LADDER: readonly PairsLevel[] = TABLE.map(([pairs, moveLimit, timeLimitSec, gold, silver], i) => {
  const [cols, rows] = GRID[pairs];
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { pairs, cols, rows, moveLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): PairsLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
