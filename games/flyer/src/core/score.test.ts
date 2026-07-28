import { describe, it, expect } from 'vitest';
import { computeScore, MAX_SCORE, MAX_TIME_BONUS, POINTS_PER_GAP } from './score';

describe('computeScore (flyer)', () => {
  it('без пройденных проёмов очков нет', () => {
    expect(computeScore({ passed: 0, durationMs: 30000 })).toBe(0);
  });

  it('100 очков за проём + бонус за время', () => {
    expect(computeScore({ passed: 5, durationMs: 0 })).toBe(5 * POINTS_PER_GAP);
    expect(computeScore({ passed: 5, durationMs: 10_000 })).toBe(5 * POINTS_PER_GAP + 20);
  });

  it('бонус за время ограничен', () => {
    expect(computeScore({ passed: 1, durationMs: 10 * 60 * 1000 }))
      .toBe(POINTS_PER_GAP + MAX_TIME_BONUS);
  });

  it('результат не превышает антифрод-потолок', () => {
    expect(computeScore({ passed: 10_000, durationMs: 60_000 })).toBe(MAX_SCORE);
  });

  it('монотонен по числу проёмов', () => {
    const a = computeScore({ passed: 3, durationMs: 12_000 });
    const b = computeScore({ passed: 4, durationMs: 12_000 });
    expect(b).toBeGreaterThan(a);
  });
});
