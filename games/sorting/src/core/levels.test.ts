import { describe, expect, it } from 'vitest';
import { starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, levelAt } from './levels';

describe('лестница «Сортировки»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('партия не укорачивается по ходу лестницы', () => {
    const first = LADDER[0].params.total;
    const last = LADDER[LADDER_SIZE - 1].params.total;
    expect(last).toBeGreaterThan(first);
  });

  it('золото строже серебра', () => {
    for (const { goals } of LADDER) expect(goals.gold).toBeLessThan(goals.silver);
  });

  it('безошибочная партия всегда даёт три звезды', () => {
    for (const { goals } of LADDER) expect(starsFor(goals, 0)).toBe(3);
  });

  it('допуск по ошибкам соразмерен длине партии', () => {
    for (const { params, goals } of LADDER) {
      // Две звезды надо заслужить: прощается не больше трети фигурок.
      expect(goals.silver).toBeLessThanOrEqual(Math.ceil(params.total / 3));
      expect(goals.gold).toBeLessThanOrEqual(goals.silver);
    }
  });

  it('четвёртая корзина появляется не с первого уровня', () => {
    expect(LADDER[0].params.bins).toBe(3);
    expect(LADDER.some((lv) => lv.params.bins === 4)).toBe(true);
    const firstFour = LADDER.findIndex((lv) => lv.params.bins === 4);
    expect(firstFour).toBeGreaterThan(2);
  });

  it('оба признака сортировки встречаются', () => {
    const modes = new Set(LADDER.map((lv) => lv.params.mode));
    expect(modes).toEqual(new Set(['color', 'shape']));
  });


  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
    expect(levelAt(7).n).toBe(7);
  });
});
