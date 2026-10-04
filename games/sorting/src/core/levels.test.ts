import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers, starsFor } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo, modeChanged } from './levels';

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

  it('на каждом уровне жёстче становится ровно один рычаг', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      const harder = harderLevers(a, b, LEVERS).length + (modeChanged(a, b) ? 1 : 0);
      expect(harder, `уровень ${i + 1}`).toBe(1);
    }
  });

  it('на уровне, где меняется признак, остальные рычаги не жёстче', () => {
    let switches = 0;
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      if (!modeChanged(a, b)) continue;
      switches++;
      expect(harderLevers(a, b, LEVERS), `уровень ${i + 1}`).toEqual([]);
    }
    expect(switches).toBeGreaterThan(0);
  });

  it('новое ограничение появляется на знакомой длине, а не вместе с её ростом', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      if (b.bins > a.bins || modeChanged(a, b)) {
        expect(b.total, `уровень ${i + 1}`).toBeLessThanOrEqual(a.total);
      }
    }
  });

  it('главы соответствуют названиям: цвета → формы → ещё корзина', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => p.mode === 'color' && p.bins === 3)).toBe(true);
    expect(c2.every((p) => p.mode === 'shape' && p.bins === 3)).toBe(true);
    expect(c3.every((p) => p.bins === 4)).toBe(true);
  });

  it('финал не легче прежнего: 20 фигурок по форме в четыре корзины', () => {
    expect(LADDER[LADDER_SIZE - 1].params).toEqual({ total: 20, mode: 'shape', bins: 4 });
    const tail = LADDER.slice(-3).map((lv) => lv.params.total);
    expect(Math.min(...tail)).toBeGreaterThanOrEqual(18);
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.field', vars: { n: 8 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.modeShape', vars: {} });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.bins', vars: { n: 4 } });
    expect(levelInfo(12).intro).toEqual({ key: 'intro.modeColor', vars: {} });
    expect(levelInfo(13).intro).toEqual({ key: 'intro.field', vars: { n: 18 } });
    expect(levelInfo(7).field).toEqual({ key: 'level.field', vars: { n: 12 } });
    expect(levelInfo(7).goldHint).toEqual({ key: 'level.goldHint', vars: { n: LADDER[6].goals.gold } });
    // Золото без ошибок — своя фраза, без «не больше 0».
    expect(levelInfo(1).goldHint).toEqual({ key: 'level.goldHintClean', vars: {} });
  });
});
