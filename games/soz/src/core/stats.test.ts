import { describe, it, expect, beforeEach } from 'vitest';
import { emptyStats, recordDaily, streakOn, winPercent, sanitizeStats, type DailyOutcome } from './stats';
import { loadStats, recordDailyStats, statsKey } from './persistence';

const win = (dayId: number, guessesUsed: number): DailyOutcome => ({ dayId, solved: true, guessesUsed });
const loss = (dayId: number): DailyOutcome => ({ dayId, solved: false, guessesUsed: 6 });
const play = (...outcomes: DailyOutcome[]) => outcomes.reduce(recordDaily, emptyStats());

describe('статистика слова дня', () => {
  it('первая игра', () => {
    const s = play(win(100, 4));
    expect(s).toMatchObject({ played: 1, won: 1, streak: 1, bestStreak: 1 });
    expect(s.distribution).toEqual([0, 0, 0, 1, 0, 0]);
    expect(winPercent(s)).toBe(100);
  });

  it('повторная запись того же дня не удваивает', () => {
    const once = play(win(100, 4));
    const twice = recordDaily(once, win(100, 4));
    expect(twice).toBe(once);
    // и проигрыш того же дня (восстановленная партия) не портит победу
    expect(recordDaily(once, loss(100))).toBe(once);
    // запись более раннего дня тоже игнорируется (часы устройства откатили)
    expect(recordDaily(once, win(99, 2))).toBe(once);
  });

  it('серия растёт по дням подряд и рвётся пропущенным днём', () => {
    const s = play(win(1, 3), win(2, 4), win(3, 2));
    expect(s.streak).toBe(3);
    const afterGap = recordDaily(s, win(5, 4));
    expect(afterGap.streak).toBe(1);
    expect(afterGap.bestStreak).toBe(3);
  });

  it('проигрыш обнуляет серию, лучшая остаётся', () => {
    const s = play(win(1, 3), win(2, 4), loss(3));
    expect(s).toMatchObject({ played: 3, won: 2, streak: 0, bestStreak: 2 });
    expect(winPercent(s)).toBe(67);
    expect(recordDaily(s, win(4, 1)).streak).toBe(1);
  });

  it('серия 5 и распределение', () => {
    const s = play(win(10, 4), win(11, 3), win(12, 4), win(13, 5), win(14, 4));
    expect(s.streak).toBe(5);
    expect(s.distribution).toEqual([0, 0, 1, 3, 1, 0]);
  });

  it('серия на сегодня: вчерашняя победа держит серию, позавчерашняя — уже нет', () => {
    const s = play(win(1, 3), win(2, 4));
    expect(streakOn(s, 2)).toBe(2);
    expect(streakOn(s, 3)).toBe(2);
    expect(streakOn(s, 4)).toBe(0);
    expect(streakOn(emptyStats(), 4)).toBe(0);
  });

  it('проигрыш с 6 попыток в распределение не идёт; попытки зажимаются в 1..6', () => {
    expect(play(loss(1)).distribution).toEqual([0, 0, 0, 0, 0, 0]);
    expect(play(win(1, 9)).distribution).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('битое хранилище читается как пустая статистика', () => {
    expect(sanitizeStats('мусор')).toEqual(emptyStats());
    expect(sanitizeStats({ played: 3, distribution: [1, 'x'] })).toMatchObject({
      played: 3, distribution: [1, 0, 0, 0, 0, 0], lastDayId: null,
    });
  });
});

describe('хранение статистики', () => {
  beforeEach(() => localStorage.clear());

  it('ключ — в persistence, отдельный на язык', () => {
    expect(statsKey('ru')).not.toBe(statsKey('uz'));
    recordDailyStats('ru', win(7, 2));
    expect(loadStats('ru').played).toBe(1);
    expect(loadStats('uz').played).toBe(0);
  });

  it('запись идемпотентна между запусками', () => {
    recordDailyStats('ru', win(7, 2));
    recordDailyStats('ru', win(7, 2));
    expect(loadStats('ru')).toMatchObject({ played: 1, won: 1, distribution: [0, 1, 0, 0, 0, 0] });
  });
});
