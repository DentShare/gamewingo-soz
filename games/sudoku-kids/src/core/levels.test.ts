import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, formatSec, levelAt, levelInfo } from './levels';
import { makePuzzle } from './sudoku';
import { mulberry32 } from './rng';

describe('лестница мини-судоку', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('поле не уменьшается по ходу лестницы', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.size).toBeGreaterThanOrEqual(LADDER[i - 1].params.size);
    }
  });

  it('готовых цифр меньше, чем клеток, и генератор выдаёт ровно столько', () => {
    for (const { n, params: p } of LADDER) {
      expect(p.clues, `уровень ${n}`).toBeLessThan(p.size * p.size);
      // Рычаг «меньше цифр» настоящий, только если генератор доходит до цели.
      for (const seed of [1, 7, 2026]) {
        const { puzzle } = makePuzzle(p.size, p.clues, mulberry32(seed));
        expect(puzzle.filter((v) => v !== 0).length, `уровень ${n}, seed ${seed}`).toBe(p.clues);
      }
    }
  });

  it('золото строже серебра, серебро успевается до конца таймера', () => {
    for (const { params, goals } of LADDER) {
      expect(goals.gold).toBeLessThan(goals.silver);
      if (params.timeLimitSec) expect(goals.silver).toBeLessThan(params.timeLimitSec);
    }
  });

  it('первые уровни без ограничений, финал — не мягче прежнего (6×6, 14 цифр, 2 ошибки, 4:00)', () => {
    expect(LADDER[0].params.mistakeLimit).toBe(0);
    expect(LADDER[0].params.timeLimitSec).toBe(0);
    const last = LADDER[LADDER_SIZE - 1].params;
    expect(last.size).toBe(6);
    expect(last.clues).toBeLessThanOrEqual(14);
    expect(last.mistakeLimit).toBeGreaterThan(0);
    expect(last.mistakeLimit).toBeLessThanOrEqual(2);
    expect(last.timeLimitSec).toBeGreaterThan(0);
    expect(last.timeLimitSec).toBeLessThanOrEqual(240);
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
      const introduced = (!a.mistakeLimit && b.mistakeLimit) || (!a.timeLimitSec && b.timeLimitSec);
      if (introduced) expect(b.size, `уровень ${i + 1}`).toBe(a.size);
    }
  });

  it('главы соответствуют названиям: знакомство → аккуратно (лимит ошибок) → на время', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => !p.mistakeLimit && !p.timeLimitSec)).toBe(true);
    expect(c2.every((p) => p.mistakeLimit > 0 && !p.timeLimitSec)).toBe(true);
    expect(c3.every((p) => p.mistakeLimit > 0 && p.timeLimitSec > 0)).toBe(true);
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.clues', vars: { n: 10 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.mistakes', vars: { n: 3 } });
    expect(levelInfo(9).intro).toEqual({ key: 'intro.mistakesTighter', vars: { n: 3 } });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.timer', vars: { t: '5:00' } });
    expect(levelInfo(15).intro).toEqual({ key: 'intro.timerTighter', vars: { t: '4:00' } });
    // Рост поля с мягким лимитом и щедрыми цифрами называется ростом поля.
    expect(levelInfo(8).intro).toEqual({ key: 'intro.field', vars: { n: 6 } });
    expect(levelInfo(8).field).toEqual({ key: 'level.field', vars: { n: 6 } });
    expect(levelInfo(7).goldHint.vars).toEqual({ t: formatSec(LADDER[6].goals.gold) });
  });
});
