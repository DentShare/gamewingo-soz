import { describe, it, expect } from 'vitest';
import { confirmedReward } from './rewardView';
describe('confirmed server rewards', () => {
  it('accepts only an explicit non-negative server amount', () => {
    expect(confirmedReward({ accepted: true, pointsAwarded: 24 })).toBe(24);
    expect(confirmedReward({ accepted: true, pointsAwarded: 0 })).toBe(0);
    for (const result of [null, { accepted: false, pointsAwarded: 24 }, { accepted: true }, { accepted: true, pointsAwarded: -1 }, { accepted: true, pointsAwarded: NaN }]) expect(confirmedReward(result)).toBeNull();
  });
});
