import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Пятнашек»: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * - Глава 1 «Знакомство» — без ограничений: расклад перемешан всё сильнее,
 *   поле вырастает с 3×3 до 4×4.
 * - Глава 2 «Лимит ходов» — на знакомом поле 4×4 появляется лимит, потом он
 *   ужимается, потом перемешивание глубже с мягким лимитом.
 * - Глава 3 «На время» — к лимиту ходов добавляется таймер и ужимается; финал
 *   на поле 5×5.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться — рост поля и более глубокое
 * перемешивание идут с мягким лимитом. Главный рычаг внутри размера — глубина
 * перемешивания (`walk`): так партия остаётся в рамках нескольких минут даже на
 * большой доске. Новый размер поля начинается с лёгкого расклада.
 */

export interface FifteenParams {
  /** Сторона поля: 3 → плитки 1..8, 4 → 1..15, 5 → 1..24. */
  size: number;
  /** Длина случайного блуждания при генерации расклада — глубина перемешивания. */
  walk: number;
  /** Потолок ходов; 0 — без лимита. */
  moveLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type FifteenLevel = LevelDef<FifteenParams>;

/**
 * Рычаги сложности и в какую сторону каждый делает уровень жёстче. Поле растёт
 * вверх, перемешивание — глубже, лимиты появляются и ужимаются.
 */
export const LEVERS = { size: 'more', walk: 'more', moveLimit: 'limit', timeLimitSec: 'limit' } as const;

/** Уровни как таблица: так кривую сложности видно целиком и её легко править. */
const TABLE: Array<[size: number, walk: number, moveLimit: number, timeLimitSec: number, gold: number, silver: number]> = [
  // Глава 1 · Знакомство — без ограничений.
  [3, 30, 0, 0, 24, 40],
  [3, 60, 0, 0, 34, 55], //        перемешано сильнее
  [3, 100, 0, 0, 42, 70], //       перемешано сильнее
  [4, 60, 0, 0, 50, 85], //        поле 4×4, расклад снова лёгкий
  [4, 120, 0, 0, 75, 125], //      перемешано сильнее
  // Глава 2 · Лимит ходов.
  [4, 120, 150, 0, 75, 125], //    новое: лимит ходов на знакомом поле
  [4, 120, 130, 0, 75, 125], //    лимит строже
  [4, 200, 180, 0, 95, 150], //    перемешано сильнее, лимит мягкий
  [4, 200, 160, 0, 95, 150], //    лимит строже
  [4, 260, 170, 0, 105, 155], //   перемешано сильнее, лимит мягкий
  // Глава 3 · На время.
  [4, 260, 170, 240, 105, 155], // новое: таймер
  [4, 260, 170, 200, 105, 155], // таймер строже
  [5, 90, 220, 300, 110, 190], //  поле 5×5, расклад и лимиты мягкие
  [5, 150, 270, 300, 150, 250], // перемешано сильнее, лимит ходов мягкий
  [5, 150, 270, 270, 150, 250], // таймер строже
];

export const LADDER: readonly FifteenLevel[] = TABLE.map(([size, walk, moveLimit, timeLimitSec, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { size, walk, moveLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): FifteenLevel {
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
  /** Чип поля: «4×4». Ключ с формой числа — `level.field.<one|few|many>` (формы одинаковые). */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд — по ходам. */
  goldHint: Phrase;
}

/** «4:00» — таймер в подписи. */
export function formatSec(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * Что показать о уровне до старта: поле, рычаг, ставший жёстче, порог золота.
 * Рычаг вычисляется сравнением с предыдущим уровнем — так подпись не разойдётся
 * с таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте поля игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  if (prev && harder === 'size') intro = { key: 'intro.field', vars: { n: p.size } };
  if (prev && harder === 'walk') intro = { key: 'intro.walk', vars: {} };
  if (prev && harder === 'moveLimit') {
    intro = { key: prev.moveLimit ? 'intro.moveLimitTighter' : 'intro.moveLimit', vars: { n: p.moveLimit } };
  }
  if (prev && harder === 'timeLimitSec') {
    intro = { key: prev.timeLimitSec ? 'intro.timerTighter' : 'intro.timer', vars: { t: formatSec(p.timeLimitSec) } };
  }
  return {
    field: { key: 'level.field', vars: { n: p.size } },
    intro,
    goldHint: { key: 'level.goldHint', vars: { n: goals.gold } },
  };
}
