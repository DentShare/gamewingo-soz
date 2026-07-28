import type { LevelId } from './sudoku';

export interface ScoreInput { level: LevelId; durationMs: number; hints: number; }

/** База очков за уровень — она же максимум (для серверного антифрода). */
export const BASE_SCORE: Record<LevelId, number> = {
  easy4: 1500,
  easy6: 3000,
  hard6: 4500,
};

/**
 * Очки: база уровня − 2 за секунду − 300 за подсказку, но не меньше 100.
 * Максимум = база уровня (сек и подсказки только штрафуют).
 */
export function computeScore({ level, durationMs, hints }: ScoreInput): number {
  const sec = Math.floor(durationMs / 1000);
  const raw = BASE_SCORE[level] - sec * 2 - hints * 300;
  return Math.max(100, Math.min(BASE_SCORE[level], raw));
}
