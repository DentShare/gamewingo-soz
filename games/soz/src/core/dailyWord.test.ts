import { describe, it, expect } from 'vitest';
import { computeDayId, dailyIndex, pickDailyWord } from './dailyWord';

describe('computeDayId', () => {
  it('целые дни по Asia/Tashkent (UTC+5)', () => {
    const ms = Date.UTC(2026, 6, 24, 0, 0, 0);
    expect(computeDayId(ms)).toBe(Math.floor((ms + 5 * 3600 * 1000) / 86_400_000));
  });
});

describe('dailyIndex', () => {
  it('детерминирован: один dayId → один индекс', () => {
    expect(dailyIndex(20000, 150)).toBe(dailyIndex(20000, 150));
  });
  it('в диапазоне [0, len)', () => {
    for (let d = 0; d < 500; d++) {
      const idx = dailyIndex(d, 37);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(37);
    }
  });
});

describe('pickDailyWord', () => {
  it('возвращает слово из списка по dayId', () => {
    const answers = ['aaaaa', 'bbbbb', 'ccccc'];
    const w = pickDailyWord(answers, 12345);
    expect(answers).toContain(w);
    expect(pickDailyWord(answers, 12345)).toBe(w);
  });
});
