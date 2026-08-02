import { beforeEach, describe, expect, it } from 'vitest';
import {
  awardOnce, bonusBalance, claimCheckin, grantRoundBonuses, TARIFF,
} from './bonus.js';
import { recordLevelResult } from './index.js';
import { dailyMissions, missionsForDay, recordRound } from './missions.js';

const DAY = 20_600;

beforeEach(() => {
  localStorage.clear();
});

describe('кошелёк', () => {
  it('начисляет по ключу ровно один раз', () => {
    expect(awardOnce('level-pairs-1', 20)).toBe(true);
    expect(awardOnce('level-pairs-1', 20)).toBe(false);
    expect(bonusBalance()).toBe(20);
  });

  it('переживает битые данные в хранилище', () => {
    localStorage.setItem('wingo:bonus', '{не json');
    expect(bonusBalance()).toBe(0);
    expect(awardOnce('x', 5)).toBe(true);
    expect(bonusBalance()).toBe(5);
  });
});

describe('чек-ин', () => {
  it('серия растёт день за днём: 5, 10, 15, 20, 25 и потолок', () => {
    const amounts = [0, 1, 2, 3, 4, 5].map((d) => claimCheckin(DAY + d)?.amount);
    expect(amounts).toEqual([5, 10, 15, 20, 25, 25]);
  });

  it('второй заход в тот же день ничего не даёт', () => {
    expect(claimCheckin(DAY)).not.toBeNull();
    expect(claimCheckin(DAY)).toBeNull();
    expect(bonusBalance()).toBe(5);
  });

  it('пропуск дня сбрасывает серию', () => {
    claimCheckin(DAY);
    claimCheckin(DAY + 1);
    const afterGap = claimCheckin(DAY + 3);
    expect(afterGap).toEqual({ amount: 5, run: 1 });
  });
});

describe('бонусы за партию', () => {
  it('первое прохождение уровня платит по тарифу, повтор — нет', () => {
    const missionsBefore = dailyMissions(DAY);
    const record = recordLevelResult({ slug: 'pairs', n: 3, stars: 2, score: 500 });
    const first = grantRoundBonuses({ slug: 'pairs', n: 3, record, missionsBefore, dayId: DAY });
    expect(first.granted.some((g) => g.key === 'level-pairs-3')).toBe(true);
    expect(first.total).toBeGreaterThanOrEqual(TARIFF.level(3));

    // Перепрохождение: unlockedNext=false → уровневого бонуса нет.
    const again = recordLevelResult({ slug: 'pairs', n: 3, stars: 3, score: 900 });
    const second = grantRoundBonuses({
      slug: 'pairs', n: 3, record: again, missionsBefore: dailyMissions(DAY), dayId: DAY,
    });
    expect(second.granted.some((g) => g.key === 'level-pairs-3')).toBe(false);
  });

  it('закрывшееся задание дня даёт бонус один раз', () => {
    // Доводим счётчики почти до цели первого задания, снимаем "до",
    // затем закрываем цель и убеждаемся, что бонус выдан ровно один раз.
    const defs = missionsForDay(DAY);
    const target = defs[0];
    for (let i = 0; i < target.target - 1; i++) {
      recordRound({ slug: `g${i}`, cleared: true, stars: 1, score: 500 }, DAY);
    }
    const before = dailyMissions(DAY);
    recordRound({ slug: 'final', cleared: true, stars: 3, score: 5000 }, DAY);

    const res = grantRoundBonuses({ slug: 'final', n: 1, record: null, missionsBefore: before, dayId: DAY });
    const missionKeys = res.granted.filter((g) => g.key.startsWith(`mission-${DAY}`));
    expect(missionKeys.length).toBeGreaterThanOrEqual(1);

    // Повторный вызов с теми же "до" ничего не доначисляет — ключи уже выданы.
    const repeat = grantRoundBonuses({ slug: 'final', n: 1, record: null, missionsBefore: before, dayId: DAY });
    expect(repeat.total).toBe(0);
  });

  it('без новых событий партия не приносит ничего', () => {
    const before = dailyMissions(DAY);
    const res = grantRoundBonuses({ slug: 'snake', n: 2, record: null, missionsBefore: before, dayId: DAY });
    expect(res.total).toBe(0);
    expect(res.balance).toBe(0);
  });
});
