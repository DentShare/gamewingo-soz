import type { LevelDef, StarGoals } from '@gamewingo/game-progress';
import type { PuzzleOptions } from './sums';

/**
 * Лестница «Сумм»: пятнадцать уровней от сетки 3×3 до 9×9.
 *
 * Рычаги сложности по порядку появления: размер поля → доля вычеркиваний
 * (чем больше лишних чисел, тем длиннее перебор) → диапазон чисел →
 * отрицательные числа, из-за которых сумма перестаёт монотонно расти.
 *
 * Таймера здесь нет намеренно: это головоломка на подумать, а секундомер
 * превращает раздумье в спешку и ломает жанр.
 */

export type SumsLevel = LevelDef<PuzzleOptions>;

/** [сторона, сколько клеток оставить, максимум числа, отрицательные]. */
const TABLE: Array<[number, number, number, boolean]> = [
  [3, 5, 9, false],
  [3, 4, 9, false],
  [4, 9, 9, false],
  [4, 8, 9, false],
  [4, 7, 12, false],
  [5, 14, 9, false],
  [5, 12, 12, false],
  [5, 11, 15, false],
  [6, 20, 12, false],
  [6, 18, 15, false],
  [6, 16, 12, true],
  [7, 26, 12, true],
  [7, 24, 15, true],
  [8, 34, 15, true],
  [9, 42, 15, true],
];

export const LADDER: readonly SumsLevel[] = TABLE.map(([size, keep, maxValue, negative], i) => {
  const params: PuzzleOptions = { size, keep, maxValue, negative };
  // Звёзды считаются по ЛИШНИМ касаниям, а не по общему числу ходов: тогда порог
  // не зависит от размера поля и одинаково честен на тройке и на девятке.
  // Золото — ни одного лишнего, серебро — запас в треть от идеальной игры.
  const perfect = size * size - keep;
  const goals: StarGoals = { gold: 0, silver: Math.max(1, Math.ceil(perfect * 0.35)) };
  return { n: i + 1, params, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SumsLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Сколько клеток надо вычеркнуть при идеальной игре — подсказка на поле и порог золота. */
export function perfectCrosses(n: number): number {
  const { size, keep } = levelAt(n).params;
  return size * size - keep;
}
