import type { LevelDef, StarGoals } from '@gamewingo/game-progress';
import type { BinCount, Mode } from './sorting';

/**
 * Лестница «Сортировки»: пятнадцать уровней от восьми фигурок по трём цветам
 * до двадцати по четырём формам.
 *
 * Проиграть по-прежнему нельзя — это игра для 3–6 лет, ошибка только уменьшает
 * число звёзд. Сложность растёт тремя рычагами: длина партии, смена признака
 * (цвет ⇄ форма) и четвёртая корзина.
 */

export interface SortingParams {
  total: number;
  mode: Mode;
  bins: BinCount;
}

export type SortingLevel = LevelDef<SortingParams>;

/** [фигурок, признак, корзин, золото по ошибкам, серебро по ошибкам]. */
const TABLE: Array<[number, Mode, BinCount, number, number]> = [
  [8, 'color', 3, 0, 2],
  [10, 'color', 3, 0, 2],
  [12, 'color', 3, 1, 3],
  [10, 'shape', 3, 0, 2],
  [12, 'shape', 3, 1, 3],
  [14, 'shape', 3, 1, 3],
  [12, 'color', 4, 1, 3],
  [14, 'color', 4, 1, 3],
  [16, 'color', 4, 2, 4],
  [12, 'shape', 4, 1, 3],
  [14, 'shape', 4, 1, 3],
  [16, 'shape', 4, 2, 4],
  [18, 'color', 4, 2, 4],
  [18, 'shape', 4, 2, 4],
  [20, 'shape', 4, 2, 5],
];

export const LADDER: readonly SortingLevel[] = TABLE.map(([total, mode, bins, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { total, mode, bins }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SortingLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
