import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «Найди пару»: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * - Глава 1 «Знакомство» — без ограничений, растёт только поле (4 → 9 пар).
 * - Глава 2 «Лимит ходов» — на знакомом поле появляется лимит, потом он
 *   ужимается, потом растёт поле с мягким лимитом.
 * - Глава 3 «На время» — к лимиту ходов добавляется таймер и так же ужимается.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться — рост поля идёт с мягким лимитом.
 * Раньше финал стакал три сразу — 15 пар + 28 ходов + 80 секунд на одном
 * уровне; это ловят тесты, сравнивающие соседние уровни.
 */

export interface PairsParams {
  pairs: number;
  cols: number;
  rows: number;
  /** Потолок ходов; 0 — без лимита. Исчерпал — уровень не пройден. */
  moveLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type PairsLevel = LevelDef<PairsParams>;

/**
 * Рычаги сложности и в какую сторону каждый делает уровень жёстче. Раскладка
 * поля производна от пар и рычагом не считается.
 */
export const LEVERS = { pairs: 'more', moveLimit: 'limit', timeLimitSec: 'limit' } as const;

/** Раскладки поля по числу пар — подобраны так, чтобы карточки оставались крупными в портрете. */
const GRID: Record<number, [cols: number, rows: number]> = {
  4: [2, 4],
  5: [2, 5],
  6: [3, 4],
  8: [4, 4],
  9: [3, 6],
  10: [4, 5],
  12: [4, 6],
  15: [5, 6],
};

/** Уровни как таблица: так кривую сложности видно целиком и её легко править. */
const TABLE: Array<[pairs: number, moveLimit: number, timeLimitSec: number, gold: number, silver: number]> = [
  // Глава 1 · Знакомство — только поле.
  [4, 0, 0, 5, 8],
  [5, 0, 0, 7, 10],
  [6, 0, 0, 8, 12],
  [8, 0, 0, 11, 16],
  [9, 0, 0, 13, 18],
  // Глава 2 · Лимит ходов.
  [9, 22, 0, 12, 16], //  новое: лимит ходов на знакомом поле
  [9, 20, 0, 12, 16], //  лимит строже
  [10, 24, 0, 14, 18], // поле больше, лимит мягкий
  [10, 22, 0, 14, 18], // лимит строже
  [12, 28, 0, 16, 21], // поле больше
  // Глава 3 · На время.
  [12, 28, 110, 16, 21], // новое: таймер
  [12, 28, 95, 16, 21], //  таймер строже
  [15, 36, 140, 20, 26], // поле больше, лимиты мягкие
  [15, 32, 140, 20, 26], // лимит ходов строже
  [15, 32, 115, 20, 26], // таймер строже
];

export const LADDER: readonly PairsLevel[] = TABLE.map(([pairs, moveLimit, timeLimitSec, gold, silver], i) => {
  const [cols, rows] = GRID[pairs];
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { pairs, cols, rows, moveLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): PairsLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Ключ словаря с подстановками — core не знает языков, только что сказать. */
export interface Phrase {
  key: string;
  vars: Record<string, number | string>;
}

export interface LevelInfo {
  /** Чип поля: «9 пар». Ключ с формой числа — `level.field.<one|few|many>`. */
  field: Phrase;
  /** Что нового по сравнению с предыдущим уровнем; на первом — ничего. */
  intro: Phrase | null;
  /** Порог трёх звёзд. */
  goldHint: Phrase;
}

/** «1:50» — таймер в подписи. */
export function formatSec(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * Что показать о уровне до старта: поле, новый рычаг, порог золота. Новый рычаг
 * вычисляется сравнением с предыдущим уровнем — так подпись не разойдётся с
 * таблицей, сколько её ни правь.
 */
export function levelInfo(n: number): LevelInfo {
  const { params: p, goals } = levelAt(n);
  const prev = n > 1 ? levelAt(n - 1).params : null;
  let intro: Phrase | null = null;
  // Называем тот рычаг, что стал жёстче: смягчения при росте поля игрок не ищет.
  const harder = prev ? harderLevers(prev, p, LEVERS)[0] : undefined;
  if (prev && harder === 'pairs') intro = { key: 'intro.field', vars: { n: p.pairs } };
  if (prev && harder === 'moveLimit') {
    intro = { key: prev.moveLimit ? 'intro.moveLimitTighter' : 'intro.moveLimit', vars: { n: p.moveLimit } };
  }
  if (prev && harder === 'timeLimitSec') {
    intro = { key: prev.timeLimitSec ? 'intro.timerTighter' : 'intro.timer', vars: { t: formatSec(p.timeLimitSec) } };
  }
  return {
    field: { key: 'level.field', vars: { n: p.pairs } },
    intro,
    goldHint: { key: 'level.goldHint', vars: { n: goals.gold } },
  };
}
