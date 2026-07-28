import type { LevelId } from './deck';

export interface BestResult { score: number; moves: number; durationMs: number; }

function key(level: LevelId): string {
  return `pairs:best:${level}`;
}

export function loadBest(level: LevelId): BestResult | null {
  try {
    const raw = localStorage.getItem(key(level));
    return raw ? (JSON.parse(raw) as BestResult) : null;
  } catch {
    return null;
  }
}

/** Сохраняет результат, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(level: LevelId, result: BestResult): boolean {
  const prev = loadBest(level);
  if (prev && prev.score >= result.score) return false;
  try {
    localStorage.setItem(key(level), JSON.stringify(result));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}
