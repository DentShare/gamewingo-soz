import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';
import { PICTURES } from './pictures';

/**
 * Лестница пазла: пятнадцать картинок в трёх главах по рычагу сложности.
 *
 * Игра для 3–7 лет, проиграть нельзя: кусочек, положенный не туда, спокойно
 * возвращается в лоток. Звёзды считаются по числу таких промахов, а не по
 * времени — детей нельзя торопить, поэтому ни таймера, ни лимита ходов здесь нет.
 * Сложность растёт тремя мягкими рычагами:
 *
 * - Глава 1 «Знакомство» — яркая подсказка под полем, растёт только число
 *   кусочков (4 → 12).
 * - Глава 2 «По памяти» — на знакомом поле подсказка бледнеет, потом поле
 *   растёт с подсказкой поярче, и к концу главы она исчезает совсем.
 * - Глава 3 «Выбирай сам» — в лотке лежат четыре кусочка вместо трёх: из них
 *   надо найти нужный. Поле растёт до 20 с бледной подсказкой, и она снова тает.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться — рост поля идёт с подсказкой поярче.
 * Раньше лестница стояла на месте (два уровня 3×3 подряд, пять уровней 4×5 с
 * одинаковыми правилами) — это ловят тесты, сравнивающие соседние уровни.
 */

export interface JigsawParams {
  /** Кусочков всего — рычаг поля; сетка `cols × rows` производна от него. */
  pieces: number;
  /** Кусочков по горизонтали и вертикали. */
  cols: number;
  rows: number;
  /** id картинки из манифеста. */
  picture: string;
  /**
   * Яркость подсказки — бледной картинки под полем: 3 — яркая, 2 и 1 — бледнее,
   * 0 — подсказки нет, собираем по памяти. Прозрачность — `GHOST_ALPHA`.
   */
  hint: number;
  /** Показывать ли подсказку вообще — производно от `hint`. */
  ghost: boolean;
  /** Сколько кусочков лежит в лотке одновременно: чем больше, тем дольше искать нужный. */
  tray: number;
}

export type JigsawLevel = LevelDef<JigsawParams>;

/**
 * Рычаги сложности и в какую сторону каждый делает уровень жёстче. Сетка и
 * `ghost` производны от кусочков и подсказки и рычагами не считаются.
 */
export const LEVERS = { pieces: 'more', hint: 'less', tray: 'more' } as const;

/** Прозрачность подсказки по её яркости `hint` (индекс). */
export const GHOST_ALPHA = [0, 0.12, 0.2, 0.32] as const;

/**
 * Сетки по числу кусочков — поле квадратное, поэтому ближе к квадрату; 8 —
 * в четыре колонки, чтобы высокий кусочек крупно лёг в лоток.
 */
const GRID: Record<number, [cols: number, rows: number]> = {
  4: [2, 2],
  6: [2, 3],
  8: [4, 2],
  9: [3, 3],
  12: [3, 4],
  15: [3, 5],
  16: [4, 4],
  20: [4, 5],
};

/** Уровни как таблица: так кривую сложности видно целиком и её легко править. */
const TABLE: Array<[pieces: number, hint: number, tray: number, gold: number, silver: number]> = [
  // Глава 1 · Знакомство — только поле.
  [4, 3, 3, 0, 2],
  [6, 3, 3, 0, 2],
  [8, 3, 3, 1, 3],
  [9, 3, 3, 1, 3],
  [12, 3, 3, 1, 4],
  // Глава 2 · По памяти.
  [12, 2, 3, 2, 4], //  новое: подсказка бледнее на знакомом поле
  [12, 1, 3, 2, 4], //  ещё бледнее
  [15, 2, 3, 2, 5], //  поле больше, подсказка поярче
  [15, 1, 3, 2, 5], //  бледнее
  [15, 0, 3, 3, 6], //  без подсказки
  // Глава 3 · Выбирай сам.
  [15, 0, 4, 3, 6], //  новое: в лотке четыре кусочка
  [16, 1, 4, 3, 6], //  поле больше, бледная подсказка возвращается
  [16, 0, 4, 3, 7], //  без подсказки
  [20, 1, 4, 4, 8], //  поле больше, бледная подсказка
  [20, 0, 4, 4, 8], //  финал: 4×5 по памяти из четырёх кусочков
];

export const LADDER: readonly JigsawLevel[] = TABLE.map(([pieces, hint, tray, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  const [cols, rows] = GRID[pieces];
  // Картинка своя на каждом уровне — новая история как награда за сборку.
  const picture = PICTURES[i % PICTURES.length].id;
  return { n: i + 1, params: { pieces, cols, rows, picture, hint, ghost: hint > 0, tray }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): JigsawLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип поля: «12 кусочков». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд — по промахам. */
  goldHint: Phrase;
}

/**
 * Что показать о картинке до старта: поле, новый рычаг, порог золота. Новый рычаг
 * вычисляется сравнением с предыдущим уровнем — так подпись не разойдётся с
 * таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте поля игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  if (harder === 'pieces') intro = { key: 'intro.field', vars: {} };
  if (harder === 'hint') intro = { key: p.hint ? 'intro.hintFainter' : 'intro.noHint', vars: {} };
  if (harder === 'tray') intro = { key: 'intro.tray', vars: { n: p.tray } };
  return {
    field: { key: 'level.field', vars: { n: p.pieces } },
    intro,
    // Золото «без промахов» — своя фраза: «не больше 0» ребёнку и родителю не читается.
    goldHint: goals.gold > 0
      ? { key: 'level.goldHint', vars: { n: goals.gold } }
      : { key: 'level.goldHintFlawless', vars: {} },
  };
}
