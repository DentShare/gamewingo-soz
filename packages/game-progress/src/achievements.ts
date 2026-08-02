import { readJson, writeJson } from './storage.js';
import { computeDayId } from './day.js';
import type { RoundOutcome } from './missions.js';

/**
 * Достижения каталога — долгие цели поверх дневных заданий: сотни звёзд,
 * все игры, серия дней подряд. Считаются из накопительной статистики устройства.
 */

export interface Stats {
  /** Всего пройдено уровней по всем играм. */
  levels: number;
  /** Всего заработано звёзд. */
  stars: number;
  /** Сумма очков за все партии. */
  score: number;
  /** Слаги игр, в которые вообще играли. */
  slugs: string[];
  /** Последний день с партией — по нему считается серия. */
  lastDayId: number;
  /** Дней подряд с игрой. */
  streak: number;
  bestStreak: number;
}

const STATS_KEY = 'wingo:stats';

export const EMPTY_STATS: Stats = {
  levels: 0, stars: 0, score: 0, slugs: [], lastDayId: 0, streak: 0, bestStreak: 0,
};

export function loadStats(): Stats {
  const raw = readJson<Partial<Stats>>(STATS_KEY);
  if (!raw) return { ...EMPTY_STATS, slugs: [] };
  return {
    levels: Number(raw.levels) || 0,
    stars: Number(raw.stars) || 0,
    score: Number(raw.score) || 0,
    slugs: Array.isArray(raw.slugs) ? raw.slugs.filter((s) => typeof s === 'string') : [],
    lastDayId: Number(raw.lastDayId) || 0,
    streak: Number(raw.streak) || 0,
    bestStreak: Number(raw.bestStreak) || 0,
  };
}

/**
 * Добавляет итог партии в накопительную статистику. Серия дней растёт, если прошлая
 * партия была вчера, и сбрасывается в единицу при пропуске хотя бы одного дня.
 */
export function recordStats(outcome: RoundOutcome, dayId: number = computeDayId()): Stats {
  const s = loadStats();
  if (outcome.cleared) s.levels += 1;
  s.stars += Math.max(0, outcome.stars);
  s.score += Math.max(0, outcome.score);
  if (!s.slugs.includes(outcome.slug)) s.slugs.push(outcome.slug);

  if (dayId !== s.lastDayId) {
    s.streak = dayId === s.lastDayId + 1 ? s.streak + 1 : 1;
    s.lastDayId = dayId;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  }

  writeJson(STATS_KEY, s);
  return s;
}

export type AchievementKind = 'levels' | 'stars' | 'score' | 'variety' | 'streak';

export interface AchievementDef {
  id: string;
  kind: AchievementKind;
  target: number;
}

/** Все игры каталога — цель достижения «сыграй во всё». */
export const CATALOG_SIZE = 11;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'levels10', kind: 'levels', target: 10 },
  { id: 'levels50', kind: 'levels', target: 50 },
  { id: 'levels150', kind: 'levels', target: 150 },
  { id: 'stars30', kind: 'stars', target: 30 },
  { id: 'stars100', kind: 'stars', target: 100 },
  { id: 'stars300', kind: 'stars', target: 300 },
  { id: 'score25k', kind: 'score', target: 25_000 },
  { id: 'score100k', kind: 'score', target: 100_000 },
  { id: 'variety5', kind: 'variety', target: 5 },
  { id: 'varietyAll', kind: 'variety', target: CATALOG_SIZE },
  { id: 'streak3', kind: 'streak', target: 3 },
  { id: 'streak7', kind: 'streak', target: 7 },
];

export interface Achievement extends AchievementDef {
  progress: number;
  done: boolean;
}

export function achievementProgress(def: AchievementDef, s: Stats): number {
  switch (def.kind) {
    case 'levels': return s.levels;
    case 'stars': return s.stars;
    case 'score': return s.score;
    case 'variety': return s.slugs.length;
    case 'streak': return s.bestStreak;
  }
}

/** Достижения с текущим прогрессом: невыполненные — по близости к цели, выполненные в конец. */
export function achievements(stats: Stats = loadStats()): Achievement[] {
  const list = ACHIEVEMENTS.map((def) => {
    const raw = achievementProgress(def, stats);
    const progress = Math.min(def.target, raw);
    return { ...def, progress, done: progress >= def.target };
  });
  return list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.progress / b.target - a.progress / a.target;
  });
}
