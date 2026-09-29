import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers, starsFor } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, GHOST_ALPHA, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo } from './levels';

describe('лестница «Пазл»', () => {
  it('сетка совпадает с числом кусочков, подсказка — с яркостью', () => {
    for (const lv of LADDER) {
      const p = lv.params;
      expect(p.cols * p.rows, `уровень ${lv.n}`).toBe(p.pieces);
      expect(p.ghost, `уровень ${lv.n}`).toBe(p.hint > 0);
      expect(GHOST_ALPHA[p.hint], `уровень ${lv.n}`).toBeTypeOf('number');
    }
  });

  it('в лотке помещается не больше четырёх кусочков — палец ребёнка должен попадать', () => {
    for (const lv of LADDER) expect(lv.params.tray).toBeGreaterThanOrEqual(3);
    for (const lv of LADDER) expect(lv.params.tray).toBeLessThanOrEqual(4);
  });

  it('золото достижимо и серебро мягче золота', () => {
    for (const lv of LADDER) {
      expect(lv.goals.gold).toBeGreaterThanOrEqual(0);
      expect(lv.goals.silver).toBeGreaterThan(lv.goals.gold);
      expect(starsFor(lv.goals, lv.goals.gold)).toBe(3);
      expect(starsFor(lv.goals, lv.goals.silver)).toBe(2);
    }
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
      const introduced = (a.hint === 3 && b.hint < 3) || (a.hint > 0 && b.hint === 0) || b.tray > a.tray;
      if (introduced) expect(b.pieces, `уровень ${i + 1}`).toBe(a.pieces);
    }
  });

  it('главы соответствуют названиям: знакомство → по памяти → выбирай сам', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => p.hint === 3 && p.tray === 3)).toBe(true);
    expect(c2.every((p) => p.hint < 3 && p.tray === 3)).toBe(true);
    expect(c3.every((p) => p.hint < 3 && p.tray === 4)).toBe(true);
  });

  it('финал не легче прежнего: 4×5 без подсказки', () => {
    const last = LADDER[LADDER_SIZE - 1].params;
    expect([last.cols, last.rows]).toEqual([4, 5]);
    expect(last.ghost).toBe(false);
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.field', vars: {} });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.hintFainter', vars: {} });
    expect(levelInfo(10).intro).toEqual({ key: 'intro.noHint', vars: {} });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.tray', vars: { n: 4 } });
    // Рост поля с подсказкой поярче называется ростом поля.
    expect(levelInfo(8).intro).toEqual({ key: 'intro.field', vars: {} });
    expect(levelInfo(8).field).toEqual({ key: 'level.field', vars: { n: 15 } });
    expect(levelInfo(7).goldHint).toEqual({ key: 'level.goldHint', vars: { n: LADDER[6].goals.gold } });
    expect(levelInfo(1).goldHint).toEqual({ key: 'level.goldHintFlawless', vars: {} });
  });
});
