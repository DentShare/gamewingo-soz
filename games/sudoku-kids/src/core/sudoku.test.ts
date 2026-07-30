import { describe, it, expect } from 'vitest';
import {
  generateSolved, countSolutions, makePuzzle, conflicts, isComplete, solve,
  blockDims, type Grid,
} from './sudoku';
import { mulberry32 } from './rng';
import { LADDER } from './levels';

/** Валидность полной сетки: каждая строка/столбец/блок содержит все цифры 1..size. */
function assertSolved(grid: Grid, size: number) {
  expect(grid.length).toBe(size * size);
  expect(grid.every((v) => v >= 1 && v <= size)).toBe(true);
  const all = Array.from({ length: size }, (_, i) => i + 1);
  const { rows: bRows, cols: bCols } = blockDims(size);
  for (let r = 0; r < size; r++) {
    const row = all.map((_, c) => grid[r * size + c]);
    expect([...row].sort()).toEqual(all);
  }
  for (let c = 0; c < size; c++) {
    const col = all.map((_, r) => grid[r * size + c]);
    expect([...col].sort()).toEqual(all);
  }
  for (let r0 = 0; r0 < size; r0 += bRows) {
    for (let c0 = 0; c0 < size; c0 += bCols) {
      const block: number[] = [];
      for (let r = r0; r < r0 + bRows; r++) {
        for (let c = c0; c < c0 + bCols; c++) block.push(grid[r * size + c]);
      }
      expect(block.sort()).toEqual(all);
    }
  }
}

describe('generateSolved', () => {
  for (const size of [4, 6] as const) {
    for (const seed of [1, 42, 2026]) {
      it(`строит валидную полную сетку ${size}×${size} (seed ${seed})`, () => {
        const grid = generateSolved(size, mulberry32(seed));
        assertSolved(grid, size);
        expect(conflicts(grid)).toEqual([]);
        expect(isComplete(grid)).toBe(true);
      });
    }
  }

  it('детерминирован по seed', () => {
    expect(generateSolved(6, mulberry32(7))).toEqual(generateSolved(6, mulberry32(7)));
  });
});

describe('makePuzzle', () => {
  for (const { n, params: spec } of LADDER) {
    it(`уровень ${n}: единственное решение, совпадающее с исходным, подсказок ≥ ${spec.clues}`, () => {
      const { puzzle, solution } = makePuzzle(spec.size, spec.clues, mulberry32(99));
      assertSolved(solution, spec.size);
      // Единственное решение (счётчик с отсечкой на 2).
      expect(countSolutions(puzzle, 2)).toBe(1);
      // И оно совпадает с исходной решённой сеткой.
      expect(solve(puzzle)).toEqual(solution);
      // Данные паззла — подмножество решения, их не меньше cluesTarget.
      const clues = puzzle.filter((v) => v !== 0).length;
      expect(clues).toBeGreaterThanOrEqual(spec.clues);
      puzzle.forEach((v, i) => {
        if (v !== 0) expect(v).toBe(solution[i]);
      });
    });
  }
});

describe('conflicts', () => {
  const empty4: Grid = new Array(16).fill(0);

  it('пустая сетка — без конфликтов, isComplete=false', () => {
    expect(conflicts(empty4)).toEqual([]);
    expect(isComplete(empty4)).toBe(false);
  });

  it('валидная полная сетка — без конфликтов', () => {
    const solved: Grid = [
      1, 2, 3, 4,
      3, 4, 1, 2,
      2, 1, 4, 3,
      4, 3, 2, 1,
    ];
    expect(conflicts(solved)).toEqual([]);
    expect(isComplete(solved)).toBe(true);
  });

  it('находит конфликт строки', () => {
    const g = empty4.slice();
    g[0] = 2; g[3] = 2; // строка 0: две двойки
    expect(conflicts(g)).toEqual([0, 3]);
  });

  it('находит конфликт столбца', () => {
    const g = empty4.slice();
    g[1] = 3; g[13] = 3; // столбец 1: две тройки
    expect(conflicts(g)).toEqual([1, 13]);
  });

  it('находит конфликт блока (2×2 и 2×3)', () => {
    const g4 = empty4.slice();
    g4[0] = 1; g4[5] = 1; // блок 2×2 (клетки 0,1,4,5): две единицы по диагонали
    expect(conflicts(g4)).toEqual([0, 5]);

    const g6: Grid = new Array(36).fill(0);
    g6[0] = 5; g6[8] = 5; // блок 2×3 (клетки 0..2, 6..8): r0c0 и r1c2
    expect(conflicts(g6)).toEqual([0, 8]);
  });

  it('не помечает разные цифры и пустые клетки', () => {
    const g = empty4.slice();
    g[0] = 1; g[1] = 2; g[2] = 3; g[3] = 4;
    expect(conflicts(g)).toEqual([]);
  });
});

describe('countSolutions', () => {
  it('у пустой сетки 4×4 решений ≥ cap (отсечка работает)', () => {
    expect(countSolutions(new Array(16).fill(0), 2)).toBe(2);
    expect(countSolutions(new Array(16).fill(0), 5)).toBe(5);
  });

  it('противоречивый паззл — 0 решений', () => {
    const g: Grid = new Array(16).fill(0);
    g[0] = 1; g[1] = 1;
    expect(countSolutions(g)).toBe(0);
  });

  it('полная валидная сетка — ровно 1 решение', () => {
    const solved = generateSolved(4, mulberry32(3));
    expect(countSolutions(solved)).toBe(1);
  });
});
