import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';
import type { PuzzleOptions } from './sums';

/**
 * Лестница «Сумм»: пятнадцать уровней в трёх главах по рычагу сложности,
 * поле от 3×3 до 9×9.
 *
 * - Глава 1 «Знакомство» — числа до 9, растут поле (3 → 5) и доля вычеркиваний.
 * - Глава 2 «Двузначные» — на знакомом поле диапазон чисел растёт до 15,
 *   потом поле 6×6 и снова больше лишнего.
 * - Глава 3 «С минусом» — на знакомом поле появляются отрицательные числа, из-за
 *   которых сумма перестаёт монотонно расти, а затем поле доходит до 9×9.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться. Раньше уровни 5, 7, 8, 10, 11 и 13
 * ужесточали сразу два — например, меньше оставить и крупнее числа; это ловят
 * тесты, сравнивающие соседние уровни. Финал (13–15) не изменился.
 *
 * Таймера здесь нет намеренно: это головоломка на подумать, а секундомер
 * превращает раздумье в спешку и ломает жанр.
 */

export type SumsLevel = LevelDef<PuzzleOptions>;

/**
 * Рычаги сложности и в какую сторону каждый делает уровень жёстче:
 * - `size` — больше поле;
 * - `keep` — меньше оставить, то есть больше лишних чисел и длиннее перебор
 *   (рост `keep` при росте поля — это смягчение, новое поле начинается мягче);
 * - `maxValue` — крупнее числа;
 * - `negative` — появились отрицательные (булево: `more` сравнивает как 0/1).
 */
export const LEVERS = { size: 'more', keep: 'less', maxValue: 'more', negative: 'more' } as const;

/** [сторона, сколько клеток оставить, максимум числа, отрицательные]. */
const TABLE: Array<[number, number, number, boolean]> = [
  // Глава 1 · Знакомство — числа до 9, растёт поле и доля лишнего.
  [3, 5, 9, false],
  [3, 4, 9, false], //  больше лишних
  [4, 9, 9, false], //  поле больше
  [4, 8, 9, false], //  больше лишних
  [5, 14, 9, false], // поле больше
  // Глава 2 · Двузначные — числа крупнее 9.
  [5, 14, 12, false], // новое: числа до 12 на знакомом поле
  [5, 14, 15, false], // числа до 15
  [5, 12, 15, false], // больше лишних
  [6, 20, 15, false], // поле больше
  [6, 18, 15, false], // больше лишних
  // Глава 3 · С минусом.
  [6, 18, 15, true], //  новое: отрицательные на знакомом поле
  [7, 26, 15, true], //  поле больше
  [7, 24, 15, true], //  больше лишних
  [8, 34, 15, true], //  поле больше
  [9, 42, 15, true], //  поле больше
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

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SumsLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Сколько клеток надо вычеркнуть при идеальной игре — подсказка на поле и порог золота. */
export function perfectCrosses(n: number): number {
  const { size, keep } = levelAt(n).params;
  return size * size - keep;
}

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип поля: «4×4». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд: касаний не больше, чем при идеальной игре. */
  goldHint: Phrase;
}

/**
 * Что показать о уровне до старта: поле, рычаг, ставший жёстче, порог золота.
 * Рычаг вычисляется сравнением с предыдущим уровнем — так подпись не разойдётся
 * с таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте поля игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  if (harder === 'size') intro = { key: 'intro.field', vars: { n: p.size } };
  if (harder === 'keep') intro = { key: 'intro.crosses', vars: { n: perfectCrosses(n) } };
  if (harder === 'maxValue') intro = { key: 'intro.maxValue', vars: { n: p.maxValue } };
  if (harder === 'negative') intro = { key: 'intro.negative', vars: {} };
  return {
    field: { key: 'level.field', vars: { n: p.size } },
    intro,
    goldHint: { key: 'level.goldHint', vars: { n: perfectCrosses(n) } },
  };
}
