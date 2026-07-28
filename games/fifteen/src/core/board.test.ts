import { describe, it, expect } from 'vitest';
import {
  createBoard, createBoardFromTiles, solvedTiles, randomWalk, LEVELS,
} from './board';
import { mulberry32 } from './rng';
import { computeScore, BASE } from './score';

describe('createBoard (генерация блужданием)', () => {
  it.each([[3], [4]])('%dx%d: валидная перестановка 0..N−1, не собрано, moves=0, детерминированно по seed', (size) => {
    const b1 = createBoard(size, mulberry32(42));
    const b2 = createBoard(size, mulberry32(42));
    const n = size * size;
    expect(b1.tiles.length).toBe(n);
    expect([...b1.tiles].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(b1.isSolved()).toBe(false);
    expect(b1.moves).toBe(0);
    expect(b1.tiles).toEqual(b2.tiles);
  });
});

describe('move', () => {
  it('двигает только соседей пустой; счётчик растёт только на успешных ходах', () => {
    const b = createBoard(4, mulberry32(7));
    const empty = b.tiles.indexOf(0);
    const row = Math.floor(empty / 4), col = empty % 4;

    // Несосед (диагональ или далёкая клетка) — отказ, счётчик не растёт.
    const far = b.tiles.findIndex((v, i) => {
      const r = Math.floor(i / 4), c = i % 4;
      return v !== 0 && Math.abs(r - row) + Math.abs(c - col) !== 1;
    });
    expect(b.canMove(far)).toBe(false);
    expect(b.move(far)).toBe(false);
    expect(b.move(empty)).toBe(false);   // пустая клетка — не плитка
    expect(b.move(-1)).toBe(false);
    expect(b.move(16)).toBe(false);
    expect(b.moves).toBe(0);

    // Сосед — ход: плитка встаёт в пустую, пустая — на место плитки.
    const near = row > 0 ? empty - 4 : empty + 4;
    const val = b.tiles[near];
    expect(b.canMove(near)).toBe(true);
    expect(b.move(near)).toBe(true);
    expect(b.moves).toBe(1);
    expect(b.tiles[empty]).toBe(val);
    expect(b.tiles[near]).toBe(0);
  });
});

describe('решаемость', () => {
  it.each([['3x3', 3], ['4x4', 4]] as const)(
    '%s: отмена блуждания в обратном порядке приводит к isSolved()',
    (level, size) => {
      const k = LEVELS[level].walk;
      const tiles = solvedTiles(size);
      const walked = randomWalk(tiles, size, k, mulberry32(2026));
      expect(walked.length).toBe(k);
      const board = createBoardFromTiles(tiles, size);

      // Отмена шага j — ход в клетку, где пустая была ПЕРЕД этим шагом:
      // e₀ = последняя клетка (собранное состояние), e_j = walked[j].
      const undo = [...walked.slice(0, -1)].reverse().concat(size * size - 1);
      for (const cell of undo) expect(board.move(cell)).toBe(true);
      expect(board.isSolved()).toBe(true);
      expect(board.moves).toBe(k);
    },
  );
});

describe('score', () => {
  it('больше ходов — меньше очков', () => {
    const a = computeScore({ level: '4x4', moves: 60, durationMs: 30_000 });
    const b = computeScore({ level: '4x4', moves: 120, durationMs: 30_000 });
    expect(a).toBeGreaterThan(b);
  });
  it('больше времени — меньше очков', () => {
    const fast = computeScore({ level: '3x3', moves: 40, durationMs: 20_000 });
    const slow = computeScore({ level: '3x3', moves: 40, durationMs: 200_000 });
    expect(fast).toBeGreaterThan(slow);
  });
  it('минимум 100', () => {
    expect(computeScore({ level: '3x3', moves: 100_000, durationMs: 10_000_000 })).toBe(100);
  });
  it('максимум = base уровня', () => {
    expect(computeScore({ level: '3x3', moves: 0, durationMs: 0 })).toBe(BASE['3x3']);
    expect(computeScore({ level: '4x4', moves: 0, durationMs: 0 })).toBe(BASE['4x4']);
    expect(computeScore({ level: '4x4', moves: 1, durationMs: 0 })).toBeLessThan(BASE['4x4']);
  });
});
