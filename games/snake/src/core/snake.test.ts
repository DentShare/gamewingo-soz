import { describe, it, expect } from 'vitest';
import {
  createSnakeGame, tickMs, OPPOSITE, COLS, ROWS, START_LENGTH, BASE_TICK_MS, MIN_TICK_MS,
  type Dir, type SnakeGame, type StepResult,
} from './snake';
import { computeScore, POINTS_PER_FOOD, MAX_SCORE, clampScore } from './score';
import { mulberry32 } from './rng';

/** RNG, который всегда выбирает первую свободную клетку — еда встаёт в угол (0,0). */
const cornerRng = () => 0;

const D: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function onBody(g: SnakeGame, p: { x: number; y: number }): boolean {
  return g.body.some((s) => s.x === p.x && s.y === p.y);
}

/** Безопасен ли шаг в направлении `d` (не разворот, не стена, не тело). */
function safe(g: SnakeGame, d: Dir): boolean {
  if (d === OPPOSITE[g.dir]) return false;
  const h = g.body[0];
  const p = { x: h.x + D[d].x, y: h.y + D[d].y };
  if (p.x < 0 || p.y < 0 || p.x >= g.cols || p.y >= g.rows) return false;
  const willEat = p.x === g.food.x && p.y === g.food.y;
  const blocking = willEat ? g.body : g.body.slice(0, -1);
  return !blocking.some((s) => s.x === p.x && s.y === p.y);
}

/** Автопилот для интеграционных проверок: идёт к еде, пока это безопасно. */
function autoStep(g: SnakeGame): StepResult {
  const h = g.body[0];
  const f = g.food;
  const wanted: Dir[] = [];
  if (f.x > h.x) wanted.push('right');
  else if (f.x < h.x) wanted.push('left');
  if (f.y > h.y) wanted.push('down');
  else if (f.y < h.y) wanted.push('up');
  const pick = wanted.find((d) => safe(g, d)) ?? DIRS.find((d) => safe(g, d));
  if (pick && pick !== g.dir) g.turn(pick);
  return g.step();
}

describe('createSnakeGame: движение', () => {
  it('ползёт в текущем направлении, длина без еды не меняется', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    const head = { ...g.body[0] };
    expect(g.length).toBe(START_LENGTH);
    expect(g.dir).toBe('right');

    for (let i = 1; i <= 4; i++) {
      const r = g.step();
      expect(r).toEqual({ ate: false, over: false });
      expect(g.body[0]).toEqual({ x: head.x + i, y: head.y });
      expect(g.length).toBe(START_LENGTH);
      expect(g.score).toBe(0);
    }
    // Тело тянется за головой единой цепочкой.
    for (let i = 1; i < g.body.length; i++) {
      const a = g.body[i - 1];
      const b = g.body[i];
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });

  it('стартовая еда не лежит на теле', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = createSnakeGame(COLS, ROWS, mulberry32(seed));
      expect(onBody(g, g.food)).toBe(false);
    }
  });
});

describe('createSnakeGame: еда', () => {
  it('поедание удлиняет змейку на 1 и добавляет очки', () => {
    const g = createSnakeGame(COLS, ROWS, mulberry32(3));
    let guard = 0;
    let res: StepResult = { ate: false, over: false };
    const lenBefore = g.length;
    const scoreBefore = g.score;
    while (!res.ate && !g.isOver && guard++ < 500) res = autoStep(g);

    expect(res.ate).toBe(true);
    expect(g.length).toBe(lenBefore + 1);
    expect(g.eaten).toBe(1);
    expect(g.score).toBe(scoreBefore + POINTS_PER_FOOD);
  });

  it('новая еда никогда не появляется на теле (много итераций, фиксированный seed)', () => {
    const g = createSnakeGame(COLS, ROWS, mulberry32(2024));
    let eaten = 0;
    let steps = 0;
    while (!g.isOver && steps++ < 3000) {
      const r = autoStep(g);
      if (r.ate) eaten++;
      expect(onBody(g, g.food)).toBe(false);
    }
    expect(eaten).toBeGreaterThan(10);
    expect(g.score).toBe(eaten * POINTS_PER_FOOD);
    expect(g.length).toBe(START_LENGTH + eaten);
  });
});

describe('createSnakeGame: повороты и буфер ввода', () => {
  it('разворот на 180° игнорируется — курс сохраняется', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    const head = { ...g.body[0] };
    g.turn('left'); // против текущего 'right'
    g.step();
    expect(g.dir).toBe('right');
    expect(g.body[0]).toEqual({ x: head.x + 1, y: head.y });
  });

  it('буфер ввода: два быстрых поворота применяются на двух тиках подряд', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    const head = { ...g.body[0] };
    g.turn('down');
    g.turn('left'); // второй свайп до тика — не теряется

    g.step();
    expect(g.dir).toBe('down');
    expect(g.body[0]).toEqual({ x: head.x, y: head.y + 1 });

    g.step();
    expect(g.dir).toBe('left');
    expect(g.body[0]).toEqual({ x: head.x - 1, y: head.y + 1 });
  });

  it('разворот относительно уже поставленной в буфер команды тоже игнорируется', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    g.turn('down');
    g.turn('up'); // разворот относительно 'down' из буфера
    g.step();
    expect(g.dir).toBe('down');
    g.step();
    expect(g.dir).toBe('down');
  });
});

describe('createSnakeGame: столкновения', () => {
  it('стена → over', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    g.turn('up');
    let res: StepResult = { ate: false, over: false };
    // Голова стартует в середине поля: до верхней стены ровно ROWS/2 шагов.
    for (let i = 0; i < ROWS && !res.over; i++) res = g.step();
    expect(res.over).toBe(true);
    expect(g.isOver).toBe(true);
  });

  it('собственное тело → over (петля 2×2 при длине 5)', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    expect(g.length).toBeGreaterThanOrEqual(5);
    g.turn('down');
    expect(g.step().over).toBe(false);
    g.turn('left');
    expect(g.step().over).toBe(false);
    g.turn('up');
    const res = g.step(); // возвращаемся в клетку собственного тела
    expect(res).toEqual({ ate: false, over: true });
    expect(g.isOver).toBe(true);
  });

  it('после конца партии шаги ничего не меняют', () => {
    const g = createSnakeGame(COLS, ROWS, cornerRng);
    g.turn('up');
    while (!g.isOver) g.step();
    const score = g.score;
    const length = g.length;
    const head = { ...g.body[0] };
    for (let i = 0; i < 5; i++) {
      expect(g.step()).toEqual({ ate: false, over: true });
    }
    expect(g.score).toBe(score);
    expect(g.length).toBe(length);
    expect(g.body[0]).toEqual(head);
  });
});

describe('скорость', () => {
  it('интервал тика убывает с длиной и не опускается ниже пола', () => {
    expect(tickMs(START_LENGTH)).toBe(BASE_TICK_MS);
    expect(tickMs(START_LENGTH + 1)).toBeLessThan(tickMs(START_LENGTH));
    expect(tickMs(START_LENGTH + 10)).toBeLessThan(tickMs(START_LENGTH + 1));
    expect(tickMs(1000)).toBe(MIN_TICK_MS);
    for (let n = START_LENGTH; n < 400; n++) {
      expect(tickMs(n + 1)).toBeLessThanOrEqual(tickMs(n));
      expect(tickMs(n)).toBeGreaterThanOrEqual(MIN_TICK_MS);
    }
  });

  it('speedMs() партии ускоряется после съеденной еды', () => {
    const g = createSnakeGame(COLS, ROWS, mulberry32(11));
    const before = g.speedMs();
    let guard = 0;
    let res: StepResult = { ate: false, over: false };
    while (!res.ate && !g.isOver && guard++ < 500) res = autoStep(g);
    expect(res.ate).toBe(true);
    expect(g.speedMs()).toBeLessThan(before);
  });
});

describe('детерминированность', () => {
  it('одинаковый seed → одинаковая партия', () => {
    const run = () => {
      const g = createSnakeGame(COLS, ROWS, mulberry32(777));
      const trace: string[] = [];
      let steps = 0;
      while (!g.isOver && steps++ < 400) {
        autoStep(g);
        trace.push(`${g.body[0].x},${g.body[0].y}|${g.food.x},${g.food.y}|${g.score}`);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it('разные seed дают разную раскладку еды', () => {
    const a = createSnakeGame(COLS, ROWS, mulberry32(1)).food;
    const b = createSnakeGame(COLS, ROWS, mulberry32(9999)).food;
    expect(`${a.x},${a.y}`).not.toBe(`${b.x},${b.y}`);
  });
});

describe('score', () => {
  it('100 очков за еду, ноль без еды', () => {
    expect(computeScore({ eaten: 0 })).toBe(0);
    expect(computeScore({ eaten: 7 })).toBe(700);
  });

  it('счёт ограничен антифрод-потолком', () => {
    expect(computeScore({ eaten: 10_000 })).toBe(MAX_SCORE);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(1234.6)).toBe(1235);
  });
});
