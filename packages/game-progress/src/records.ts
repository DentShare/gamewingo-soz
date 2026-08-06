import { readJson, writeJson } from './storage.js';

/**
 * Личные рекорды игры по именованным метрикам: лучший счёт, длина змейки,
 * дистанция полёта, номинал плитки. На них живут вехи и строка «Рекорд»
 * в меню аркад — у которых нет лестницы уровней с её best-массивом.
 */

function key(slug: string): string {
  return `wingo:best:${slug}`;
}

export type Bests = Record<string, number>;

export function loadBests(slug: string): Bests {
  const raw = readJson<Record<string, unknown>>(key(slug));
  const bests: Bests = {};
  if (raw && typeof raw === 'object') {
    for (const [metric, value] of Object.entries(raw)) {
      if (typeof value === 'number' && Number.isFinite(value)) bests[metric] = value;
    }
  }
  return bests;
}

export interface BestsResult {
  bests: Bests;
  /** Метрики, по которым забег поставил новый рекорд. */
  improved: string[];
}

/** Записывает метрики забега; рекорды только растут. */
export function recordBests(slug: string, values: Bests): BestsResult {
  const bests = loadBests(slug);
  const improved: string[] = [];
  for (const [metric, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) continue;
    if (value > (bests[metric] ?? 0)) {
      bests[metric] = value;
      improved.push(metric);
    }
  }
  if (improved.length) writeJson(key(slug), bests);
  return { bests, improved };
}
