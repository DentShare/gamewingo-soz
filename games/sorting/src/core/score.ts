export interface ScoreInput { placed: number; mistakes: number; }

/**
 * Очки: 100 за каждую верно разложенную фигурку + бонус за аккуратность.
 * Проиграть нельзя, поэтому ошибки не отнимают очки — только уменьшают бонус.
 * Максимум (для серверного антифрода): 12*100 + 300 = 1500.
 */
export function computeScore({ placed, mistakes }: ScoreInput): number {
  const clean = Math.max(0, Math.min(placed, 12));
  const bonus = mistakes === 0 ? 300 : mistakes <= 3 ? 100 : 0;
  return clean * 100 + bonus;
}

/** Максимально возможный счёт партии — верхняя граница для серверной проверки. */
export const MAX_SCORE = 12 * 100 + 300;

/** Звёзды: 3 — без ошибок, 2 — до трёх ошибок, 1 — просто дошёл до конца. */
export function stars(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes <= 3) return 2;
  return 1;
}
