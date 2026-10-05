import { beforeEach, describe, expect, it } from 'vitest';
import {
  awardOnce, bonusBalance, checkinPreview, claimCheckin, dailyOutlook, grantChapterClears,
  grantLevelOfDay, grantRecordWeek, grantRoundBonuses, TARIFF,
} from './bonus.js';
import { computeWeekId } from './day.js';
import { chapterLevels } from './ladder.js';
import { recordLevelResult } from './index.js';
import { dailyMissions, missionsForDay, recordRound } from './missions.js';

const DAY = 20_600;

beforeEach(() => {
  localStorage.clear();
});

describe('кошелёк', () => {
  it('монитор получает только новые выдачи и чек-ин, без повторов', () => {
    const grants: Array<{ key: string; amount: number }> = [];
    const listener = (event: Event) => grants.push((event as CustomEvent).detail);
    window.addEventListener('wingo:coin-awarded', listener);
    try {
      awardOnce('level-pairs-1', 20);
      awardOnce('level-pairs-1', 20);
      claimCheckin(DAY);
      claimCheckin(DAY);
      expect(grants).toEqual([
        { key: 'level-pairs-1', amount: 20 }, { key: `checkin-${DAY}`, amount: 5 },
      ]);
      expect(bonusBalance()).toBe(25);
    } finally {
      window.removeEventListener('wingo:coin-awarded', listener);
    }
  });
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

describe('неделя', () => {
  it('начинается с понедельника: 1970-01-01 — четверг, 1970-01-05 — понедельник', () => {
    expect(computeWeekId(0)).toBe(computeWeekId(3)); // чт … вс — одна неделя
    expect(computeWeekId(4)).toBe(computeWeekId(3) + 1); // пн — новая
    expect(computeWeekId(10)).toBe(computeWeekId(4)); // вс той же недели
  });
});

describe('превью чек-ина', () => {
  it('до захода: сегодня +5, завтра +10, после пропуска снова +5', () => {
    expect(checkinPreview(DAY)).toEqual({ claimedToday: false, today: 5, tomorrow: 10, afterGap: 5, run: 1 });
  });

  it('после захода показывает полученное сегодня и завтрашнее продолжение', () => {
    claimCheckin(DAY);
    claimCheckin(DAY + 1);
    expect(checkinPreview(DAY + 1)).toMatchObject({ claimedToday: true, today: 10, tomorrow: 15, run: 2 });
  });

  it('вчерашний заход продолжает серию, позавчерашний — нет', () => {
    claimCheckin(DAY);
    expect(checkinPreview(DAY + 1).today).toBe(10);
    expect(checkinPreview(DAY + 2).today).toBe(5);
  });

  it('потолок серии соблюдается и в превью', () => {
    for (let d = 0; d < 8; d++) claimCheckin(DAY + d);
    expect(checkinPreview(DAY + 8)).toMatchObject({ today: TARIFF.checkinCap, tomorrow: TARIFF.checkinCap });
  });
});

describe('уровень дня', () => {
  it('платит один раз на игру в день', () => {
    expect(grantLevelOfDay('pairs', DAY)).toEqual({ key: `lod-pairs-${DAY}`, amount: TARIFF.levelOfDay });
    expect(grantLevelOfDay('pairs', DAY)).toBeNull();
    expect(grantLevelOfDay('pairs', DAY + 1)).not.toBeNull();
  });

  it('за день оплачиваются только первые levelOfDayPerDay игр', () => {
    const slugs = ['pairs', 'fifteen', 'sums', 'quiz', 'jigsaw'];
    const paid = slugs.map((s) => grantLevelOfDay(s, DAY)).filter(Boolean);
    expect(paid).toHaveLength(TARIFF.levelOfDayPerDay);
    expect(bonusBalance()).toBe(TARIFF.levelOfDayPerDay * TARIFF.levelOfDay);
    // Назавтра лимит новый.
    expect(grantLevelOfDay('quiz', DAY + 1)).not.toBeNull();
  });
});

describe('неделя рекордов', () => {
  it('раз в календарную неделю, со следующего понедельника — снова', () => {
    const monday = 4 + 7 * 2900; // понедельник далеко от эпохи
    expect(grantRecordWeek(monday)).not.toBeNull();
    expect(grantRecordWeek(monday + 3)).toBeNull();
    expect(grantRecordWeek(monday + 6)).toBeNull(); // воскресенье той же недели
    expect(grantRecordWeek(monday + 7)).not.toBeNull();
    expect(bonusBalance()).toBe(2 * TARIFF.recordWeek);
  });
});

describe('главы', () => {
  it('пятнадцать уровней — три главы по пять', () => {
    expect(chapterLevels(15)).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
    expect(chapterLevels(7)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });

  it('платит только за главы, пройденные целиком, и только один раз', () => {
    const chapters = chapterLevels(15).map((levels) => ({ levels }));
    const cleared = new Set([1, 2, 3, 4, 5, 6, 7]);
    const first = grantChapterClears('pairs', chapters, (n) => cleared.has(n));
    expect(first).toEqual([{ key: 'chapter-pairs-1', amount: TARIFF.chapterClear }]);
    expect(grantChapterClears('pairs', chapters, (n) => cleared.has(n))).toEqual([]);
    for (let n = 8; n <= 10; n++) cleared.add(n);
    expect(grantChapterClears('pairs', chapters, (n) => cleared.has(n)).map((g) => g.key)).toEqual(['chapter-pairs-2']);
  });
});

describe('потолок дня', () => {
  const fullCeiling = (checkin: number) =>
    checkin + 3 * TARIFF.mission + TARIFF.daily + TARIFF.levelOfDayPerDay * TARIFF.levelOfDay + TARIFF.recordWeek;

  it('в начале дня ничего не получено, потолок — сумма ежедневных источников', () => {
    expect(dailyOutlook(DAY)).toEqual({ ceiling: fullCeiling(5), earned: 0, remaining: fullCeiling(5) });
  });

  it('каждое ежедневное начисление уменьшает остаток ровно на свою сумму', () => {
    claimCheckin(DAY);
    grantLevelOfDay('pairs', DAY);
    awardOnce(`soz-daily-${DAY}`, TARIFF.daily);
    awardOnce(`mission-${DAY}-0`, TARIFF.mission);
    const o = dailyOutlook(DAY);
    expect(o.earned).toBe(5 + TARIFF.levelOfDay + TARIFF.daily + TARIFF.mission);
    expect(o.remaining).toBe(o.ceiling - o.earned);
  });

  it('разовые награды (уровни, главы) в потолок не входят', () => {
    awardOnce('level-pairs-1', TARIFF.level(1));
    grantChapterClears('pairs', [{ levels: [1] }], () => true);
    expect(dailyOutlook(DAY).earned).toBe(0);
  });

  it('выплаченная на неделе неделя рекордов убирается из потолка', () => {
    const before = dailyOutlook(DAY).ceiling;
    grantRecordWeek(DAY);
    expect(dailyOutlook(DAY).ceiling).toBe(before - TARIFF.recordWeek);
  });

  it('вчерашние начисления сегодня не считаются', () => {
    claimCheckin(DAY);
    grantLevelOfDay('pairs', DAY);
    expect(dailyOutlook(DAY + 1).earned).toBe(0);
  });
});
