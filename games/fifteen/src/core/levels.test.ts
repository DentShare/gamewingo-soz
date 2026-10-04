import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo } from './levels';
import { createBoard } from './board';
import { mulberry32 } from './rng';

describe('лестница «Пятнашек»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('поле не уменьшается по ходу лестницы', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.size).toBeGreaterThanOrEqual(LADDER[i - 1].params.size);
    }
  });

  it('перемешивание растёт внутри каждого размера поля', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const prev = LADDER[i - 1].params;
      const cur = LADDER[i].params;
      if (cur.size === prev.size) expect(cur.walk).toBeGreaterThanOrEqual(prev.walk);
    }
  });

  it('новый размер поля начинается с лёгкого расклада', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const prev = LADDER[i - 1].params;
      const cur = LADDER[i].params;
      if (cur.size > prev.size) expect(cur.walk).toBeLessThan(prev.walk);
    }
  });

  it('лимит ходов, если задан, не строже серебряной цели', () => {
    for (const { params, goals } of LADDER) {
      if (params.moveLimit) expect(params.moveLimit).toBeGreaterThanOrEqual(goals.silver);
    }
  });

  it('золото строже серебра', () => {
    for (const { goals } of LADDER) expect(goals.gold).toBeLessThan(goals.silver);
  });

  it('каждый уровень порождает перемешанное поле нужного размера', () => {
    for (const { n, params } of LADDER) {
      const board = createBoard(params.size, mulberry32(n * 31 + 7), params.walk);
      expect(board.size).toBe(params.size);
      expect(board.isSolved()).toBe(false);
    }
  });

  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
    expect(levelAt(9).n).toBe(9);
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
      if (introduced) {
        expect(b.size, `уровень ${i + 1}`).toBe(a.size);
        expect(b.walk, `уровень ${i + 1}`).toBe(a.walk);
      }
    }
  });

  it('главы соответствуют названиям: знакомство → лимит ходов → на время', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => !p.moveLimit && !p.timeLimitSec)).toBe(true);
    expect(c2.every((p) => p.moveLimit > 0 && !p.timeLimitSec)).toBe(true);
    expect(c3.every((p) => p.moveLimit > 0 && p.timeLimitSec > 0)).toBe(true);
  });

  it('финал — поле 5×5 с лимитом ходов и таймером', () => {
    const last = LADDER[LADDER_SIZE - 1].params;
    expect(last.size).toBe(5);
    expect(last.moveLimit).toBeGreaterThan(0);
    expect(last.timeLimitSec).toBeGreaterThan(0);
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.walk', vars: {} });
    expect(levelInfo(4).intro).toEqual({ key: 'intro.field', vars: { n: 4 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.moveLimit', vars: { n: 150 } });
    expect(levelInfo(7).intro).toEqual({ key: 'intro.moveLimitTighter', vars: { n: 130 } });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.timer', vars: { t: '4:00' } });
    expect(levelInfo(12).intro).toEqual({ key: 'intro.timerTighter', vars: { t: '3:20' } });
    // Рост поля с мягкими лимитами называется ростом поля.
    expect(levelInfo(13).intro).toEqual({ key: 'intro.field', vars: { n: 5 } });
    // Глубже перемешано при мягком лимите — называется перемешиванием.
    expect(levelInfo(8).intro).toEqual({ key: 'intro.walk', vars: {} });
    expect(levelInfo(7).field).toEqual({ key: 'level.field', vars: { n: 4 } });
    expect(levelInfo(7).goldHint.vars).toEqual({ n: LADDER[6].goals.gold });
  });
});
