import { LADDER } from './levels';

export interface ScoreInput {
  /** Сколько кусочков в картинке. */
  pieces: number;
  /** Сколько раз кусочек положили не туда. */
  wrongDrops: number;
}

/** Очки за один правильно поставленный кусочек. */
export const POINTS_PER_PIECE = 50;

/**
 * Очки: за каждый кусочек плюс бонус за аккуратность. Проиграть нельзя,
 * поэтому промахи не отнимают очки — только уменьшают бонус.
 */
export function computeScore({ pieces, wrongDrops }: ScoreInput): number {
  if (pieces <= 0) return 0;
  const accuracy = wrongDrops === 0 ? 300 : wrongDrops <= 3 ? 150 : 0;
  return pieces * POINTS_PER_PIECE + accuracy;
}

/** Максимально возможный счёт по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = Math.max(
  ...LADDER.map((lv) => computeScore({ pieces: lv.params.cols * lv.params.rows, wrongDrops: 0 })),
);
