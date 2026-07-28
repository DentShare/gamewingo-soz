export interface ScoreInput {
  /** Сколько блоков установил игрок (без фундамента). */
  blocks: number;
  /** Сколько было идеальных попаданий. */
  perfects: number;
}

/**
 * Практический потолок для серверного антифрода: столько башню не строят
 * (≈1000 блоков подряд), всё выше — повод отклонить результат.
 */
export const MAX_SCORE = 100_000;

/** Очки для сервера: 100 за блок + 50 за идеальное попадание. */
export function computeScore({ blocks, perfects }: ScoreInput): number {
  if (blocks <= 0) return 0;
  const p = Math.min(Math.max(0, perfects), blocks);
  return Math.min(MAX_SCORE, blocks * 100 + p * 50);
}
