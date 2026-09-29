import { chapterLevels } from './ladder.js';
import { computeDayId, hashIndex } from './day.js';
import { isUnlocked, type Progress } from './progress.js';
import { readJson, writeJson } from './storage.js';

/**
 * Главы и уровень дня — надстройка над лестницей (T7 UX-волны).
 *
 * Пятнадцать одинаковых плиток не читаются как путь. Главы по пять с названием
 * по рычагу сложности («Знакомство», «Лимит ходов», «На время») дают ритм и
 * промежуточную цель, а уровень дня — повод заходить каждый день без новых
 * уровней: тот же генератор, но с зерном от даты, поэтому расклад один на всех.
 */

export interface ChapterState {
  /** Номер главы с единицы. */
  n: number;
  levels: number[];
  /** Пройдено уровней главы (хотя бы на одну звезду). */
  cleared: number;
  /** Все уровни главы пройдены. */
  done: boolean;
  /** Открыт первый уровень главы — в неё можно войти. */
  unlocked: boolean;
  stars: number;
  maxStars: number;
}

/** Состояние глав лестницы из `total` уровней по сохранённому прогрессу. */
export function chapterStates(progress: Progress, total: number): ChapterState[] {
  return chapterLevels(total).map((levels, i) => {
    const starsOf = (n: number) => progress.stars[n - 1] ?? 0;
    const cleared = levels.filter((n) => starsOf(n) > 0).length;
    return {
      n: i + 1,
      levels,
      cleared,
      done: cleared === levels.length,
      unlocked: isUnlocked(progress, levels[0]),
      stars: levels.reduce((sum, n) => sum + starsOf(n), 0),
      maxStars: levels.length * 3,
    };
  });
}

/** Глава, в которой лежит уровень `n` (номер с единицы). */
export function chapterOf(n: number, size = 5): number {
  return Math.floor((Math.max(1, n) - 1) / size) + 1;
}

/**
 * Уровень дня: параметры одного из уровней 8–12 (вторая половина лестницы —
 * уже не разминка, ещё не финал) и расклад по зерну от даты. Открывается,
 * когда пройден уровень 10: игрок знает все рычаги, кроме финальных.
 */
export const DAILY_LEVEL = { from: 8, to: 12, unlockAfter: 10 } as const;

export interface DailyLevel {
  /** Чьи параметры берём — номер уровня лестницы. */
  n: number;
  /** Зерно раскладки: одно на игру и день, одинаковое у всех игроков. */
  seed: number;
}

/** Строковое зерно → 32-битное число (FNV-1a): у всех устройств одинаково. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Уровень дня игры `slug` на день `dayId`: детерминирован, без обращения к серверу. */
export function dailyLevelFor(slug: string, dayId: number = computeDayId()): DailyLevel {
  const seed = hashString(`${slug}:${dayId}`);
  const span = DAILY_LEVEL.to - DAILY_LEVEL.from + 1;
  return { n: DAILY_LEVEL.from + hashIndex(seed, span), seed };
}

export function isDailyLevelUnlocked(progress: Progress): boolean {
  return (progress.stars[DAILY_LEVEL.unlockAfter - 1] ?? 0) > 0;
}

const dailyKey = (slug: string) => `${slug}:dailyLevel`;

/** Уровень дня уже пройден сегодня — карточка показывает «Пройден», а не «Играть». */
export function isDailyLevelDone(slug: string, dayId: number = computeDayId()): boolean {
  return readJson<number>(dailyKey(slug)) === dayId;
}

export function markDailyLevelDone(slug: string, dayId: number = computeDayId()): void {
  writeJson(dailyKey(slug), dayId);
}
