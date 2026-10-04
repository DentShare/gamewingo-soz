export function confirmedReward(result: { accepted: boolean; pointsAwarded?: number } | null): number | null {
  return result?.accepted && typeof result.pointsAwarded === 'number' && Number.isFinite(result.pointsAwarded) && result.pointsAwarded >= 0 ? result.pointsAwarded : null;
}
