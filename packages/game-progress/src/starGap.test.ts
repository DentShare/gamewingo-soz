import { describe, expect, it } from 'vitest';
import { starGap } from './ladder.js';
describe('starGap', () => {
  it('explains extra moves without inventing a time limit', () => {
    expect(starGap({ gold: 8, silver: 12 }, 9)).toEqual({ threshold: 8, missing: 1 });
    expect(starGap({ gold: 8, silver: 12 }, 8)).toBeNull();
  });
  it('supports higher-is-better and fractional time', () => {
    expect(starGap({ gold: 100, silver: 50, higherIsBetter: true }, 80)).toEqual({ threshold: 100, missing: 20 });
    expect(starGap({ gold: 10, silver: 20 }, 10.2)?.missing).toBe(1);
  });
  it('does not display misleading gaps for invalid results', () => {
    expect(starGap({ gold: 8, silver: 12 }, NaN)).toBeNull();
  });
});
