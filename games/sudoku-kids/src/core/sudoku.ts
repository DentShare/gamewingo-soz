import { shuffle } from './rng';

/**
 * Чистое ядро детского судоку: генерация, решатель-счётчик, валидация.
 * Без Phaser и DOM; RNG инжектится (mulberry32 из core/rng.ts).
 */

/** Плоская сетка size×size, построчно; 0 — пустая клетка. */
export type Grid = number[];

export type LevelId = 'easy4' | 'easy6' | 'hard6';

export interface LevelSpec {
  size: 4 | 6;
  /** Целевое число подсказок-данных (givens) в паззле. */
  clues: number;
}

export const LEVELS: Record<LevelId, LevelSpec> = {
  easy4: { size: 4, clues: 8 },   // из 16
  easy6: { size: 6, clues: 20 },  // из 36
  hard6: { size: 6, clues: 15 },  // из 36 (14–16 по спеке)
};

/** Размер стороны по длине плоской сетки (16 → 4, 36 → 6). */
export function sizeOf(grid: Grid): number {
  const size = Math.round(Math.sqrt(grid.length));
  if (size * size !== grid.length) throw new Error(`bad grid length ${grid.length}`);
  return size;
}

/** Размеры блока: 4×4 → блоки 2×2, 6×6 → блоки 2 строки × 3 столбца. */
export function blockDims(size: number): { rows: number; cols: number } {
  if (size === 4) return { rows: 2, cols: 2 };
  if (size === 6) return { rows: 2, cols: 3 };
  throw new Error(`unsupported size ${size}`);
}

/** Можно ли поставить v в клетку idx без конфликта строки/столбца/блока. */
function canPlace(grid: Grid, size: number, idx: number, v: number): boolean {
  const row = Math.floor(idx / size);
  const col = idx % size;
  for (let i = 0; i < size; i++) {
    if (grid[row * size + i] === v) return false; // строка
    if (grid[i * size + col] === v) return false; // столбец
  }
  const { rows: bRows, cols: bCols } = blockDims(size);
  const r0 = Math.floor(row / bRows) * bRows;
  const c0 = Math.floor(col / bCols) * bCols;
  for (let r = r0; r < r0 + bRows; r++) {
    for (let c = c0; c < c0 + bCols; c++) {
      if (grid[r * size + c] === v) return false; // блок
    }
  }
  return true;
}

/** Полная валидная сетка: рандомизированный backtracking (кандидаты перемешаны rng). */
export function generateSolved(size: number, rng: () => number): Grid {
  blockDims(size); // валидация размера
  const grid: Grid = new Array(size * size).fill(0);
  const digits = Array.from({ length: size }, (_, i) => i + 1);
  const fill = (idx: number): boolean => {
    if (idx === grid.length) return true;
    for (const v of shuffle(digits, rng)) {
      if (canPlace(grid, size, idx, v)) {
        grid[idx] = v;
        if (fill(idx + 1)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  };
  if (!fill(0)) throw new Error('generateSolved: no solution'); // недостижимо для 4/6
  return grid;
}

/** Число решений паззла с отсечкой: останавливается, досчитав до cap (по умолчанию 2). */
export function countSolutions(puzzle: Grid, cap = 2): number {
  const size = sizeOf(puzzle);
  const grid = puzzle.slice();
  let count = 0;
  const search = (): void => {
    const idx = grid.indexOf(0);
    if (idx === -1) {
      count++;
      return;
    }
    for (let v = 1; v <= size; v++) {
      if (canPlace(grid, size, idx, v)) {
        grid[idx] = v;
        search();
        grid[idx] = 0;
        if (count >= cap) return; // отсечка
      }
    }
  };
  search();
  return count;
}

/** Первое найденное решение паззла (или null, если решения нет). */
export function solve(puzzle: Grid): Grid | null {
  const size = sizeOf(puzzle);
  const grid = puzzle.slice();
  const search = (): boolean => {
    const idx = grid.indexOf(0);
    if (idx === -1) return true;
    for (let v = 1; v <= size; v++) {
      if (canPlace(grid, size, idx, v)) {
        grid[idx] = v;
        if (search()) return true;
        grid[idx] = 0;
      }
    }
    return false;
  };
  return search() ? grid : null;
}

export interface Puzzle {
  /** Паззл с пустыми клетками (0), единственное решение. */
  puzzle: Grid;
  /** Исходная полная сетка — решение паззла. */
  solution: Grid;
}

/**
 * Паззл из решённой сетки: убираем клетки в случайном порядке, откатывая удаление,
 * если решений становится больше одного. Останавливаемся при достижении cluesTarget
 * или когда убирать больше нечего.
 */
export function makePuzzle(size: number, cluesTarget: number, rng: () => number): Puzzle {
  const solution = generateSolved(size, rng);
  const puzzle = solution.slice();
  let clues = puzzle.length;
  const order = shuffle(Array.from({ length: puzzle.length }, (_, i) => i), rng);
  for (const idx of order) {
    if (clues <= cluesTarget) break;
    const saved = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) > 1) {
      puzzle[idx] = saved; // удаление ломает единственность — откат
    } else {
      clues--;
    }
  }
  return { puzzle, solution };
}

/** Индексы клеток, нарушающих правило строки/столбца/блока (пустые не считаются). */
export function conflicts(grid: Grid): number[] {
  const size = sizeOf(grid);
  const { rows: bRows, cols: bCols } = blockDims(size);
  const bad = new Set<number>();

  const scan = (cells: number[]) => {
    const byValue = new Map<number, number[]>();
    for (const i of cells) {
      const v = grid[i];
      if (v === 0) continue;
      const list = byValue.get(v);
      if (list) list.push(i);
      else byValue.set(v, [i]);
    }
    for (const dup of byValue.values()) {
      if (dup.length > 1) for (const i of dup) bad.add(i);
    }
  };

  for (let r = 0; r < size; r++) scan(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) scan(Array.from({ length: size }, (_, r) => r * size + c));
  for (let r0 = 0; r0 < size; r0 += bRows) {
    for (let c0 = 0; c0 < size; c0 += bCols) {
      const cells: number[] = [];
      for (let r = r0; r < r0 + bRows; r++) {
        for (let c = c0; c < c0 + bCols; c++) cells.push(r * size + c);
      }
      scan(cells);
    }
  }
  return [...bad].sort((a, b) => a - b);
}

/** Все клетки заполнены (без проверки корректности — её даёт conflicts()). */
export function isComplete(grid: Grid): boolean {
  return grid.every((v) => v !== 0);
}
