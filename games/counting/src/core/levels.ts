import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Счёта»: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * Проиграть нельзя — игра для 4–7 лет, ошибка только уменьшает число звёзд.
 * Рычаги: до скольки считаем (поле), число кнопок-вариантов и длина партии.
 *
 * - Глава 1 «Знакомство» — три кнопки, короткая партия, растёт только счёт (до 5 → до 12).
 * - Глава 2 «Шире выбор» — на знакомом поле кнопок становится больше,
 *   между ними счёт растёт дальше (до 18, шесть кнопок).
 * - Глава 3 «Марафон» — на знакомом поле партия удлиняется; счёт до 20
 *   приходит с укороченной партией, потом она снова растёт до пятнадцати вопросов.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться — рост счёта идёт с короткой партией.
 * Раньше рычаги росли парами (7 → 8: вопросов больше и кнопок больше) — это
 * ловят тесты, сравнивающие соседние уровни.
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

/** Рычаги сложности и в какую сторону каждый делает уровень жёстче. */
export const LEVERS = { maxCount: 'more', options: 'more', questions: 'more' } as const;

/** [вопросов, максимум предметов, вариантов, золото по ошибкам, серебро по ошибкам]. */
const TABLE: Array<[number, number, number, number, number]> = [
  // Глава 1 · Знакомство — только счёт.
  [6, 5, 3, 0, 1],
  [6, 6, 3, 0, 2],
  [6, 8, 3, 0, 2],
  [6, 10, 3, 0, 2],
  [6, 12, 3, 0, 2],
  // Глава 2 · Шире выбор — больше кнопок.
  [6, 12, 4, 0, 2], //  новое: четыре кнопки на знакомом поле
  [6, 14, 4, 1, 2], //  счёт дальше
  [6, 14, 5, 1, 2], //  кнопок больше
  [6, 18, 5, 1, 2], //  счёт дальше
  [6, 18, 6, 1, 2], //  кнопок больше
  // Глава 3 · Марафон — длиннее партия.
  [9, 18, 6, 1, 3], //  новое: партия длиннее на знакомом поле
  [12, 18, 6, 2, 4], // партия длиннее
  [9, 20, 6, 1, 3], //  счёт до 20, партия короче
  [12, 20, 6, 2, 4], // партия длиннее
  [15, 20, 6, 3, 5], // партия длиннее — финал
];

export const LADDER: readonly CountingLevel[] = TABLE.map(([questions, maxCount, options, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { questions, maxCount, options }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): CountingLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип поля: «до 12 предметов». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд (по ошибкам). */
  goldHint: Phrase;
}

/**
 * Что показать об уровне до старта: поле, рычаг, ставший жёстче, порог золота.
 * Рычаг вычисляется сравнением с предыдущим уровнем — так подпись не разойдётся
 * с таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте счёта игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  let intro: Phrase | null = null;
  if (harder === 'maxCount') intro = { key: 'intro.field', vars: { n: p.maxCount } };
  if (harder === 'options') intro = { key: 'intro.options', vars: { n: p.options } };
  if (harder === 'questions') intro = { key: 'intro.questions', vars: { n: p.questions } };
  return {
    field: { key: 'level.field', vars: { n: p.maxCount } },
    intro,
    // «Ошибок не больше 0» звучит странно — для нуля своя фраза.
    goldHint: goals.gold > 0
      ? { key: 'level.goldHint', vars: { n: goals.gold } }
      : { key: 'level.goldHintClean', vars: {} },
  };
}
