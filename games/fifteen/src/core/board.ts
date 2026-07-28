export type LevelId = '3x3' | '4x4';

export interface LevelSpec {
  /** Сторона поля (3 → плитки 1..8, 4 → 1..15). */
  size: number;
  /** Длина случайного блуждания при генерации расклада. */
  walk: number;
}

export const LEVELS: Record<LevelId, LevelSpec> = {
  '3x3': { size: 3, walk: 80 },
  '4x4': { size: 4, walk: 160 },
};

/** Собранное поле: 1..N−1 по порядку, пустая (0) в последней клетке. */
export function solvedTiles(size: number): number[] {
  const n = size * size;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 0 : i + 1));
}

function isSolvedTiles(tiles: readonly number[]): boolean {
  const n = tiles.length;
  return tiles.every((v, i) => v === (i === n - 1 ? 0 : i + 1));
}

/** Соседи клетки i по вертикали/горизонтали. */
function neighbors(i: number, size: number): number[] {
  const row = Math.floor(i / size);
  const col = i % size;
  const out: number[] = [];
  if (row > 0) out.push(i - size);
  if (row < size - 1) out.push(i + size);
  if (col > 0) out.push(i - 1);
  if (col < size - 1) out.push(i + 1);
  return out;
}

/**
 * Случайное блуждание: k валидных ходов без немедленной отмены предыдущего.
 * Мутирует `tiles`, возвращает индексы сдвинутых клеток по порядку.
 * Так как каждый шаг — легальный ход, полученный расклад ГАРАНТИРОВАННО решаем.
 */
export function randomWalk(tiles: number[], size: number, k: number, rng: () => number): number[] {
  const moved: number[] = [];
  let empty = tiles.indexOf(0);
  let prevEmpty = -1;
  for (let s = 0; s < k; s++) {
    const cand = neighbors(empty, size).filter((c) => c !== prevEmpty);
    const c = cand[Math.floor(rng() * cand.length)];
    tiles[empty] = tiles[c];
    tiles[c] = 0;
    prevEmpty = empty;
    empty = c;
    moved.push(c);
  }
  return moved;
}

/** Чистое состояние пятнашек: без Phaser, без таймеров. 0 — пустая клетка. */
export interface Board {
  readonly size: number;
  readonly tiles: readonly number[];
  /** Успешных ходов с начала партии. */
  readonly moves: number;
  canMove(i: number): boolean;
  /** Сдвигает плитку i в пустую клетку. true — ход сделан. */
  move(i: number): boolean;
  isSolved(): boolean;
}

/** Фабрика поверх готового расклада (для тестов и генератора). */
export function createBoardFromTiles(tiles: readonly number[], size: number): Board {
  const t = tiles.slice();
  let moves = 0;

  const emptyIndex = () => t.indexOf(0);
  const canMove = (i: number) =>
    i >= 0 && i < t.length && t[i] !== 0 && neighbors(emptyIndex(), size).includes(i);

  return {
    size,
    get tiles() { return t; },
    get moves() { return moves; },
    canMove,
    move(i) {
      if (!canMove(i)) return false;
      const e = emptyIndex();
      t[e] = t[i];
      t[i] = 0;
      moves++;
      return true;
    },
    isSolved: () => isSolvedTiles(t),
  };
}

/**
 * Новая партия: блуждание из собранного состояния (см. `randomWalk`).
 * Если после блуждания поле случайно собрано — повторяем.
 */
export function createBoard(size: number, rng: () => number): Board {
  const k = size === 3 ? LEVELS['3x3'].walk : size === 4 ? LEVELS['4x4'].walk : size * size * 10;
  let tiles: number[];
  do {
    tiles = solvedTiles(size);
    randomWalk(tiles, size, k, rng);
  } while (isSolvedTiles(tiles));
  return createBoardFromTiles(tiles, size);
}
