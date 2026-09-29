import { harderLevers, type LevelDef, type StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница мини-судоку: пятнадцать уровней в трёх главах по рычагу сложности.
 *
 * - Глава 1 «Знакомство» — поле 4×4 без ограничений, готовых цифр всё меньше.
 * - Глава 2 «Аккуратно» (лимит ошибок) — на знакомом 4×4 появляется лимит ошибок; потом
 *   поле вырастает до 6×6 с щедрыми цифрами и мягким лимитом, и лимит ужимается.
 * - Глава 3 «На время» — к лимиту ошибок добавляется таймер; финал — 6×6
 *   с четырнадцатью цифрами, двумя ошибками и четырьмя минутами, как и раньше.
 *
 * Правило (docs/PROGRESSION.md): на каждом уровне жёстче становится ровно один
 * рычаг; остальные могут только смягчиться — рост поля идёт с мягким лимитом и
 * большим числом готовых цифр. Раньше уровни 5 и 11 стакали по два рычага
 * (цифры + таймер), а 6×6 приходило вместе со сбросом всех лимитов в ноль.
 */

export interface SudokuParams {
  size: 4 | 6;
  /** Сколько клеток открыто в начале (готовые цифры). Меньше — сложнее. */
  clues: number;
  /** Потолок ошибок; 0 — без лимита. Исчерпал — уровень не пройден. */
  mistakeLimit: number;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type SudokuLevel = LevelDef<SudokuParams>;

/** Рычаги сложности и в какую сторону каждый делает уровень жёстче. */
export const LEVERS = { size: 'more', clues: 'less', mistakeLimit: 'limit', timeLimitSec: 'limit' } as const;

/** Уровни как таблица: так кривую сложности видно целиком и её легко править. Пороги звёзд — секунды. */
const TABLE: Array<[size: 4 | 6, clues: number, mistakeLimit: number, timeLimitSec: number, gold: number, silver: number]> = [
  // Глава 1 · Знакомство — 4×4, только меньше готовых цифр.
  [4, 11, 0, 0, 45, 90],
  [4, 10, 0, 0, 50, 100],
  [4, 9, 0, 0, 55, 110],
  [4, 8, 0, 0, 65, 130],
  [4, 7, 0, 0, 70, 140],
  // Глава 2 · Считаем ошибки.
  [4, 7, 3, 0, 70, 140], //    новое: лимит ошибок на знакомом поле
  [4, 6, 3, 0, 75, 140], //    меньше цифр
  [6, 22, 4, 0, 120, 240], //  поле 6×6: цифр много, лимит мягкий
  [6, 22, 3, 0, 120, 240], //  лимит строже
  [6, 19, 3, 0, 150, 280], //  меньше цифр
  // Глава 3 · На время.
  [6, 19, 3, 300, 150, 260], // новое: таймер
  [6, 16, 3, 300, 165, 260], // меньше цифр
  [6, 16, 2, 300, 165, 260], // лимит ошибок строже
  [6, 14, 2, 300, 170, 260], // меньше цифр
  [6, 14, 2, 240, 150, 220], // таймер строже — финал как раньше
];

export const LADDER: readonly SudokuLevel[] = TABLE.map(([size, clues, mistakeLimit, timeLimitSec, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  return { n: i + 1, params: { size, clues, mistakeLimit, timeLimitSec }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Названия глав — ключи словаря; глава n — уровни 5(n−1)+1 … 5n. */
export const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SudokuLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

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
  /** Порог трёх звёзд — время решения. */
  goldHint: Phrase;
}

/** «1:50» — время в подписи. */
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
  if (prev && harder === 'size') intro = { key: 'intro.field', vars: { n: p.size } };
  if (prev && harder === 'clues') intro = { key: 'intro.clues', vars: { n: p.clues } };
  if (prev && harder === 'mistakeLimit') {
    intro = { key: prev.mistakeLimit ? 'intro.mistakesTighter' : 'intro.mistakes', vars: { n: p.mistakeLimit } };
  }
  if (prev && harder === 'timeLimitSec') {
    intro = { key: prev.timeLimitSec ? 'intro.timerTighter' : 'intro.timer', vars: { t: formatSec(p.timeLimitSec) } };
  }
  return {
    field: { key: 'level.field', vars: { n: p.size } },
    intro,
    goldHint: { key: 'level.goldHint', vars: { t: formatSec(goals.gold) } },
  };
}
