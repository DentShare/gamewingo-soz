export interface BestResult { score: number; correct: number; mistakes: number; }

const BEST_KEY = 'jigsaw:best';

export function loadBest(): BestResult | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as BestResult) : null;
  } catch {
    return null;
  }
}

/** Сохраняет результат, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(result: BestResult): boolean {
  const prev = loadBest();
  if (prev && prev.score >= result.score) return false;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(result));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}

const ONBOARDED_KEY = 'jigsaw:onboarded';

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
