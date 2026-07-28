/**
 * Чистое ядро «2048»: поле 4×4, сдвиги, слияния, спавн.
 * Без Phaser и DOM — RNG инжектится (mulberry32), состояние тестируемо напрямую.
 */

export type Dir = 'left' | 'right' | 'up' | 'down';

export const SIZE = 4;

export interface MergeInfo {
  /** Номинал получившейся плитки (сумма двух слитых). */
  value: number;
  /** Позиция получившейся плитки ПОСЛЕ сдвига (до спавна). */
  row: number;
  col: number;
}

export interface ApplyResult {
  cells: number[][];
  moved: boolean;
  /** Прибавка к счёту: сумма номиналов всех слитых плиток. */
  gained: number;
  merges: MergeInfo[];
}

/** Координаты клеток линии `line` в порядке «от края движения к хвосту». */
function lineCoords(dir: Dir, line: number): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < SIZE; i++) {
    switch (dir) {
      case 'left': coords.push([line, i]); break;
      case 'right': coords.push([line, SIZE - 1 - i]); break;
      case 'up': coords.push([i, line]); break;
      case 'down': coords.push([SIZE - 1 - i, line]); break;
    }
  }
  return coords;
}

/**
 * Чистый ход без спавна: сдвиг всех плиток + слияния.
 * Каждая плитка сливается максимум один раз за ход; сливается пара, ближняя к краю движения.
 */
export function applyMove(cells: readonly (readonly number[])[], dir: Dir): ApplyResult {
  const out = cells.map((row) => row.map(() => 0));
  let gained = 0;
  const merges: MergeInfo[] = [];

  for (let line = 0; line < SIZE; line++) {
    const coords = lineCoords(dir, line);
    const vals = coords.map(([r, c]) => cells[r][c]).filter((v) => v !== 0);
    const packed: number[] = [];
    let i = 0;
    while (i < vals.length) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const merged = vals[i] * 2;
        packed.push(merged);
        gained += merged;
        const [r, c] = coords[packed.length - 1];
        merges.push({ value: merged, row: r, col: c });
        i += 2; // обе плитки потрачены — повторное слияние в этот ход невозможно
      } else {
        packed.push(vals[i]);
        i += 1;
      }
    }
    packed.forEach((v, k) => {
      const [r, c] = coords[k];
      out[r][c] = v;
    });
  }

  const moved = out.some((row, r) => row.some((v, c) => v !== cells[r][c]));
  return { cells: out, moved, gained, merges };
}

export interface MoveResult {
  moved: boolean;
  merges: { value: number }[];
}

export interface Grid2048 {
  /** 4×4, [row][col], 0 — пусто. */
  readonly cells: readonly (readonly number[])[];
  /** Сумма номиналов всех слитых плиток (стандарт 2048). */
  readonly score: number;
  /** Количество результативных ходов. */
  readonly moves: number;
  maxTile(): number;
  /** true, когда нет ни одного возможного хода. */
  isOver(): boolean;
  /** true после первого появления плитки 2048 (игра продолжается). */
  hasWon(): boolean;
  /** Сдвиг + слияния; при результативном ходе — спавн новой плитки (2 с p=0.9, 4 с p=0.1). */
  move(dir: Dir): MoveResult;
}

/** Полный снимок партии для восстановления после выхода из игры. */
export interface Grid2048State {
  cells: number[][];
  score?: number;
  moves?: number;
  won?: boolean;
}

/**
 * Фабрика ядра.
 * `initial` — стартовое состояние (глубоко копируется):
 *   • `number[][]` — только клетки (счёт/ходы с нуля) — удобно для тестов;
 *   • `Grid2048State` — полное восстановление сохранённой партии (клетки + счёт + ходы + флаг победы).
 * Без `initial` спавнятся две стартовые плитки.
 */
export function createGrid2048(rng: () => number, initial?: number[][] | Grid2048State): Grid2048 {
  const state: Grid2048State | undefined = Array.isArray(initial) ? { cells: initial } : initial;
  let cells: number[][] = state
    ? state.cells.map((row) => row.slice())
    : Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  let score = state?.score ?? 0;
  let moves = state?.moves ?? 0;
  let won = (state?.won ?? false) || cells.some((row) => row.some((v) => v >= 2048));

  function spawn(): void {
    const empties: Array<[number, number]> = [];
    cells.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empties.push([r, c]); }));
    if (empties.length === 0) return;
    const [r, c] = empties[Math.floor(rng() * empties.length)];
    cells[r][c] = rng() < 0.9 ? 2 : 4;
  }

  if (!state) { spawn(); spawn(); }

  return {
    get cells() { return cells; },
    get score() { return score; },
    get moves() { return moves; },
    maxTile() { return Math.max(...cells.flat()); },
    hasWon() { return won; },
    isOver() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = cells[r][c];
          if (v === 0) return false;
          if (c + 1 < SIZE && cells[r][c + 1] === v) return false;
          if (r + 1 < SIZE && cells[r + 1][c] === v) return false;
        }
      }
      return true;
    },
    move(dir) {
      const res = applyMove(cells, dir);
      if (res.moved) {
        cells = res.cells;
        score += res.gained;
        moves += 1;
        if (res.merges.some((m) => m.value >= 2048)) won = true;
        spawn();
      }
      return { moved: res.moved, merges: res.merges.map((m) => ({ value: m.value })) };
    },
  };
}
