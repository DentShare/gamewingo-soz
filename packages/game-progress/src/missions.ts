import { readJson, writeJson } from './storage.js';
import { computeDayId, hashIndex } from './day.js';

/**
 * Задания дня и достижения каталога — мета-слой поверх лестниц уровней.
 * Считаются на устройстве: баллы за них всё равно начисляет сервер по присланному
 * результату партии, здесь только повод вернуться в игру завтра.
 */

/** Что именно считает задание. */
export type MissionKind =
  /** Пройти N уровней (в любых играх). */
  | 'levels'
  /** Заработать N звёзд. */
  | 'stars'
  /** Набрать N очков суммарно. */
  | 'score'
  /** Сыграть в N разных игр. */
  | 'variety';

export interface MissionDef {
  kind: MissionKind;
  target: number;
}

/** Пул заданий дня. Из него выбираются три штуки по номеру дня — одинаково на всех устройствах. */
export const MISSION_POOL: readonly MissionDef[] = [
  { kind: 'levels', target: 3 },
  { kind: 'levels', target: 5 },
  { kind: 'stars', target: 6 },
  { kind: 'stars', target: 9 },
  { kind: 'score', target: 2000 },
  { kind: 'score', target: 5000 },
  { kind: 'variety', target: 2 },
  { kind: 'variety', target: 3 },
];

/** Сколько заданий показываем за день. */
export const MISSIONS_PER_DAY = 3;

/** Счётчики за сегодня — из них считается прогресс всех заданий дня. */
export interface DayCounters {
  dayId: number;
  levels: number;
  stars: number;
  score: number;
  /** Слаги игр, в которые сегодня играли (для задания «сыграй в N разных игр»). */
  slugs: string[];
}

export interface Mission extends MissionDef {
  progress: number;
  done: boolean;
}

const COUNTERS_KEY = 'wingo:day';

function emptyCounters(dayId: number): DayCounters {
  return { dayId, levels: 0, stars: 0, score: 0, slugs: [] };
}

/** Счётчики сегодняшнего дня. Вчерашние не переносятся — задания дневные. */
export function loadCounters(dayId: number = computeDayId()): DayCounters {
  const raw = readJson<Partial<DayCounters>>(COUNTERS_KEY);
  if (!raw || raw.dayId !== dayId) return emptyCounters(dayId);
  return {
    dayId,
    levels: Number(raw.levels) || 0,
    stars: Number(raw.stars) || 0,
    score: Number(raw.score) || 0,
    slugs: Array.isArray(raw.slugs) ? raw.slugs.filter((s) => typeof s === 'string') : [],
  };
}

export interface RoundOutcome {
  slug: string;
  /** Уровень пройден (для аркад — забег доигран до конца). */
  cleared: boolean;
  stars: number;
  score: number;
}

/** Записывает итог партии в счётчики дня и возвращает обновлённые. */
export function recordRound(outcome: RoundOutcome, dayId: number = computeDayId()): DayCounters {
  const c = loadCounters(dayId);
  if (outcome.cleared) c.levels += 1;
  c.stars += Math.max(0, outcome.stars);
  c.score += Math.max(0, outcome.score);
  if (!c.slugs.includes(outcome.slug)) c.slugs.push(outcome.slug);
  writeJson(COUNTERS_KEY, c);
  return c;
}

/** Три задания на день: выбираются по номеру дня, без повторов вида. */
export function missionsForDay(dayId: number = computeDayId()): MissionDef[] {
  const picked: MissionDef[] = [];
  const usedKinds = new Set<MissionKind>();
  for (let salt = 0; salt < MISSION_POOL.length * 4 && picked.length < MISSIONS_PER_DAY; salt++) {
    const m = MISSION_POOL[hashIndex(dayId * 977 + salt, MISSION_POOL.length)];
    if (usedKinds.has(m.kind)) continue;
    usedKinds.add(m.kind);
    picked.push(m);
  }
  // Пул мельче, чем нужно видов — добираем чем есть, лишь бы заданий было три.
  for (let i = 0; picked.length < MISSIONS_PER_DAY; i++) picked.push(MISSION_POOL[i % MISSION_POOL.length]);
  return picked;
}

export function missionProgress(def: MissionDef, c: DayCounters): number {
  switch (def.kind) {
    case 'levels': return c.levels;
    case 'stars': return c.stars;
    case 'score': return c.score;
    case 'variety': return c.slugs.length;
  }
}

/** Задания дня вместе с текущим прогрессом — то, что рисует хаб и меню игры. */
export function dailyMissions(dayId: number = computeDayId()): Mission[] {
  const c = loadCounters(dayId);
  return missionsForDay(dayId).map((def) => {
    const progress = Math.min(def.target, missionProgress(def, c));
    return { ...def, progress, done: progress >= def.target };
  });
}
