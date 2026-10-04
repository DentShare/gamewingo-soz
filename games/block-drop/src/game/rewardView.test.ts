import { describe, expect, it } from 'vitest';
import { confirmedReward } from './rewardView';
describe('confirmed rewards', () => {
  it('never turns a rejected or malformed result into a credit', () => {
    for (const value of [null, { accepted: false, pointsAwarded: 20 }, { accepted: true }, { accepted: true, pointsAwarded: NaN }, { accepted: true, pointsAwarded: -1 }]) expect(confirmedReward(value)).toBeNull();
    expect(confirmedReward({ accepted: true, pointsAwarded: 0 })).toBe(0);
    expect(confirmedReward({ accepted: true, pointsAwarded: 20 })).toBe(20);
  });
});
