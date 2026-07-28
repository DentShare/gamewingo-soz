import { describe, it, expect } from 'vitest';
import { computeScore, BASE_SCORE } from './score';

describe('score', () => {
  it('мгновенное решение без подсказок даёт максимум = базе уровня', () => {
    expect(computeScore({ level: 'easy4', durationMs: 0, hints: 0 })).toBe(BASE_SCORE.easy4);
    expect(computeScore({ level: 'hard6', durationMs: 900, hints: 0 })).toBe(BASE_SCORE.hard6);
  });

  it('больше времени → меньше очков (−2/сек)', () => {
    const fast = computeScore({ level: 'easy6', durationMs: 60_000, hints: 0 });
    const slow = computeScore({ level: 'easy6', durationMs: 300_000, hints: 0 });
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBe(BASE_SCORE.easy6 - 60 * 2);
  });

  it('больше подсказок → меньше очков (−300/шт)', () => {
    const clean = computeScore({ level: 'hard6', durationMs: 120_000, hints: 0 });
    const hinted = computeScore({ level: 'hard6', durationMs: 120_000, hints: 3 });
    expect(clean - hinted).toBe(900);
  });

  it('минимум 100 даже при огромном времени и всех подсказках', () => {
    expect(computeScore({ level: 'easy4', durationMs: 3_600_000, hints: 3 })).toBe(100);
  });

  it('никогда не превышает базу уровня (серверный антифрод-лимит)', () => {
    for (const level of ['easy4', 'easy6', 'hard6'] as const) {
      expect(computeScore({ level, durationMs: 0, hints: 0 })).toBeLessThanOrEqual(BASE_SCORE[level]);
    }
  });
});
