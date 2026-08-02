/**
 * Чистое ядро «Сортировки» (без Phaser/DOM). Ребёнок перетаскивает фигурку
 * в одну из трёх корзин. Проиграть нельзя: ошибка не отнимает очки и не
 * заканчивает партию — текущая фигурка просто остаётся на месте, пробуй ещё.
 */

export type Mode = 'color' | 'shape';
export type Color = 'red' | 'yellow' | 'blue' | 'green';
export type Shape = 'circle' | 'square' | 'triangle' | 'star';

/** Признак, по которому сортируем: цвет ИЛИ форма (в зависимости от режима). */
export type Feature = Color | Shape;

export interface Item {
  color: Color;
  shape: Shape;
}

/** Порядок важен: первые три — база, четвёртый появляется только на поздних уровнях. */
export const COLORS: readonly Color[] = ['red', 'yellow', 'blue', 'green'];
export const SHAPES: readonly Shape[] = ['circle', 'square', 'triangle', 'star'];

/** Фигурок в партии по умолчанию (уровень задаёт своё число). */
export const TOTAL = 12;

/** Сколько корзин бывает: три для малышей, четыре — усложнение поздних уровней. */
export type BinCount = 3 | 4;

export interface DropResult {
  /** Фигурка попала в свою корзину. */
  correct: boolean;
  /** Партия завершена (разложены все `total` фигурок). */
  done: boolean;
}

export interface SortingGame {
  readonly mode: Mode;
  /** Три признака корзин слева направо (цвета или формы) — неизменяемы. */
  readonly bins: readonly Feature[];
  /** Фигурка «в руке»; null только после завершения партии. */
  readonly current: Item | null;
  /** Сколько фигурок разложено верно. */
  readonly placed: number;
  /** Сколько раз промахнулись корзиной (влияет только на звёзды). */
  readonly mistakes: number;
  readonly total: number;
  readonly isDone: boolean;
  /** Признак фигурки, по которому идёт сортировка в текущем режиме. */
  featureOf(item: Item): Feature;
  /** Бросок в корзину `binIndex` (0..2). Верно → выдаётся следующая фигурка. */
  drop(binIndex: number): DropResult;
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/**
 * Фабрика партии. `rng` инжектируется (mulberry32) — партия детерминирована по seed.
 * Генерация: признак сортировки выбирается случайно из трёх корзин, второй признак
 * тоже случаен и на ответ не влияет — так ребёнок учится выделять нужный признак.
 */
export function createSortingGame(
  mode: Mode,
  rng: () => number,
  opts: { total?: number; bins?: BinCount } = {},
): SortingGame {
  const TOTAL_ITEMS = opts.total ?? TOTAL;
  const binCount = opts.bins ?? 3;
  const bins: readonly Feature[] = (mode === 'color' ? COLORS : SHAPES).slice(0, binCount);
  const feature = (item: Item): Feature => (mode === 'color' ? item.color : item.shape);

  // Признак сортировки берётся только из того, что есть в корзинах; второй признак
  // гуляет по всему набору — он на ответ не влияет и учит выделять нужный.
  const sortColors = mode === 'color' ? COLORS.slice(0, binCount) : COLORS;
  const sortShapes = mode === 'shape' ? SHAPES.slice(0, binCount) : SHAPES;
  const nextItem = (): Item => ({ color: pick(sortColors, rng), shape: pick(sortShapes, rng) });

  let current: Item | null = nextItem();
  let placed = 0;
  let mistakes = 0;

  return {
    mode,
    bins,
    get current() { return current; },
    get placed() { return placed; },
    get mistakes() { return mistakes; },
    get total() { return TOTAL_ITEMS; },
    get isDone() { return placed >= TOTAL_ITEMS; },
    featureOf: feature,
    drop(binIndex) {
      // Партия окончена или бросок мимо списка корзин — состояние не меняем.
      if (current === null || placed >= TOTAL_ITEMS) return { correct: false, done: true };
      if (!Number.isInteger(binIndex) || binIndex < 0 || binIndex >= bins.length) {
        return { correct: false, done: false };
      }
      if (bins[binIndex] !== feature(current)) {
        // Ошибка — не штраф: счёт не падает, фигурка остаётся в руке.
        mistakes++;
        return { correct: false, done: false };
      }
      placed++;
      if (placed >= TOTAL_ITEMS) {
        current = null;
        return { correct: true, done: true };
      }
      current = nextItem();
      return { correct: true, done: false };
    },
  };
}
