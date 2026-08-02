import type { LevelDef, StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Счёта»: пятнадцать уровней от пяти вопросов про 1–5 предметов
 * до пятнадцати вопросов про 1–20 с шестью вариантами ответа.
 *
 * Проиграть нельзя — игра для 4–7 лет, ошибка только уменьшает число звёзд.
 * Рычаги: длина партии, верхняя граница счёта и число кнопок-вариантов.
 */

export interface CountingParams {
  /** Вопросов в партии. */
  questions: number;
  /** Верхняя граница количества предметов — она же максимальный вариант ответа. */
  maxCount: number;
  /** Сколько кнопок-цифр показываем. Больше кнопок — меньше шансов угадать. */
  options: number;
}

export type CountingLevel = LevelDef<CountingParams>;

/** [вопросов, максимум предметов, вариантов, золото по ошибкам, серебро по ошибкам]. */
const TABLE: Array<[number, number, number, number, number]> = [
  [5, 5, 3, 0, 1],
  [6, 5, 3, 0, 2],
  [8, 6, 3, 0, 2],
  [8, 8, 4, 0, 2],
  [10, 10, 4, 0, 2],
  [10, 10, 4, 1, 3],
  [10, 12, 4, 1, 3],
  [12, 12, 5, 1, 3],
  [12, 14, 5, 1, 3],
  [12, 15, 5, 2, 4],
  [14, 16, 5, 2, 4],
  [14, 18, 6, 2, 4],
  [15, 18, 6, 2, 5],
  [15, 20, 6, 2, 5],
  [15, 20, 6, 3, 5],
];

export const LADDER: readonly CountingLevel[] = TABLE.map(([questions, maxCount, options, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { questions, maxCount, options }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): CountingLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
