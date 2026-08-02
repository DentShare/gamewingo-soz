import { beforeEach, describe, expect, it } from 'vitest';
import { computeDayId, hashIndex } from './day.js';
import {
  dailyMissions, loadCounters, MISSIONS_PER_DAY, MISSION_POOL, missionsForDay, recordRound,
} from './missions.js';
import { achievements, loadStats, recordStats } from './achievements.js';

const DAY = 20_500;

beforeEach(() => {
  localStorage.clear();
});

describe('день', () => {
  it('номер дня растёт на единицу за сутки', () => {
    const t = Date.UTC(2026, 6, 30, 12);
    expect(computeDayId(t + 86_400_000) - computeDayId(t)).toBe(1);
  });

  it('день начинается в полночь по Ташкенту (UTC+5)', () => {
    // 18:59 UTC = 23:59 в Ташкенте — ещё вчерашний день; 19:00 UTC — уже новый.
    expect(computeDayId(Date.UTC(2026, 6, 30, 18, 59))).toBe(computeDayId(Date.UTC(2026, 6, 30, 12)));
    expect(computeDayId(Date.UTC(2026, 6, 30, 19, 0))).toBe(computeDayId(Date.UTC(2026, 6, 30, 12)) + 1);
  });

  it('хэш детерминирован и не выходит за границы', () => {
    expect(hashIndex(DAY, 8)).toBe(hashIndex(DAY, 8));
    for (let d = 0; d < 500; d++) {
      const i = hashIndex(d, MISSION_POOL.length);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(MISSION_POOL.length);
    }
  });
});

describe('задания дня', () => {
  it('всегда три и одинаковы в пределах дня', () => {
    expect(missionsForDay(DAY)).toHaveLength(MISSIONS_PER_DAY);
    expect(missionsForDay(DAY)).toEqual(missionsForDay(DAY));
  });

  it('виды заданий за день не повторяются', () => {
    for (let d = DAY; d < DAY + 60; d++) {
      const kinds = missionsForDay(d).map((m) => m.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it('набор меняется от дня ко дню', () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => missionsForDay(DAY + i).map((m) => `${m.kind}${m.target}`).join()),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('счётчики дня', () => {
  it('копят уровни, звёзды, очки и разные игры', () => {
    recordRound({ slug: 'pairs', cleared: true, stars: 3, score: 900 }, DAY);
    recordRound({ slug: 'snake', cleared: false, stars: 0, score: 400 }, DAY);
    const c = loadCounters(DAY);
    expect(c).toMatchObject({ levels: 1, stars: 3, score: 1300 });
    expect(c.slugs).toEqual(['pairs', 'snake']);
  });

  it('одна и та же игра не считается дважды в «разных играх»', () => {
    recordRound({ slug: 'pairs', cleared: true, stars: 1, score: 10 }, DAY);
    recordRound({ slug: 'pairs', cleared: true, stars: 1, score: 10 }, DAY);
    expect(loadCounters(DAY).slugs).toEqual(['pairs']);
  });

  it('на новый день счётчики обнуляются', () => {
    recordRound({ slug: 'pairs', cleared: true, stars: 3, score: 900 }, DAY);
    expect(loadCounters(DAY + 1)).toMatchObject({ levels: 0, stars: 0, score: 0, slugs: [] });
  });

  it('прогресс задания не превышает цели', () => {
    for (let i = 0; i < 20; i++) recordRound({ slug: `g${i}`, cleared: true, stars: 3, score: 9000 }, DAY);
    for (const m of dailyMissions(DAY)) {
      expect(m.progress).toBeLessThanOrEqual(m.target);
      expect(m.done).toBe(true);
    }
  });
});

describe('достижения', () => {
  it('копят статистику по всем играм', () => {
    recordStats({ slug: 'pairs', cleared: true, stars: 3, score: 500 }, DAY);
    recordStats({ slug: 'snake', cleared: false, stars: 0, score: 200 }, DAY);
    expect(loadStats()).toMatchObject({ levels: 1, stars: 3, score: 700, slugs: ['pairs', 'snake'] });
  });

  it('серия растёт день за днём и рвётся при пропуске', () => {
    recordStats({ slug: 'pairs', cleared: true, stars: 1, score: 1 }, DAY);
    expect(loadStats().streak).toBe(1);
    recordStats({ slug: 'pairs', cleared: true, stars: 1, score: 1 }, DAY + 1);
    expect(loadStats().streak).toBe(2);
    // Вторая партия в тот же день серию не двигает.
    recordStats({ slug: 'pairs', cleared: true, stars: 1, score: 1 }, DAY + 1);
    expect(loadStats().streak).toBe(2);
    recordStats({ slug: 'pairs', cleared: true, stars: 1, score: 1 }, DAY + 5);
    expect(loadStats().streak).toBe(1);
    expect(loadStats().bestStreak).toBe(2);
  });

  it('невыполненные идут первыми, ближайшие к цели — выше', () => {
    recordStats({ slug: 'pairs', cleared: true, stars: 30, score: 100 }, DAY);
    const list = achievements();
    const doneAt = list.findIndex((a) => a.done);
    if (doneAt >= 0) expect(list.slice(doneAt).every((a) => a.done)).toBe(true);
    expect(list.find((a) => a.id === 'stars30')?.done).toBe(true);
  });
});
