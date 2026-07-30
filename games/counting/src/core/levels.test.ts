import { describe, expect, it } from 'vitest';
import { starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, levelAt } from './levels';

describe('лестница «Счёта»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('партия не укорачивается по ходу лестницы', () => {
    const first = LADDER[0].params.questions;
    const last = LADDER[LADDER_SIZE - 1].params.questions;
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
      // Две звезды надо заслужить: прощается не больше трети вопросов.
      expect(goals.silver).toBeLessThanOrEqual(Math.ceil(params.questions / 3));
      expect(goals.gold).toBeLessThanOrEqual(goals.silver);
    }
  });

  it('потолок счёта и число вариантов растут монотонно', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.maxCount).toBeGreaterThanOrEqual(LADDER[i - 1].params.maxCount);
      expect(LADDER[i].params.options).toBeGreaterThanOrEqual(LADDER[i - 1].params.options);
    }
  });

  it('вариантов ответа не больше, чем существует чисел', () => {
    for (const { params } of LADDER) expect(params.options).toBeLessThanOrEqual(params.maxCount);
  });

  it('счёт не выходит за пределы раскладок поля', () => {
    for (const { params } of LADDER) expect(params.maxCount).toBeLessThanOrEqual(20);
  });


  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
    expect(levelAt(7).n).toBe(7);
  });
});
