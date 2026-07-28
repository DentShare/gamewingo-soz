import { shuffle } from './rng';

/**
 * Чистое ядро детской игры «Счёт»: вопрос = группа одинаковых предметов, ребёнок
 * выбирает цифру. Проиграть нельзя: неверный ответ НЕ завершает партию и НЕ меняет
 * вопрос — он только увеличивает счётчик ошибок (UI показывает пересчёт-подсказку),
 * после чего можно ответить снова. Никакого Phaser/DOM здесь нет.
 */

/** Предметы для счёта — системные эмодзи (ничего не бандлим). */
export const ITEMS = ['🍎', '🦆', '⭐', '🐟', '🎈', '🍓', '🐝', '🌸', '🍌', '🐞'] as const;

/** Вопросов в партии. */
export const TOTAL_QUESTIONS = 10;
/** Сколько кнопок-цифр показываем (длина `options` постоянна). */
export const OPTIONS_COUNT = 4;
/** Максимальное количество предметов (и максимальный вариант ответа). */
export const MAX_COUNT = 10;
/** Насколько далеко от правильного ответа может отстоять вариант (соседние числа). */
export const MAX_OPTION_DELTA = 3;

export interface Question {
  /** Сколько предметов на поле — правильный ответ. */
  count: number;
  /** Варианты для кнопок: правильный + соседние числа, перемешаны. */
  options: number[];
  /** Индекс эмодзи в `ITEMS`. */
  itemIndex: number;
}

export interface AnswerResult {
  correct: boolean;
  done: boolean;
}

export interface CountingGame {
  readonly question: Question;
  /** Номер текущего вопроса (1..total). */
  readonly asked: number;
  readonly correct: number;
  readonly mistakes: number;
  readonly total: number;
  readonly isDone: boolean;
  /** Ответ ребёнка. Верный → следующий вопрос; неверный → тот же вопрос + ошибка. */
  answer(n: number): AnswerResult;
}

/**
 * Диапазон количества предметов для вопроса №index (0-based). Сложность растёт мягко:
 * первые вопросы — до 5 предметов, дальше — до 10.
 */
export function countRange(index: number): [number, number] {
  if (index < 3) return [1, 5];
  if (index < 6) return [3, 7];
  return [5, MAX_COUNT];
}

function pickCount(index: number, rnd: () => number): number {
  const [min, max] = countRange(index);
  return min + Math.floor(rnd() * (max - min + 1));
}

/**
 * Варианты ответа: правильный плюс ближайшие соседи — сначала ±1, затем ±2, ±3.
 * Так у ребёнка есть настоящий выбор, а не «одно очевидное число среди далёких».
 */
function buildOptions(count: number, rnd: () => number): number[] {
  const picked: number[] = [count];
  for (let d = 1; d <= MAX_OPTION_DELTA && picked.length < OPTIONS_COUNT; d++) {
    const band = shuffle(
      [count - d, count + d].filter((n) => n >= 1 && n <= MAX_COUNT),
      rnd,
    );
    for (const n of band) {
      if (picked.length >= OPTIONS_COUNT) break;
      if (!picked.includes(n)) picked.push(n);
    }
  }
  return shuffle(picked, rnd);
}

/** Следующий предмет — не такой же, как в прошлом вопросе (детям нагляднее). */
function pickItem(rnd: () => number, prev: number): number {
  const i = Math.floor(rnd() * ITEMS.length);
  return i === prev ? (i + 1) % ITEMS.length : i;
}

/** Фабрика партии. `rnd` — инжектируемый PRNG (см. `mulberry32`) для детерминизма. */
export function createCountingGame(rnd: () => number): CountingGame {
  let correct = 0;
  let mistakes = 0;
  let done = false;
  let itemIndex = -1;

  const makeQuestion = (index: number): Question => {
    const count = pickCount(index, rnd);
    itemIndex = pickItem(rnd, itemIndex);
    return { count, options: buildOptions(count, rnd), itemIndex };
  };

  let question = makeQuestion(0);

  return {
    get question() { return question; },
    get asked() { return Math.min(correct + 1, TOTAL_QUESTIONS); },
    get correct() { return correct; },
    get mistakes() { return mistakes; },
    get total() { return TOTAL_QUESTIONS; },
    get isDone() { return done; },
    answer(n: number): AnswerResult {
      if (done) return { correct: false, done: true };
      if (n !== question.count) {
        // Ошибка — не наказание: вопрос остаётся, ребёнок отвечает снова после подсказки.
        mistakes++;
        return { correct: false, done: false };
      }
      correct++;
      if (correct >= TOTAL_QUESTIONS) {
        done = true;
        return { correct: true, done: true };
      }
      question = makeQuestion(correct);
      return { correct: true, done: false };
    },
  };
}
