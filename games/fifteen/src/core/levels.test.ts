import { describe, expect, it } from 'vitest';
import { LADDER, LADDER_SIZE, levelAt } from './levels';
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
});
