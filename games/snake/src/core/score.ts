/** Очки за одну съеденную еду. */
export const POINTS_PER_FOOD = 100;

/**
 * Потолок счёта для серверного антифрода: заполнить поле 15×20 физически
 * невозможно быстрее лимита сессии, поэтому всё выше — заведомо подделка.
 * Реальный максимум партии = (cols*rows − стартовая длина) * 100 = 29 500.
 */
export const MAX_SCORE = 100_000;

export interface ScoreInput {
  /** Сколько раз змейка съела еду за партию. */
  eaten: number;
}

/** Счёт партии: 100 за каждую съеденную еду. Начисление баллов — только на сервере. */
export function computeScore({ eaten }: ScoreInput): number {
  if (eaten <= 0) return 0;
  return clampScore(eaten * POINTS_PER_FOOD);
}

/** Страховка от «залётного» счёта перед отправкой на сервер (сервер валидирует повторно). */
export function clampScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(MAX_SCORE, Math.round(score));
}
