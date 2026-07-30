import { computeScore } from './score';

export interface Point { x: number; y: number }

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface StepResult {
  /** Съедена ли еда на этом тике. */
  ate: boolean;
  /** Партия закончена (стена или собственное тело). */
  over: boolean;
}

/** Размер поля по умолчанию: 15×20 клеток вписываются в портрет 400×720. */
export const COLS = 15;
export const ROWS = 20;

/** Стартовая длина змейки (в клетках). */
export const START_LENGTH = 5;

/** Интервал тика в начале партии и его пол — «потолок скорости». */
export const BASE_TICK_MS = 190;
export const MIN_TICK_MS = 90;
/** На сколько мс ускоряется тик за каждую съеденную еду. */
const TICK_DECAY_MS = 5;

/** Сколько команд поворота помещается в буфер ввода (свайп чуть раньше тика не теряется). */
const QUEUE_MAX = 2;

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** Интервал тика для длины змейки: чем длиннее — тем быстрее, но не быстрее пола. */
export function tickMs(length: number): number {
  const grown = Math.max(0, length - START_LENGTH);
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - grown * TICK_DECAY_MS);
}

/** Чистая логика «Змейки»: сетка, шаг по тику, еда и столкновения. Без Phaser и DOM. */
export interface SnakeGame {
  readonly cols: number;
  readonly rows: number;
  /** Тело змейки, голова первая. */
  readonly body: readonly Point[];
  /** Применённое направление (команды из буфера применяются в `step()`). */
  readonly dir: Dir;
  readonly food: Point;
  readonly score: number;
  /** Сколько еды съедено за партию. */
  readonly eaten: number;
  readonly isOver: boolean;
  readonly length: number;
  /** Поставить направление в буфер ввода; разворот на 180° игнорируется. */
  turn(dir: Dir): void;
  /** Один игровой тик. */
  step(): StepResult;
  /** Текущий интервал тика, мс. */
  speedMs(): number;
}

/**
 * Создаёт партию. `rnd` — инжектируемый RNG (например `mulberry32(seed)`),
 * благодаря чему раскладка еды воспроизводима в тестах.
 */
export interface SnakeOptions {
  /**
   * Фаза старта: сколько «съеденного» засчитывается змейке до первого хода.
   * Змейка выходит длиннее и быстрее — поздний уровень не начинается с медленного вступления.
   */
  startPhase?: number;
}

export function createSnakeGame(
  cols: number = COLS,
  rows: number = ROWS,
  rnd: () => number = Math.random,
  opts: SnakeOptions = {},
): SnakeGame {
  // Стартовая длина растёт с фазой, но змейка обязана помещаться в ряд.
  const phase = Math.max(0, Math.round(opts.startPhase ?? 0));
  const startLen = Math.max(2, Math.min(START_LENGTH + phase, cols - 1));
  const hx = Math.floor(cols / 2);
  const hy = Math.floor(rows / 2);

  let body: Point[] = [];
  for (let i = 0; i < startLen; i++) body.push({ x: Math.max(0, hx - i), y: hy });

  let dir: Dir = 'right';
  const queue: Dir[] = [];
  let eaten = 0;
  let over = false;

  const hits = (cells: readonly Point[], p: Point): boolean =>
    cells.some((c) => c.x === p.x && c.y === p.y);

  /** Еда встаёт в случайную СВОБОДНУЮ клетку — никогда на теле змейки. */
  const spawnFood = (): Point => {
    const free: Point[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!hits(body, { x, y })) free.push({ x, y });
      }
    }
    if (!free.length) return { ...body[0] }; // поле заполнено — партия и так закончена
    const i = Math.min(free.length - 1, Math.max(0, Math.floor(rnd() * free.length)));
    return free[i];
  };

  let food: Point = spawnFood();

  return {
    get cols() { return cols; },
    get rows() { return rows; },
    get body() { return body; },
    get dir() { return dir; },
    get food() { return food; },
    get score() { return computeScore({ eaten }); },
    get eaten() { return eaten; },
    get isOver() { return over; },
    get length() { return body.length; },

    turn(next: Dir) {
      if (over) return;
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (next === last || next === OPPOSITE[last]) return; // разворот и дубли не нужны
      if (queue.length >= QUEUE_MAX) return;
      queue.push(next);
    },

    step(): StepResult {
      if (over) return { ate: false, over: true };

      const queued = queue.shift();
      if (queued) dir = queued;

      const d = DELTA[dir];
      const head: Point = { x: body[0].x + d.x, y: body[0].y + d.y };

      // Стена.
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) {
        over = true;
        return { ate: false, over: true };
      }

      const ate = head.x === food.x && head.y === food.y;
      // Хвост уходит из своей клетки на этом же тике — врезаться в него нельзя,
      // кроме случая роста (тогда тело остаётся на месте целиком).
      const blocking = ate ? body : body.slice(0, -1);
      if (hits(blocking, head)) {
        over = true;
        return { ate: false, over: true };
      }

      body = ate ? [head, ...body] : [head, ...body.slice(0, -1)];
      if (ate) {
        eaten++;
        food = spawnFood();
        if (body.length >= cols * rows) over = true; // поле заполнено — партия окончена
      }
      return { ate, over };
    },

    speedMs() { return tickMs(body.length); },
  };
}
