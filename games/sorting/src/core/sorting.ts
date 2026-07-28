/**
 * Чистое ядро «Сортировки» (без Phaser/DOM). Ребёнок перетаскивает фигурку
 * в одну из трёх корзин. Проиграть нельзя: ошибка не отнимает очки и не
 * заканчивает партию — текущая фигурка просто остаётся на месте, пробуй ещё.
 */

export type Mode = 'color' | 'shape';
export type Color = 'red' | 'yellow' | 'blue';
export type Shape = 'circle' | 'square' | 'triangle';

/** Признак, по которому сортируем: цвет ИЛИ форма (в зависимости от режима). */
export type Feature = Color | Shape;

export interface Item {
  color: Color;
  shape: Shape;
}

export const COLORS: readonly Color[] = ['red', 'yellow', 'blue'];
export const SHAPES: readonly Shape[] = ['circle', 'square', 'triangle'];

/** Фигурок в партии — короткая, гарантированно завершаемая сессия для 3–6 лет. */
export const TOTAL = 12;

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
export function createSortingGame(mode: Mode, rng: () => number): SortingGame {
  const bins: readonly Feature[] = mode === 'color' ? COLORS : SHAPES;
  const feature = (item: Item): Feature => (mode === 'color' ? item.color : item.shape);

  const nextItem = (): Item => ({ color: pick(COLORS, rng), shape: pick(SHAPES, rng) });

  let current: Item | null = nextItem();
  let placed = 0;
  let mistakes = 0;

  return {
    mode,
    bins,
    get current() { return current; },
    get placed() { return placed; },
    get mistakes() { return mistakes; },
    get total() { return TOTAL; },
    get isDone() { return placed >= TOTAL; },
    featureOf: feature,
    drop(binIndex) {
      // Партия окончена или бросок мимо списка корзин — состояние не меняем.
      if (current === null || placed >= TOTAL) return { correct: false, done: true };
      if (!Number.isInteger(binIndex) || binIndex < 0 || binIndex >= bins.length) {
        return { correct: false, done: false };
      }
      if (bins[binIndex] !== feature(current)) {
        // Ошибка — не штраф: счёт не падает, фигурка остаётся в руке.
        mistakes++;
        return { correct: false, done: false };
      }
      placed++;
      if (placed >= TOTAL) {
        current = null;
        return { correct: true, done: true };
      }
      current = nextItem();
      return { correct: true, done: false };
    },
  };
}
