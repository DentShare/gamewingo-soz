import type { LevelId } from './board';

export interface BestResult { score: number; moves: number; durationMs: number; }

function key(level: LevelId): string {
  return `fifteen:best:${level}`;
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

const ONBOARDED_KEY = 'fifteen:onboarded';

/** Прошёл ли игрок обучение (показываем один раз, при первой партии). */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}
