import { describe, it, expect } from 'vitest';
import { computeScore } from './score';

describe('computeScore', () => {
  it('не решено → 0', () => {
    expect(computeScore({ solved: false, guessesUsed: 3, durationMs: 1000 })).toBe(0);
  });
  it('max = 9000 при 1 попытке ~0 сек', () => {
    expect(computeScore({ solved: true, guessesUsed: 1, durationMs: 0 })).toBe(9000);
  });
  it('штраф за попытки и время', () => {
    expect(computeScore({ solved: true, guessesUsed: 2, durationMs: 10_000 })).toBe(10000 - 2000 - 10);
  });
  it('кламп в ≥0', () => {
    expect(computeScore({ solved: true, guessesUsed: 6, durationMs: 9_000_000 })).toBeGreaterThanOrEqual(0);
  });
});
