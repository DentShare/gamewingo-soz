import { beforeEach, describe, expect, it } from 'vitest';
import {
  chapterOf, chapterStates, DAILY_LEVEL, dailyLevelFor, isDailyLevelDone, isDailyLevelUnlocked,
  markDailyLevelDone,
} from './chapters.js';
import { changedLevers, harderLevers } from './ladder.js';
import type { Progress } from './progress.js';

const DAY = 20_600;
const withStars = (stars: number[]): Progress => ({ stars, best: [] });

beforeEach(() => localStorage.clear());

describe('главы', () => {
  it('новичок: первая глава открыта и пуста, остальные закрыты', () => {
    const [c1, c2, c3] = chapterStates(withStars([]), 15);
    expect(c1).toMatchObject({ n: 1, levels: [1, 2, 3, 4, 5], cleared: 0, done: false, unlocked: true, maxStars: 15 });
    expect(c2.unlocked).toBe(false);
    expect(c3.unlocked).toBe(false);
  });

  it('пройденная глава открывает следующую и считает звёзды', () => {
    const [c1, c2] = chapterStates(withStars([3, 3, 2, 3, 1, 2]), 15);
    expect(c1).toMatchObject({ cleared: 5, done: true, stars: 12 });
    expect(c2).toMatchObject({ cleared: 1, done: false, unlocked: true, stars: 2 });
  });

  it('номер главы по номеру уровня', () => {
    expect([1, 5, 6, 10, 11, 15].map((n) => chapterOf(n))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('уровень дня', () => {
  it('один и тот же на весь день, у всех одинаковый', () => {
    expect(dailyLevelFor('pairs', DAY)).toEqual(dailyLevelFor('pairs', DAY));
  });

  it('берёт параметры уровней 8–12', () => {
    const levels = new Set(Array.from({ length: 200 }, (_, i) => dailyLevelFor('pairs', DAY + i).n));
    for (const n of levels) {
      expect(n).toBeGreaterThanOrEqual(DAILY_LEVEL.from);
      expect(n).toBeLessThanOrEqual(DAILY_LEVEL.to);
    }
    // За двести дней встречаются все пять — день не залипает на одном уровне.
    expect(levels.size).toBe(DAILY_LEVEL.to - DAILY_LEVEL.from + 1);
  });

  it('у разных игр и разных дней — разные расклады', () => {
    expect(dailyLevelFor('pairs', DAY).seed).not.toBe(dailyLevelFor('pairs', DAY + 1).seed);
    expect(dailyLevelFor('pairs', DAY).seed).not.toBe(dailyLevelFor('sums', DAY).seed);
  });

  it('открывается после десятого уровня', () => {
    expect(isDailyLevelUnlocked(withStars(Array(9).fill(3)))).toBe(false);
    expect(isDailyLevelUnlocked(withStars(Array(10).fill(1)))).toBe(true);
  });

  it('отметка «пройден» живёт до конца дня', () => {
    expect(isDailyLevelDone('pairs', DAY)).toBe(false);
    markDailyLevelDone('pairs', DAY);
    expect(isDailyLevelDone('pairs', DAY)).toBe(true);
    expect(isDailyLevelDone('pairs', DAY + 1)).toBe(false);
    expect(isDailyLevelDone('sums', DAY)).toBe(false);
  });
});

describe('рычаги', () => {
  it('находит изменившиеся параметры среди перечисленных', () => {
    const a = { pairs: 9, moveLimit: 0, timeLimitSec: 0, cols: 3 };
    const b = { pairs: 9, moveLimit: 20, timeLimitSec: 0, cols: 4 };
    expect(changedLevers(a, b, ['pairs', 'moveLimit', 'timeLimitSec'])).toEqual(['moveLimit']);
  });
});

describe('рычаги жёстче', () => {
  const spec = { pairs: 'more', moveLimit: 'limit', clues: 'less' } as const;
  const lv = (pairs: number, moveLimit: number, clues: number) => ({ pairs, moveLimit, clues });

  it('появившийся и ужатый лимит — жёстче, снятый и расширенный — мягче', () => {
    expect(harderLevers(lv(9, 0, 5), lv(9, 22, 5), spec)).toEqual(['moveLimit']);
    expect(harderLevers(lv(9, 22, 5), lv(9, 20, 5), spec)).toEqual(['moveLimit']);
    expect(harderLevers(lv(9, 20, 5), lv(9, 24, 5), spec)).toEqual([]);
    expect(harderLevers(lv(9, 20, 5), lv(9, 0, 5), spec)).toEqual([]);
  });

  it('рост поля с мягким лимитом — один жёсткий рычаг', () => {
    expect(harderLevers(lv(9, 20, 5), lv(10, 24, 5), spec)).toEqual(['pairs']);
  });

  it('меньше подсказок — жёстче', () => {
    expect(harderLevers(lv(9, 0, 5), lv(9, 0, 4), spec)).toEqual(['clues']);
  });
});

describe('до третьей звезды', () => {
  it('ходы: меньше — лучше', async () => {
    const { starGap } = await import('./ladder.js');
    const goals = { gold: 8, silver: 11 };
    expect(starGap(goals, 8)).toBeNull();
    expect(starGap(goals, 9)).toEqual({ threshold: 8, missing: 1 });
    expect(starGap(goals, 14)).toEqual({ threshold: 8, missing: 6 });
  });

  it('очки: больше — лучше', async () => {
    const { starGap } = await import('./ladder.js');
    const goals = { gold: 500, silver: 300, higherIsBetter: true };
    expect(starGap(goals, 520)).toBeNull();
    expect(starGap(goals, 480)).toEqual({ threshold: 500, missing: 20 });
  });

  it('дробная метрика округляется вверх и не бывает нулём', async () => {
    const { starGap } = await import('./ladder.js');
    expect(starGap({ gold: 40, silver: 60 }, 40.2)).toEqual({ threshold: 40, missing: 1 });
  });
});
