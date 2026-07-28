export interface ScoreInput { correct: number; mistakes: number; }

/**
 * Очки: по 100 за каждый верный ответ + бонус за аккуратность.
 * Максимум (для серверного антифрода): 10*100 + 300 = 1300.
 */
export function computeScore({ correct, mistakes }: ScoreInput): number {
  return correct * 100 + (mistakes === 0 ? 300 : mistakes <= 2 ? 100 : 0);
}

/** Звёзды: 3 — без ошибок, 2 — до двух ошибок, 1 — просто прошёл (проиграть нельзя). */
export function stars(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}
