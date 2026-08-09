import { shuffle } from './rng';

/**
 * Чистая логика пазла: кусочки, их правильные места и проверка сборки.
 * Без Phaser и DOM — сцена только рисует то, что здесь посчитано.
 *
 * Кусочек обозначается индексом своего правильного слота: слот `row * cols + col`.
 * Так проверка «на месте ли» сводится к сравнению двух чисел.
 */

export interface JigsawOptions {
  cols: number;
  rows: number;
}

export type DropResult = 'placed' | 'wrong' | 'busy';

export interface JigsawGame {
  readonly cols: number;
  readonly rows: number;
  readonly total: number;
  /** Сколько кусочков уже на своих местах. */
  readonly placed: number;
  /** Сколько раз кусочек положили не туда. Метрика звёзд. */
  readonly wrongDrops: number;
  readonly isComplete: boolean;
  /** Кусочки, которые ещё не поставлены, в порядке выдачи в лоток. */
  readonly pending: readonly number[];
  isPlaced(piece: number): boolean;
  /** Попытка положить кусочек в слот. */
  drop(piece: number, slot: number): DropResult;
}

export function createJigsawGame(
  opts: JigsawOptions,
  rnd: () => number = Math.random,
): JigsawGame {
  const cols = Math.max(2, Math.round(opts.cols));
  const rows = Math.max(2, Math.round(opts.rows));
  const total = cols * rows;

  const done = new Set<number>();
  // Порядок выдачи кусочков в лоток перемешан, иначе пазл собирается «по строкам».
  let pending: number[] = shuffle(Array.from({ length: total }, (_, i) => i), rnd);
  let wrongDrops = 0;

  return {
    cols,
    rows,
    total,
    get placed() { return done.size; },
    get wrongDrops() { return wrongDrops; },
    get isComplete() { return done.size >= total; },
    get pending() { return pending; },

    isPlaced(piece: number) { return done.has(piece); },

    drop(piece: number, slot: number): DropResult {
      if (done.has(piece) || done.has(slot)) return 'busy';
      if (piece !== slot) {
        wrongDrops++;
        return 'wrong';
      }
      done.add(piece);
      pending = pending.filter((p) => p !== piece);
      return 'placed';
    },
  };
}

/** Центр слота в координатах поля: левый верхний угол поля — (0, 0). */
export function slotCenter(
  slot: number,
  cols: number,
  pieceW: number,
  pieceH: number,
): { x: number; y: number } {
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  return { x: col * pieceW + pieceW / 2, y: row * pieceH + pieceH / 2 };
}

/**
 * Ближайший слот к точке. Промах дальше `maxDist` от центра слота — не бросок
 * в слот вовсе: кусочек просто вернётся в лоток, и ошибка не засчитается.
 */
export function nearestSlot(
  x: number,
  y: number,
  cols: number,
  rows: number,
  pieceW: number,
  pieceH: number,
  maxDist: number,
): number | null {
  const col = Math.floor(x / pieceW);
  const row = Math.floor(y / pieceH);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const slot = row * cols + col;
  const c = slotCenter(slot, cols, pieceW, pieceH);
  return Math.hypot(x - c.x, y - c.y) <= maxDist ? slot : null;
}
