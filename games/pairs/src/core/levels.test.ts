import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers, starsFor } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo } from './levels';
import { SYMBOLS } from './deck';

describe('лестница «Найди пару»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('раскладка вмещает ровно все карточки', () => {
    for (const { params } of LADDER) {
      expect(params.cols * params.rows).toBe(params.pairs * 2);
    }
  });

  it('пар не больше, чем есть разных значков', () => {
    for (const { params } of LADDER) expect(params.pairs).toBeLessThanOrEqual(SYMBOLS.length);
  });

  it('поле не уменьшается по ходу лестницы', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.pairs).toBeGreaterThanOrEqual(LADDER[i - 1].params.pairs);
    }
  });

  it('лимит ходов достижим: его хватает хотя бы на пару промахов на каждую пару', () => {
    for (const { params } of LADDER) {
      if (!params.moveLimit) continue;
      expect(params.moveLimit).toBeGreaterThan(params.pairs);
    }
  });

  it('золото строже серебра и достижимо в рамках лимита', () => {
    for (const { params, goals } of LADDER) {
      expect(goals.gold).toBeLessThan(goals.silver);
      // Идеальная память — ровно `pairs` ходов, лучше не бывает.
      expect(goals.gold).toBeGreaterThanOrEqual(params.pairs);
      if (params.moveLimit) expect(goals.silver).toBeLessThanOrEqual(params.moveLimit);
    }
  });

  it('первые уровни без ограничений, поздние — с ними', () => {
    expect(LADDER[0].params.moveLimit).toBe(0);
    expect(LADDER[0].params.timeLimitSec).toBe(0);
    expect(LADDER[LADDER_SIZE - 1].params.moveLimit).toBeGreaterThan(0);
    expect(LADDER[LADDER_SIZE - 1].params.timeLimitSec).toBeGreaterThan(0);
  });

  it('идеальное прохождение даёт три звезды на каждом уровне', () => {
    for (const { params, goals } of LADDER) expect(starsFor(goals, params.pairs)).toBe(3);
  });

  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(1).n).toBe(1);
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
      const introduced = (!a.moveLimit && b.moveLimit) || (!a.timeLimitSec && b.timeLimitSec);
      if (introduced) expect(b.pairs, `уровень ${i + 1}`).toBe(a.pairs);
    }
  });

  it('главы соответствуют названиям: знакомство → лимит ходов → на время', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => !p.moveLimit && !p.timeLimitSec)).toBe(true);
    expect(c2.every((p) => p.moveLimit > 0 && !p.timeLimitSec)).toBe(true);
    expect(c3.every((p) => p.moveLimit > 0 && p.timeLimitSec > 0)).toBe(true);
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.field', vars: { n: 5 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.moveLimit', vars: { n: 22 } });
    expect(levelInfo(7).intro).toEqual({ key: 'intro.moveLimitTighter', vars: { n: 20 } });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.timer', vars: { t: '1:50' } });
    expect(levelInfo(12).intro).toEqual({ key: 'intro.timerTighter', vars: { t: '1:35' } });
    // Рост поля с мягким лимитом называется ростом поля.
    expect(levelInfo(8).intro).toEqual({ key: 'intro.field', vars: { n: 10 } });
    expect(levelInfo(7).goldHint.vars).toEqual({ n: LADDER[6].goals.gold });
  });
});

