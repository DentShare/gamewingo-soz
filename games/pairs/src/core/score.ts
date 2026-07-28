export interface ScoreInput { pairs: number; moves: number; durationMs: number; }

/**
 * Очки: база за пары × точность (пары/ходы) + бонус за скорость.
 * Максимум (для серверного антифрода): pairs*400 + 600.
 */
export function computeScore({ pairs, moves, durationMs }: ScoreInput): number {
  if (pairs <= 0 || moves < pairs) return 0;
  const accuracy = pairs / moves; // 1.0 при идеальной памяти
  const base = pairs * 400 * (0.4 + 0.6 * accuracy);
  const sec = Math.floor(durationMs / 1000);
  const timeBonus = Math.max(0, 600 - sec * 4);
  return Math.round(base) + timeBonus;
}

/** Звёзды за точность: 3 — почти без промахов, 2 — умеренно, 1 — прошёл. */
export function stars(pairs: number, moves: number): 1 | 2 | 3 {
  if (moves <= Math.ceil(pairs * 1.4)) return 3;
  if (moves <= pairs * 2.2) return 2;
  return 1;
}
