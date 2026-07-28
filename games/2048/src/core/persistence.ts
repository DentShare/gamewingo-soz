const KEY = '2048:best';

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Сохраняет счёт, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(score: number): boolean {
  const prev = loadBest();
  if (score <= prev) return false;
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}
