import type { LevelId } from './board';

/** База уровня — она же максимум score (для серверного антифрод-лимита). */
export const BASE: Record<LevelId, number> = { '3x3': 2000, '4x4': 4000 };

export interface ScoreInput { level: LevelId; moves: number; durationMs: number; }

/**
 * Очки за собранное поле: `max(100, base − moves*5 − sec*2)`.
 * Вызывается только по факту победы; максимум = BASE[level].
 */
export function computeScore({ level, moves, durationMs }: ScoreInput): number {
  const base = BASE[level];
  const sec = Math.floor(durationMs / 1000);
  return Math.max(100, base - moves * 5 - sec * 2);
}
