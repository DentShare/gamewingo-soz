import type { Mode } from './sorting';

export interface BestResult { score: number; mistakes: number; durationMs: number; }

function key(mode: Mode): string {
  return `sorting:best:${mode}`;
}

export function loadBest(mode: Mode): BestResult | null {
  try {
    const raw = localStorage.getItem(key(mode));
    return raw ? (JSON.parse(raw) as BestResult) : null;
  } catch {
    return null;
  }
}

/** Сохраняет результат, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(mode: Mode, result: BestResult): boolean {
  const prev = loadBest(mode);
  if (prev && prev.score >= result.score) return false;
  try {
    localStorage.setItem(key(mode), JSON.stringify(result));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}

const ONBOARDED_KEY = 'sorting:onboarded';

/** Прошёл ли игрок обучение (показываем один раз — при первой партии). */
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
    /* quota / приватный режим */
  }
}
