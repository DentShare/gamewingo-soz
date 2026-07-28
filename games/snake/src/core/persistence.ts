const BEST_KEY = 'snake:best';
const ONBOARDED_KEY = 'snake:onboarded';

/** Лучший счёт на устройстве (для меню). Настоящий рекорд — на сервере. */
export function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Сохраняет счёт, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(score: number): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  if (score <= loadBest()) return false;
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(score)));
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
