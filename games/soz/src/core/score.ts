export interface ScoreInput { solved: boolean; guessesUsed: number; durationMs: number; }

export function computeScore({ solved, guessesUsed, durationMs }: ScoreInput): number {
  if (!solved) return 0;
  const durationSec = Math.floor(durationMs / 1000);
  return Math.max(0, 10000 - guessesUsed * 1000 - Math.min(durationSec, 999));
}
