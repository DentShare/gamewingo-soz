import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo, perfectCrosses } from './levels';
import { createSumsGame, generate } from './sums';
import { mulberry32 } from './rng';

describe('лестница «Сумм»: главы', () => {
  it('на каждом уровне жёстче становится ровно один рычаг', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const harder = harderLevers(LADDER[i - 1].params, LADDER[i].params, LEVERS);
      expect(harder, `уровень ${i + 1}`).toHaveLength(1);
    }
  });

  it('новое ограничение появляется на знакомом поле, а не вместе с его ростом', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      const introduced = (a.maxValue <= 9 && b.maxValue > 9) || (!a.negative && b.negative);
      if (introduced) expect(b.size, `уровень ${i + 1}`).toBe(a.size);
    }
  });

  it('главы соответствуют названиям: знакомство → двузначные → с минусом', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => p.maxValue <= 9 && !p.negative)).toBe(true);
    expect(c2.every((p) => p.maxValue > 9 && !p.negative)).toBe(true);
    expect(c3.every((p) => p.negative)).toBe(true);
  });

  it('финал не легче прежнего: 9×9, 42 оставить, числа до 15, с минусами', () => {
    expect(LADDER[LADDER_SIZE - 1].params).toEqual({ size: 9, keep: 42, maxValue: 15, negative: true });
  });

  it('генератор выдаёт решаемую задачу на каждом уровне', () => {
    for (const { n, params } of LADDER) {
      for (let seed = 1; seed <= 10; seed++) {
        const p = generate(params, mulberry32(seed * 97 + n));
        expect(p.minCrosses, `уровень ${n}, seed ${seed}`).toBe(perfectCrosses(n));
        const game = createSumsGame(p);
        p.solution.forEach((keep, i) => { if (!keep) game.toggle(i); });
        expect(game.solved, `уровень ${n}, seed ${seed}`).toBe(true);
      }
    }
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.crosses', vars: { n: 5 } });
    expect(levelInfo(3).intro).toEqual({ key: 'intro.field', vars: { n: 4 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.maxValue', vars: { n: 12 } });
    expect(levelInfo(7).intro).toEqual({ key: 'intro.maxValue', vars: { n: 15 } });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.negative', vars: {} });
    // Рост поля с мягкой долей лишнего называется ростом поля.
    expect(levelInfo(12).intro).toEqual({ key: 'intro.field', vars: { n: 7 } });
    expect(levelInfo(9).field).toEqual({ key: 'level.field', vars: { n: 6 } });
    expect(levelInfo(7).goldHint.vars).toEqual({ n: perfectCrosses(7) });
  });
});
