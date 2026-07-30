import { LADDER } from './levels';

export interface ScoreInput { correct: number; mistakes: number; }

/**
 * Очки: по 100 за каждый верный ответ + бонус за аккуратность.
 * Проиграть нельзя, поэтому ошибки не отнимают очки — только уменьшают бонус.
 */
export function computeScore({ correct, mistakes }: ScoreInput): number {
  return correct * 100 + (mistakes === 0 ? 300 : mistakes <= 2 ? 100 : 0);
}

/** Максимально возможный счёт по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = Math.max(...LADDER.map((lv) => lv.params.questions)) * 100 + 300;
