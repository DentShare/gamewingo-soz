import { mulberry32 } from './rng';

/**
 * Чистая логика аркады «Башня»: движение текущего блока, обрезка по перекрытию,
 * идеальные попадания и конец игры. Без Phaser, без DOM, без таймеров.
 * Все координаты — левый край блока в системе поля шириной `fieldWidth`.
 */

/** Ширина игрового поля (координатное пространство ядра). */
export const FIELD_WIDTH = 400;
/** Ширина стартового (нижнего) блока. */
export const START_WIDTH = 120;
/** Промах ≤ этого значения считается идеальным попаданием — ширина не теряется. */
export const PERFECT_EPS = 4;

const BASE_SPEED = 0.16;   // px/мс на старте
const SPEED_STEP = 0.0065; // прирост за каждый установленный блок
const MAX_SPEED = 0.46;    // потолок, чтобы игра оставалась играбельной

/** Скорость текущего блока при `placed` установленных блоках. */
export function speedAt(placed: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + placed * SPEED_STEP);
}

export interface StackBlock {
  /** Левый край. */
  x: number;
  width: number;
}

export interface CurrentBlock extends StackBlock {
  /** +1 — вправо, −1 — влево. */
  dir: 1 | -1;
  /** px/мс. */
  speed: number;
}

export interface DropResult {
  /** Блок лёг на башню (было перекрытие). */
  placed: boolean;
  /** Попадание без потери ширины. */
  perfect: boolean;
  /** Ширина отвалившегося куска (0 при идеальном попадании). */
  cutWidth: number;
  /** Левый край отвалившегося куска. */
  cutX: number;
  /** Игра окончена этим броском. */
  over: boolean;
}

export interface StackOptions {
  /** Seed для детерминированного RNG (стартовые позиции блоков). */
  seed?: number;
  /** Готовый RNG — приоритетнее `seed` (для тестов). */
  rng?: () => number;
  fieldWidth?: number;
  startWidth?: number;
}

export interface StackGame {
  /** Башня снизу вверх; blocks[0] — фундамент. */
  readonly blocks: readonly StackBlock[];
  /** Едущий блок над вершиной. */
  readonly current: Readonly<CurrentBlock>;
  /** Очки: установленный блок = 1, идеальное попадание = ещё +1. */
  readonly score: number;
  /** Сколько блоков установил игрок (без фундамента). */
  readonly placed: number;
  /** Сколько было идеальных попаданий. */
  readonly perfects: number;
  readonly isOver: boolean;
  readonly fieldWidth: number;
  /** Двигает текущий блок, отражая его от краёв поля. */
  tick(dtMs: number): void;
  /** Роняет текущий блок: обрезка по перекрытию либо конец игры. */
  drop(): DropResult;
  /** Поставить текущий блок в конкретную позицию (обучение и тесты). */
  setCurrentX(x: number): void;
}

export function createStackGame(opts: StackOptions = {}): StackGame {
  const fieldWidth = opts.fieldWidth ?? FIELD_WIDTH;
  const startWidth = Math.min(opts.startWidth ?? START_WIDTH, fieldWidth);
  const rnd = opts.rng ?? mulberry32(opts.seed ?? 1);

  const blocks: StackBlock[] = [{ x: (fieldWidth - startWidth) / 2, width: startWidth }];
  let perfects = 0;
  let over = false;

  const spawn = (width: number): CurrentBlock => {
    const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    // Блок появляется у того края, от которого поедет внутрь поля.
    return { x: dir === 1 ? 0 : fieldWidth - width, width, dir, speed: speedAt(blocks.length - 1) };
  };

  let current = spawn(startWidth);

  const maxX = () => Math.max(0, fieldWidth - current.width);

  return {
    get blocks() { return blocks; },
    get current() { return current; },
    get placed() { return blocks.length - 1; },
    get perfects() { return perfects; },
    get score() { return blocks.length - 1 + perfects; },
    get isOver() { return over; },
    get fieldWidth() { return fieldWidth; },

    tick(dtMs) {
      if (over || dtMs <= 0) return;
      const max = maxX();
      if (max <= 0) { current.x = 0; return; }
      let x = current.x + current.dir * current.speed * dtMs;
      // Отражение от краёв; цикл — на случай очень большого dt (лаг/вкладка в фоне).
      while (x < 0 || x > max) {
        if (x < 0) { x = -x; current.dir = 1; }
        if (x > max) { x = 2 * max - x; current.dir = -1; }
      }
      current.x = x;
    },

    drop() {
      if (over) return { placed: false, perfect: false, cutWidth: 0, cutX: current.x, over: true };

      const top = blocks[blocks.length - 1];
      const delta = current.x - top.x;

      // Идеальное попадание: щёлкаем блок ровно на место, ширина сохраняется.
      if (Math.abs(delta) <= PERFECT_EPS) {
        blocks.push({ x: top.x, width: top.width });
        perfects++;
        current = spawn(top.width);
        return { placed: true, perfect: true, cutWidth: 0, cutX: top.x, over: false };
      }

      const left = Math.max(current.x, top.x);
      const right = Math.min(current.x + current.width, top.x + top.width);
      const overlap = right - left;

      // Мимо — башня рушится, весь блок улетает вниз.
      if (overlap <= 0) {
        over = true;
        return { placed: false, perfect: false, cutWidth: current.width, cutX: current.x, over: true };
      }

      const cutWidth = current.width - overlap;
      // Свесилось справа (delta > 0) или слева.
      const cutX = delta > 0 ? left + overlap : current.x;
      blocks.push({ x: left, width: overlap });
      current = spawn(overlap);
      return { placed: true, perfect: false, cutWidth, cutX, over: false };
    },

    setCurrentX(x) {
      current.x = Math.min(Math.max(0, x), maxX());
    },
  };
}
