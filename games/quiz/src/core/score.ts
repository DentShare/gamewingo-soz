import { LADDER } from './levels';

export interface ScoreInput {
  correct: number;
  mistakes: number;
  /** Номер уровня: поздние партии длиннее и дороже. */
  level?: number;
}

/** Очки за верный ответ. */
export const POINTS_PER_CORRECT = 100;

/**
 * Очки: по сотне за верный ответ, бонус за аккуратность и небольшая надбавка
 * за номер уровня. Начисление баллов лояльности — ТОЛЬКО на сервере.
 */
export function computeScore({ correct, mistakes, level = 1 }: ScoreInput): number {
  if (correct <= 0) return 0;
  const accuracy = mistakes === 0 ? 300 : mistakes <= 2 ? 100 : 0;
  const ladder = 20 * (Math.max(1, level) - 1);
  return correct * POINTS_PER_CORRECT + accuracy + ladder;
}

/** Максимально возможный счёт по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = Math.max(
  ...LADDER.map((lv) => computeScore({ correct: lv.params.questions, mistakes: 0, level: lv.n })),
);
