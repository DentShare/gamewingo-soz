import type { Row } from '../core/gameState';
import type { UnitStatus } from '../core/evaluate';

const EMOJI: Record<UnitStatus, string> = { correct: '🟩', present: '🟨', absent: '⬛' };

export interface ShareMeta {
  solved: boolean;
  guessesUsed: number;
  dayId: number;
  title: string;
}

/** Строит текст для шэринга: заголовок (БЕЗ слова «Wordle») + грид из 🟩🟨⬛ по рядам. */
export function buildShareText(rows: Row[], meta: ShareMeta): string {
  const head = `${meta.title} #${meta.dayId} ${meta.solved ? meta.guessesUsed : 'X'}/6`;
  const grid = rows.map((r) => r.statuses.map((s) => EMOJI[s]).join('')).join('\n');
  return `${head}\n${grid}`;
}
