import { buildArcadeLadder, type ArcadeLevel } from '@gamewingo/game-progress';

/**
 * Лестница «Полёта»: пятнадцать целей от трёх проёмов до сорока пяти.
 *
 * `startPhase` — сколько проёмов засчитано до старта: стены сразу идут быстрее,
 * а проём у́же, чем в начале обычного забега.
 */
export const LADDER: readonly ArcadeLevel[] = buildArcadeLadder(15, 300, 4500, 24);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): ArcadeLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
