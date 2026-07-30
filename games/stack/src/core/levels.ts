import { buildArcadeLadder, type ArcadeLevel } from '@gamewingo/game-progress';

/**
 * Лестница «Башни»: пятнадцать целей от пяти блоков до шестидесяти.
 *
 * `startPhase` — сколько блоков считается уже поставленными: поздний уровень
 * начинается на той скорости, до которой раньше приходилось доигрывать минуту.
 */
export const LADDER: readonly ArcadeLevel[] = buildArcadeLadder(15, 500, 6000, 30);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): ArcadeLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
