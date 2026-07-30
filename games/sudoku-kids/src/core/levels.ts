import type { LevelDef, StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница мини-судоку: пятнадцать уровней от почти заполненного поля 4×4
 * до 6×6 с четырнадцатью подсказками, лимитом ошибок и таймером.
 *
 * Рычаги по порядку появления: меньше подсказок → лимит ошибок → таймер.
 * Число подсказок убывает монотонно внутри каждого размера поля, а при переходе
 * на 6×6 сбрасывается на комфортный уровень — новая доска не должна пугать.
 */

export interface SudokuParams {
  size: 4 | 6;
  /** Сколько клеток открыто в начале. Меньше — сложнее. */
  clues: number;
  /** Потолок ошибок; 0 — без лимита. Исчерпал — уровень не пройден. */
  mistakeLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type SudokuLevel = LevelDef<SudokuParams>;

/** [сторона, подсказки, лимит ошибок, лимит времени, золото по секундам, серебро по секундам]. */
const TABLE: Array<[4 | 6, number, number, number, number, number]> = [
  [4, 11, 0, 0, 45, 90],
  [4, 10, 0, 0, 55, 110],
  [4, 9, 0, 0, 65, 130],
  [4, 8, 3, 0, 70, 140],
  [4, 7, 3, 120, 75, 110],
  [4, 6, 2, 100, 70, 95],
  [6, 24, 0, 0, 100, 200],
  [6, 22, 0, 0, 120, 240],
  [6, 20, 0, 0, 140, 260],
  [6, 19, 4, 0, 150, 280],
  [6, 18, 4, 300, 160, 260],
  [6, 17, 3, 300, 170, 260],
  [6, 16, 3, 270, 165, 240],
  [6, 15, 2, 260, 160, 230],
  [6, 14, 2, 240, 150, 220],
];

export const LADDER: readonly SudokuLevel[] = TABLE.map(([size, clues, mistakeLimit, timeLimitSec, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { size, clues, mistakeLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SudokuLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
