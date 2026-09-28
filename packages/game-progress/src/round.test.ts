import { beforeEach, describe, expect, it } from 'vitest';
import { settleLadderRound } from './index.js';
import { TARIFF, bonusBalance } from './bonus.js';
import { isDailyLevelDone } from './chapters.js';
import { loadProgress } from './progress.js';

const DAY = 20_600;
const base = { slug: 'pairs', total: 15, stars: 3 as const, score: 100, dayId: DAY, missionsBefore: [] };

beforeEach(() => localStorage.clear());

describe('итог уровня лестницы', () => {
  it('первое прохождение: запись в лестницу и тариф уровня', () => {
    const r = settleLadderRound({ ...base, n: 1, mode: 'level', cleared: true });
    expect(r.record?.unlockedNext).toBe(true);
    expect(r.bonus.granted.map((g) => g.key)).toContain('level-pairs-1');
  });

  it('последний уровень главы приносит и бонус главы — в той же разбивке', () => {
    for (let n = 1; n <= 4; n++) settleLadderRound({ ...base, n, mode: 'level', cleared: true });
    const r = settleLadderRound({ ...base, n: 5, mode: 'level', cleared: true });
    expect(r.bonus.granted.map((g) => g.key)).toEqual(expect.arrayContaining(['level-pairs-5', 'chapter-pairs-1']));
    expect(r.bonus.total).toBe(TARIFF.level(5) + TARIFF.chapterClear);
    expect(r.bonus.balance).toBe(bonusBalance());
  });

  it('уровень дня: не пишется в лестницу, платит тариф дня и отмечается пройденным', () => {
    const r = settleLadderRound({ ...base, n: 9, mode: 'dailyLevel', cleared: true });
    expect(r.record).toBeNull();
    expect(loadProgress('pairs').stars).toEqual([]);
    expect(r.bonus.granted).toEqual([{ key: `lod-pairs-${DAY}`, amount: TARIFF.levelOfDay }]);
    expect(isDailyLevelDone('pairs', DAY)).toBe(true);
  });

  it('проигранный уровень дня не платит и не отмечается', () => {
    const r = settleLadderRound({ ...base, n: 9, mode: 'dailyLevel', cleared: false });
    expect(r.bonus.total).toBe(0);
    expect(isDailyLevelDone('pairs', DAY)).toBe(false);
  });

  it('провал уровня: ни записи, ни бонусов', () => {
    const r = settleLadderRound({ ...base, n: 1, mode: 'level', cleared: false });
    expect(r.record).toBeNull();
    expect(r.bonus.total).toBe(0);
  });
});
