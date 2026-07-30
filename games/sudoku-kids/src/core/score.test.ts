import { describe, it, expect } from 'vitest';
import { computeScore, baseFor, MAX_SCORE } from './score';
import { LADDER, LADDER_SIZE } from './levels';

describe('score', () => {
  it('мгновенное решение без подсказок даёт максимум = базе уровня', () => {
    expect(computeScore({ level: 1, durationMs: 0, hints: 0 })).toBe(baseFor(1));
    expect(computeScore({ level: 12, durationMs: 900, hints: 0 })).toBe(baseFor(12));
  });

  it('больше времени → меньше очков (−2/сек)', () => {
    const fast = computeScore({ level: 8, durationMs: 60_000, hints: 0 });
    const slow = computeScore({ level: 8, durationMs: 300_000, hints: 0 });
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBe(baseFor(8) - 60 * 2);
  });

  it('больше подсказок → меньше очков (−300/шт)', () => {
    const clean = computeScore({ level: 12, durationMs: 120_000, hints: 0 });
    const hinted = computeScore({ level: 12, durationMs: 120_000, hints: 3 });
    expect(clean - hinted).toBe(900);
  });

  it('минимум 100 даже при огромном времени и всех подсказках', () => {
    expect(computeScore({ level: 1, durationMs: 3_600_000, hints: 3 })).toBe(100);
  });

  it('никогда не превышает базу уровня (серверный антифрод-лимит)', () => {
    for (const { n } of LADDER) {
      expect(computeScore({ level: n, durationMs: 0, hints: 0 })).toBeLessThanOrEqual(baseFor(n));
      expect(baseFor(n)).toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('поздний уровень ценится выше раннего', () => {
    expect(baseFor(LADDER_SIZE)).toBeGreaterThan(baseFor(1));
  });
});
