import type { LevelDef, StarGoals } from '@gamewingo/game-progress';
import type { TopicId } from '../content';

/**
 * Лестница викторины: пятнадцать уровней от пяти спокойных вопросов по одной
 * теме до десяти вопросов из всего банка с таймером и почти без права на ошибку.
 *
 * Рычаги ровно те, которые чувствует игрок: длина партии, число вариантов,
 * время на вопрос и допустимое число ошибок. Первые уровни знакомят с темами
 * по одной, дальше темы смешиваются.
 */

export interface QuizParams {
  /** Вопросов в партии. */
  questions: number;
  /** Сколько вариантов ответа показываем. */
  options: number;
  /** Секунд на вопрос; 0 — без таймера. */
  timeLimitSec: number;
  /** Сколько ошибок допустимо: больше — уровень не пройден. */
  maxMistakes: number;
  /** Темы уровня. Пустой список — весь банк. */
  topics: readonly TopicId[];
}

export type QuizLevel = LevelDef<QuizParams>;

/** [вопросов, вариантов, секунд, лимит ошибок, темы, золото, серебро] — звёзды по ошибкам. */
const TABLE: Array<[number, number, number, number, TopicId[], number, number]> = [
  [5, 3, 0, 5, ['animals'], 0, 1],
  [5, 3, 0, 5, ['space'], 0, 1],
  [6, 3, 0, 4, ['uzbekistan'], 0, 1],
  [6, 3, 25, 4, ['body'], 0, 2],
  [6, 4, 25, 3, ['money'], 0, 2],
  [7, 4, 25, 3, ['science'], 0, 2],
  [7, 4, 20, 3, ['animals', 'space'], 0, 2],
  [8, 4, 20, 3, ['uzbekistan', 'science'], 0, 2],
  [8, 4, 20, 2, ['body', 'money'], 0, 2],
  [8, 4, 18, 2, [], 0, 2],
  [9, 4, 18, 2, [], 0, 2],
  [9, 4, 15, 2, [], 0, 1],
  [10, 4, 15, 2, [], 0, 1],
  [10, 4, 12, 1, [], 0, 1],
  [10, 4, 12, 1, [], 0, 1],
];

export const LADDER: readonly QuizLevel[] = TABLE.map(
  ([questions, options, timeLimitSec, maxMistakes, topics, gold, silver], i) => {
    const goals: StarGoals = { gold, silver };
    return { n: i + 1, params: { questions, options, timeLimitSec, maxMistakes, topics }, goals };
  },
);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): QuizLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
