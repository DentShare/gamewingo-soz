import { describe, it, expect } from 'vitest';
import { createGrid2048, applyMove } from './grid';
import { mulberry32 } from './rng';

const E = [0, 0, 0, 0];
const board = (rows: number[][]) => rows.map((r) => [...r]);
/** Детерминированный «rng»: спавн в ПОСЛЕДНЮЮ пустую клетку со значением 4 (0.999 ≥ 0.9). */
const spawnLast4 = () => 0.999;
/** Детерминированный «rng»: спавн в ПЕРВУЮ пустую клетку со значением 2 (0 < 0.9). */
const spawnFirst2 = () => 0;

const countTiles = (cells: readonly (readonly number[])[]) =>
  cells.flat().filter((v) => v !== 0).length;

describe('applyMove (сдвиг + слияния, без спавна)', () => {
  it('[2,2,4,4] влево → [4,8,0,0], gained 12, две пары слились', () => {
    const res = applyMove(board([[2, 2, 4, 4], E, E, E]), 'left');
    expect(res.cells[0]).toEqual([4, 8, 0, 0]);
    expect(res.gained).toBe(12);
    expect(res.merges.map((m) => m.value)).toEqual([4, 8]);
    expect(res.moved).toBe(true);
  });

  it('слитая плитка НЕ сливается повторно в тот же ход: [4,4,8,0] → [8,8,0,0]', () => {
    const res = applyMove(board([[4, 4, 8, 0], E, E, E]), 'left');
    expect(res.cells[0]).toEqual([8, 8, 0, 0]);
    expect(res.gained).toBe(8);
    expect(res.merges).toEqual([{ value: 8, row: 0, col: 0 }]);
  });

  it('[2,2,2,2] влево → [4,4,0,0] (каждая плитка сливается один раз)', () => {
    const res = applyMove(board([[2, 2, 2, 2], E, E, E]), 'left');
    expect(res.cells[0]).toEqual([4, 4, 0, 0]);
    expect(res.gained).toBe(8);
  });

  it('сливается пара, ближняя к краю движения: [2,0,2,2] влево → [4,2,0,0]', () => {
    const res = applyMove(board([[2, 0, 2, 2], E, E, E]), 'left');
    expect(res.cells[0]).toEqual([4, 2, 0, 0]);
    expect(res.gained).toBe(4);
  });

  it('вправо зеркально: [2,0,2,2] → [0,0,2,4], [2,2,4,4] → [0,0,4,8]', () => {
    expect(applyMove(board([[2, 0, 2, 2], E, E, E]), 'right').cells[0]).toEqual([0, 0, 2, 4]);
    expect(applyMove(board([[2, 2, 4, 4], E, E, E]), 'right').cells[0]).toEqual([0, 0, 4, 8]);
  });

  it('вверх/вниз работают по колонкам', () => {
    const col = board([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]);
    const up = applyMove(col, 'up');
    expect(up.cells.map((r) => r[0])).toEqual([4, 8, 0, 0]);
    const down = applyMove(col, 'down');
    expect(down.cells.map((r) => r[0])).toEqual([0, 0, 4, 8]);
  });
});

describe('createGrid2048', () => {
  it('score растёт на номинал каждой слитой плитки: [2,2,4,4] влево → +12', () => {
    const g = createGrid2048(spawnLast4, board([[2, 2, 4, 4], E, E, E]));
    const res = g.move('left');
    expect(res.moved).toBe(true);
    expect(g.cells[0]).toEqual([4, 8, 0, 0]);
    expect(g.score).toBe(12);
    expect(g.moves).toBe(1);
    // спавн детерминирован: последняя пустая клетка (3,3), значение 4
    expect(g.cells[3]).toEqual([0, 0, 0, 4]);
  });

  it('[4,4,8,0] влево → [8,8,0,0], НЕ 16 — без повторного слияния', () => {
    const g = createGrid2048(spawnLast4, board([[4, 4, 8, 0], E, E, E]));
    g.move('left');
    expect(g.cells[0]).toEqual([8, 8, 0, 0]);
    expect(g.score).toBe(8);
  });

  it('[2,0,2,2] влево → [4,2,0,0] — сливается ближняя к краю пара', () => {
    const g = createGrid2048(spawnLast4, board([[2, 0, 2, 2], E, E, E]));
    g.move('left');
    expect(g.cells[0]).toEqual([4, 2, 0, 0]);
    expect(g.score).toBe(4);
  });

  it('ход без изменений: moved=false, спавна нет, moves не растёт', () => {
    const g = createGrid2048(spawnLast4, board([[2, 4, 8, 16], E, E, E]));
    const res = g.move('left'); // ряд уже прижат влево, слияний нет
    expect(res.moved).toBe(false);
    expect(res.merges).toEqual([]);
    expect(g.moves).toBe(0);
    expect(g.score).toBe(0);
    expect(countTiles(g.cells)).toBe(4); // спавна не было
    expect(g.cells[0]).toEqual([2, 4, 8, 16]);
  });

  it('спавн только после результативного хода: на пустой клетке, значение 2 или 4', () => {
    const g = createGrid2048(mulberry32(7), board([[2, 2, 0, 0], E, E, E]));
    expect(countTiles(g.cells)).toBe(2);
    g.move('left'); // → [4,0,0,0] + спавн
    expect(countTiles(g.cells)).toBe(2); // слитая 4 + одна новая
    expect(g.cells[0][0]).toBe(4);
    const spawned = g.cells.flatMap((row, r) =>
      row.map((v, c) => ({ v, r, c })).filter((x) => x.v !== 0 && !(x.r === 0 && x.c === 0)),
    );
    expect(spawned).toHaveLength(1);
    expect([2, 4]).toContain(spawned[0].v);
  });

  it('значение спавна управляется rng: <0.9 → 2, ≥0.9 → 4', () => {
    const g2 = createGrid2048(spawnFirst2, board([[2, 2, 0, 0], E, E, E]));
    g2.move('left');
    expect(g2.cells[0][1]).toBe(2); // первая пустая клетка, значение 2
    const g4 = createGrid2048(spawnLast4, board([[2, 2, 0, 0], E, E, E]));
    g4.move('left');
    expect(g4.cells[3][3]).toBe(4); // последняя пустая клетка, значение 4
  });

  it('isOver(): заполненное поле без слияний → true', () => {
    const g = createGrid2048(spawnLast4, board([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]));
    expect(g.isOver()).toBe(true);
    expect(g.move('left').moved).toBe(false);
  });

  it('isOver(): заполненное поле с возможным слиянием → false; с пустой клеткой → false', () => {
    const withMerge = createGrid2048(spawnLast4, board([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 2, 4], // соседние 2,2 — ход есть
    ]));
    expect(withMerge.isOver()).toBe(false);
    const withHole = createGrid2048(spawnLast4, board([[2, 4, 2, 0], E, E, E]));
    expect(withHole.isOver()).toBe(false);
  });

  it('hasWon() при появлении 2048; флаг остаётся, игра продолжается', () => {
    const g = createGrid2048(spawnLast4, board([[1024, 1024, 0, 0], E, E, E]));
    expect(g.hasWon()).toBe(false);
    const res = g.move('left');
    expect(res.merges).toEqual([{ value: 2048 }]);
    expect(g.hasWon()).toBe(true);
    expect(g.maxTile()).toBe(2048);
    expect(g.score).toBe(2048);
    g.move('down');
    expect(g.hasWon()).toBe(true); // не сбрасывается
  });

  it('без initial спавнятся две стартовые плитки', () => {
    const g = createGrid2048(mulberry32(42));
    expect(countTiles(g.cells)).toBe(2);
    expect(g.cells.flat().every((v) => v === 0 || v === 2 || v === 4)).toBe(true);
    expect(g.score).toBe(0);
    expect(g.moves).toBe(0);
  });

  it('initial копируется глубоко — мутации снаружи не влияют', () => {
    const init = board([[2, 2, 0, 0], E, E, E]);
    const g = createGrid2048(spawnLast4, init);
    init[0][0] = 999;
    expect(g.cells[0][0]).toBe(2);
  });
});
