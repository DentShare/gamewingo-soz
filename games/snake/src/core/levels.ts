import { buildArcadeLadder, type ArcadeLevel } from '@gamewingo/game-progress';
import { POINTS_PER_FOOD } from './score';

/**
 * Лестница «Змейки»: пятнадцать целей от трёх съеденных яблок до сорока пяти.
 *
 * `startPhase` — насколько длиннее и быстрее змейка выходит на старте. Без него
 * каждый забег начинался бы с одного и того же медленного вступления, которое
 * игрок уже проходил; к концу лестницы вступления нет вовсе.
 */
export const LADDER: readonly ArcadeLevel[] = buildArcadeLadder(
  15,
  3 * POINTS_PER_FOOD,
  45 * POINTS_PER_FOOD,
  8,
);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): ArcadeLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
