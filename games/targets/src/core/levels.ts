import { buildArcadeLadder, type ArcadeLevel } from '@gamewingo/game-progress';

/**
 * Лестница «Меткого глаза»: пятнадцать целей от шестисот очков до девяти тысяч.
 *
 * `startPhase` — насколько мельче и короткоживущее цели на старте: партия
 * по-прежнему длится минуту, но поздние уровни начинаются в бодром темпе.
 */
export const LADDER: readonly ArcadeLevel[] = buildArcadeLadder(15, 600, 9000, 30);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): ArcadeLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
