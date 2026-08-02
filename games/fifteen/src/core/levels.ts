import type { LevelDef, StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Пятнашек»: пятнадцать уровней от слегка перемешанного поля 3×3
 * до 5×5 с лимитами ходов и времени.
 *
 * Главный рычаг сложности — глубина перемешивания (`walk`), а не размер поля:
 * так партия остаётся в рамках нескольких минут даже на большой доске.
 * Размер растёт трижды за лестницу и каждый раз начинается с лёгкого расклада.
 */

export interface FifteenParams {
  /** Сторона поля: 3 → плитки 1..8, 4 → 1..15, 5 → 1..24. */
  size: number;
  /** Длина случайного блуждания при генерации расклада — глубина перемешивания. */
  walk: number;
  /** Потолок ходов; 0 — без лимита. */
  moveLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type FifteenLevel = LevelDef<FifteenParams>;

/** [сторона, блуждание, лимит ходов, лимит времени, золото по ходам, серебро по ходам]. */
const TABLE: Array<[number, number, number, number, number, number]> = [
  [3, 30, 0, 0, 24, 40],
  [3, 60, 0, 0, 34, 55],
  [3, 100, 0, 0, 42, 70],
  [3, 100, 70, 0, 40, 60],
  [3, 140, 60, 120, 38, 55],
  [4, 60, 0, 0, 50, 85],
  [4, 120, 0, 0, 75, 125],
  [4, 200, 0, 0, 100, 170],
  [4, 200, 180, 0, 95, 150],
  [4, 260, 0, 240, 115, 190],
  [4, 260, 170, 210, 105, 155],
  [4, 320, 150, 180, 100, 140],
  [5, 40, 0, 0, 60, 110],
  [5, 90, 0, 240, 110, 190],
  [5, 150, 0, 300, 150, 250],
];

export const LADDER: readonly FifteenLevel[] = TABLE.map(([size, walk, moveLimit, timeLimitSec, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { size, walk, moveLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): FifteenLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
