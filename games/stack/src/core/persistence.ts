const BEST_KEY = 'stack:best';
const ONBOARDED_KEY = 'stack:onboarded';

/** Лучший результат (очки партии). null — рекорда ещё нет. */
export function loadBest(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Сохраняет результат, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(score: number): boolean {
  const prev = loadBest();
  if (prev !== null && prev >= score) return false;
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}

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
