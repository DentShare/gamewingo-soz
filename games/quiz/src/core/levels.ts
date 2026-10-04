import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';
import type { TopicId } from '../content';

/**
 * Лестница викторины: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * - Глава 1 «Знакомство» — без таймера, с щедрым лимитом ошибок; темы по одной,
 *   растут длина партии (5 → 8 вопросов) и число вариантов (3 → 4).
 * - Глава 2 «Точность» — на знакомой партии лимит ужимается, потом партия
 *   растёт с чуть более мягким лимитом, и лимит снова ужимается. Темы смешиваются.
 * - Глава 3 «На время» — к десяти вопросам из всего банка добавляется таймер на
 *   вопрос и ужимается; финал — 10 вопросов, 12 секунд, одна ошибка.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться. Таймер, раз появившись, не
 * смягчается — время на вопрос по лестнице только тает. Раньше таймер, рост
 * партии и лимит ошибок менялись вперемешку, по два за уровень; это ловят
 * тесты, сравнивающие соседние уровни.
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

/**
 * Рычаги сложности и в какую сторону каждый делает уровень жёстче. Лимит ошибок
 * есть всегда (0 — «ни одной ошибки», а не «без лимита»), поэтому он `less`.
 * Темы — содержание, а не сложность, и рычагом не считаются.
 */
export const LEVERS = {
  questions: 'more',
  options: 'more',
  timeLimitSec: 'limit',
  maxMistakes: 'less',
} as const;

/** [вопросов, вариантов, секунд, лимит ошибок, темы, золото, серебро] — звёзды по ошибкам. */
const TABLE: Array<[number, number, number, number, TopicId[], number, number]> = [
  // Глава 1 · Знакомство — без таймера, темы по одной.
  [5, 3, 0, 4, ['animals'], 0, 1],
  [6, 3, 0, 4, ['space'], 0, 1], //        вопросов больше
  [6, 4, 0, 4, ['uzbekistan'], 0, 1], //   вариантов больше
  [7, 4, 0, 4, ['body'], 0, 1], //         вопросов больше
  [8, 4, 0, 4, ['money'], 0, 1], //        вопросов больше
  // Глава 2 · Точность — ужимается лимит ошибок.
  [8, 4, 0, 3, ['science'], 0, 2], //              новое: лимит строже на знакомой партии
  [8, 4, 0, 2, ['animals', 'space'], 0, 1], //     лимит строже
  [9, 4, 0, 3, ['uzbekistan', 'science'], 0, 2], // партия длиннее, лимит мягче
  [9, 4, 0, 2, ['body', 'money'], 0, 1], //        лимит строже
  [10, 4, 0, 3, [], 0, 2], //                      партия длиннее, лимит мягче
  // Глава 3 · На время.
  [10, 4, 25, 3, [], 0, 2], // новое: таймер на знакомой партии
  [10, 4, 18, 3, [], 0, 2], // таймер строже
  [10, 4, 18, 2, [], 0, 1], // лимит ошибок строже
  [10, 4, 12, 2, [], 0, 1], // таймер строже
  [10, 4, 12, 1, [], 0, 1], // лимит ошибок строже — финал как был
];

export const LADDER: readonly QuizLevel[] = TABLE.map(
  ([questions, options, timeLimitSec, maxMistakes, topics, gold, silver], i) => {
    const goals: StarGoals = { gold, silver };
    return { n: i + 1, params: { questions, options, timeLimitSec, maxMistakes, topics }, goals };
  },
);

export const LADDER_SIZE = LADDER.length;

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): QuizLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип партии: «8 вопросов». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что стало жёстче по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд. */
  goldHint: Phrase;
}

/**
 * Что показать о уровне до старта: длина партии, рычаг, ставший жёстче, порог
 * золота. Рычаг вычисляется сравнением с предыдущим уровнем — так подпись не
 * разойдётся с таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте партии игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  if (prev && harder === 'questions') intro = { key: 'intro.questions', vars: { n: p.questions } };
  if (prev && harder === 'options') intro = { key: 'intro.options', vars: { n: p.options } };
  if (prev && harder === 'maxMistakes') intro = { key: 'intro.mistakes', vars: { n: p.maxMistakes } };
  if (prev && harder === 'timeLimitSec') {
    intro = { key: prev.timeLimitSec ? 'intro.timerTighter' : 'intro.timer', vars: { n: p.timeLimitSec } };
  }
  return {
    field: { key: 'level.field', vars: { n: p.questions } },
    intro,
    // Звёзды меряются ошибками: золото на «ноль» — это «без ошибок», а не «не больше 0».
    goldHint: goals.gold > 0
      ? { key: 'level.goldHint', vars: { n: goals.gold } }
      : { key: 'level.goldHintPerfect', vars: {} },
  };
}
