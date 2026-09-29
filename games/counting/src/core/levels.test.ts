import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers, starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, LEVERS, levelAt } from './levels';

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

  it('на каждом уровне жёстче становится ровно один рычаг', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const harder = harderLevers(LADDER[i - 1].params, LADDER[i].params, LEVERS);
      expect(harder, `уровень ${i + 1}`).toHaveLength(1);
    }
  });

  it('новое ограничение появляется на знакомом поле, а не вместе с его ростом', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      if (b.options > a.options || b.questions > a.questions) expect(b.maxCount, `уровень ${i + 1}`).toBe(a.maxCount);
    }
  });

  it('главы соответствуют названиям: знакомство → шире выбор → марафон', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    const [first] = c1;
    expect(c1.every((p) => p.options === first.options && p.questions === first.questions)).toBe(true);
    expect(c2.every((p) => p.options > first.options && p.questions === first.questions)).toBe(true);
    expect(c3.every((p) => p.questions > first.questions)).toBe(true);
  });

  it('финал не легче прежнего: 15 вопросов, счёт до 20, шесть кнопок', () => {
    expect(LADDER[LADDER_SIZE - 1].params).toEqual({ questions: 15, maxCount: 20, options: 6 });
  });
});
