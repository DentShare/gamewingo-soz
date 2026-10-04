import { describe, expect, it } from 'vitest';
import { starGap } from './ladder.js';
describe('starGap', () => {
  it('explains extra moves without inventing a time limit', () => {
    expect(starGap({ goals: { gold: 8, silver: 12 } }, { metric: 'moves', value: 9 })).toEqual({ metric: 'moves', missing: 1 });
    expect(starGap({ goals: { gold: 8, silver: 12 } }, { metric: 'moves', value: 8 })).toBeNull();
  });
  it('supports higher-is-better and fractional time', () => {
    expect(starGap({ goals: { gold: 100, silver: 50, higherIsBetter: true } }, { metric: 'score', value: 80 })).toEqual({ metric: 'score', missing: 20 });
    expect(starGap({ goals: { gold: 10, silver: 20 } }, { metric: 'time', value: 10.2 })?.missing).toBe(1);
  });
  it('does not display misleading gaps for invalid results', () => {
    expect(starGap({ goals: { gold: 8, silver: 12 } }, { metric: 'moves', value: NaN })).toBeNull();
  });
});
