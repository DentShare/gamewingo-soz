import { describe, expect, it } from 'vitest';
import { buildArcadeLadder } from './arcade.js';
import { starsFor } from './ladder.js';

describe('лестница аркады', () => {
  const ladder = buildArcadeLadder(15, 300, 6000, 40);

  it('нумерует уровни подряд', () => {
    expect(ladder).toHaveLength(15);
    ladder.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('цель растёт монотонно от первой до последней', () => {
    expect(ladder[0].params.target).toBe(300);
    expect(ladder[14].params.target).toBe(6000);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].params.target).toBeGreaterThan(ladder[i - 1].params.target);
    }
  });

  it('первые ступени берутся сходу — кривая с ускорением', () => {
    // Середина лестницы должна быть заметно ближе к началу, чем к концу.
    const mid = ladder[7].params.target;
    expect(mid - 300).toBeLessThan(6000 - mid);
  });

  it('фаза старта растёт от нуля до заданной', () => {
    expect(ladder[0].params.startPhase).toBe(0);
    expect(ladder[14].params.startPhase).toBe(40);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].params.startPhase).toBeGreaterThanOrEqual(ladder[i - 1].params.startPhase);
    }
  });

  it('ровно достигнутая цель даёт одну звезду, полторы — две, двойная — три', () => {
    for (const { params, goals } of ladder) {
      expect(starsFor(goals, params.target)).toBe(1);
      expect(starsFor(goals, goals.silver)).toBe(2);
      expect(starsFor(goals, goals.gold)).toBe(3);
      // Пороги стоят там, где обещано: полторы и две цели с точностью до округления.
      expect(Math.abs(goals.silver - params.target * 1.5)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(goals.gold - params.target * 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it('лестница из одного уровня берёт конечные значения', () => {
    const one = buildArcadeLadder(1, 100, 900, 10);
    expect(one[0].params).toEqual({ target: 900, startPhase: 10 });
  });
});
