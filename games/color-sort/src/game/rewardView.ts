/** Неизвестная или отклонённая награда — не ноль и не клиентский бонус. */
export function confirmedReward(result: { accepted: boolean; pointsAwarded?: number } | null): number | null {
  const amount = result?.pointsAwarded;
  return result?.accepted && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
}
