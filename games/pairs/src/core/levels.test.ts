import { describe, expect, it } from 'vitest';
import { starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, levelAt } from './levels';
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
});
