import { LADDER } from './levels';

export interface ScoreInput { placed: number; mistakes: number; }

/**
 * Очки: 100 за каждую верно разложенную фигурку + бонус за аккуратность.
 * Проиграть нельзя, поэтому ошибки не отнимают очки — только уменьшают бонус.
 * Потолок по всей лестнице — `MAX_SCORE` (для серверного антифрода).
 */
export function computeScore({ placed, mistakes }: ScoreInput): number {
  const clean = Math.max(0, Math.min(placed, MAX_ITEMS));
  const bonus = mistakes === 0 ? 300 : mistakes <= 3 ? 100 : 0;
  return clean * 100 + bonus;
}

/** Сколько фигурок на самом длинном уровне лестницы. */
const MAX_ITEMS = Math.max(...LADDER.map((lv) => lv.params.total));

/** Максимально возможный счёт по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = MAX_ITEMS * 100 + 300;
