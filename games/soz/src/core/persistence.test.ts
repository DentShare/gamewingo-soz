import { describe, it, expect, beforeEach } from 'vitest';
import { saveDaily, loadDaily, dailyKey } from './persistence';

beforeEach(() => localStorage.clear());

describe('persistence daily', () => {
  it('save/load round-trip по (locale, dayId)', () => {
    const state = { rows: [], status: 'in_progress' as const, rewardClaimed: false };
    saveDaily('ru', 20000, state);
    expect(loadDaily('ru', 20000)).toEqual(state);
  });
  it('ключи изолированы по локали и дню', () => {
    expect(dailyKey('ru', 1)).not.toBe(dailyKey('uz', 1));
    expect(dailyKey('ru', 1)).not.toBe(dailyKey('ru', 2));
  });
  it('нет записи → null', () => {
    expect(loadDaily('ru', 999)).toBeNull();
  });
});
