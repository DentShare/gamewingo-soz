import { loadProgress, recordLevel, recordBests, type ChallengeDef } from '@gamewingo/game-progress';

/** Pilot records only: deliberately no daily missions, stats or reward hooks. */
export function recordPilotRound(input: {
  slug: string; defs: readonly ChallengeDef[]; metrics: Record<string, number>; score: number;
}) {
  const progress = loadProgress(input.slug), closed: ChallengeDef[] = [];
  let previousDone = true;
  for (const def of input.defs) {
    const done = (progress.stars[def.n - 1] ?? 0) > 0;
    if (!done && previousDone && (input.metrics[def.metric] ?? 0) >= def.target) {
      recordLevel(input.slug, def.n, 3, Math.max(0, input.score));
      closed.push(def); previousDone = true;
    } else previousDone = done;
  }
  return { closed, records: recordBests(input.slug, { ...input.metrics, score: input.score }) };
}
