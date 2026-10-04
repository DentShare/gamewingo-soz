import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';
import type { BinCount, Mode } from './sorting';

/**
 * Лестница «Сортировки»: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * Проиграть по-прежнему нельзя — это игра для 3–6 лет, ошибка только уменьшает
 * число звёзд. Рычагов три: число фигурок, признак (цвет ⇄ форма) и четвёртая
 * корзина.
 *
 * - Глава 1 «Цвета» — раскладываем по цвету в три корзины, растёт только число
 *   фигурок (6 → 14).
 * - Глава 2 «Формы» — на короткой партии появляется сортировка по форме, потом
 *   снова растёт число фигурок.
 * - Глава 3 «Ещё корзина» — на знакомой длине появляется четвёртая корзина,
 *   признак чередуется, финал — 20 фигурок по форме в четыре корзины.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться. Смена признака — тоже рычаг: ребёнку
 * надо переучиться, что важно, поэтому в этот уровень ничто другое не растёт, а
 * партия становится короче. Раньше новая четвёртая корзина приходила вместе со
 * сменой признака (уровень 7: форма → цвет и 4 корзины) — это ловят тесты.
 */

export interface SortingParams {
  total: number;
  mode: Mode;
  bins: BinCount;
}

export type SortingLevel = LevelDef<SortingParams>;

/**
 * Рычаги сложности с направлением. Признак (`mode`) направления не имеет —
 * любая его смена считается отдельным рычагом, см. `modeChanged`.
 */
export const LEVERS = { total: 'more', bins: 'more' } as const;

/** Сменился признак сортировки — ребёнку надо переучиться, это рычаг уровня. */
export function modeChanged(prev: SortingParams, cur: SortingParams): boolean {
  return prev.mode !== cur.mode;
}

/** [фигурок, признак, корзин, золото по ошибкам, серебро по ошибкам]. */
const TABLE: Array<[number, Mode, BinCount, number, number]> = [
  // Глава 1 · Цвета — только число фигурок.
  [6, 'color', 3, 0, 2],
  [8, 'color', 3, 0, 2],
  [10, 'color', 3, 0, 2],
  [12, 'color', 3, 1, 3],
  [14, 'color', 3, 1, 3],
  // Глава 2 · Формы.
  [10, 'shape', 3, 0, 2], // новое: по форме, партия короче
  [12, 'shape', 3, 1, 3], // фигурок больше
  [14, 'shape', 3, 1, 3],
  [16, 'shape', 3, 2, 4],
  [18, 'shape', 3, 2, 4],
  // Глава 3 · Ещё корзина.
  [14, 'shape', 4, 1, 3], // новое: четвёртая корзина, партия короче
  [14, 'color', 4, 1, 3], // признак сменился — та же длина
  [18, 'color', 4, 2, 4], // фигурок больше
  [18, 'shape', 4, 2, 4], // признак сменился — та же длина
  [20, 'shape', 4, 2, 5], // финал
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

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип длины партии: «12 фигурок». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд по ошибкам. */
  goldHint: Phrase;
}

/**
 * Что показать о уровне до старта: длину партии, новый рычаг, порог золота.
 * Новый рычаг вычисляется сравнением с предыдущим уровнем — так подпись не
 * разойдётся с таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  if (prev && modeChanged(prev, p)) {
    intro = { key: p.mode === 'shape' ? 'intro.modeShape' : 'intro.modeColor', vars: {} };
  } else if (prev) {
    // Называем тот рычаг, что стал жёстче: смягчения игрок не ищет.
    const harder = harderLevers(prev, p, LEVERS)[0];
    if (harder === 'total') intro = { key: 'intro.field', vars: { n: p.total } };
    if (harder === 'bins') intro = { key: 'intro.bins', vars: { n: p.bins } };
  }
  return {
    field: { key: 'level.field', vars: { n: p.total } },
    intro,
    // «Ошибок не больше 0» звучит странно — для золота без ошибок своя фраза.
    goldHint: goals.gold > 0
      ? { key: 'level.goldHint', vars: { n: goals.gold } }
      : { key: 'level.goldHintClean', vars: {} },
  };
}
