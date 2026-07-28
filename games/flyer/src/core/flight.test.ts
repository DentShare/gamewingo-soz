import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng';
import {
  createFlight, FLOOR_Y, GAP_H, HERO_H, HERO_START_Y, HERO_W, HERO_X, type Flight,
} from './flight';

const FRAME = 16; // типичный кадр 60 fps

function make(seed = 7): Flight {
  return createFlight(mulberry32(seed));
}

/** Ближайшая непройденная стена (та, к которой летит герой). */
function nextObstacle(f: Flight) {
  return f.obstacles.find((o) => !o.passed) ?? f.obstacles[f.obstacles.length - 1];
}

/**
 * Автопилот: держит героя на высоте `targetY` (или в центре ближайшего проёма),
 * возвращает сколько раз сработал `scored`.
 */
function autopilot(f: Flight, frames: number, targetY?: (f: Flight) => number): number {
  let scored = 0;
  for (let i = 0; i < frames && !f.isOver; i++) {
    const target = targetY ? targetY(f) : nextObstacle(f).gapY + GAP_H / 2;
    if (f.y > target) f.flap();
    if (f.step(FRAME).scored) scored++;
  }
  return scored;
}

describe('createFlight — старт и гравитация', () => {
  it('до первого тапа герой висит на месте', () => {
    const f = make();
    const before = f.obstacles[0].x;
    for (let i = 0; i < 30; i++) f.step(FRAME);
    expect(f.started).toBe(false);
    expect(f.y).toBe(HERO_START_Y);
    expect(f.obstacles[0].x).toBe(before);
  });

  it('после старта гравитация опускает героя без тапов', () => {
    const f = make();
    f.flap();
    expect(f.started).toBe(true);
    for (let i = 0; i < 60; i++) f.step(FRAME); // ~960 мс свободного падения
    expect(f.y).toBeGreaterThan(HERO_START_Y);
    expect(f.vy).toBeGreaterThan(0);
  });

  it('flap() меняет знак скорости — герой идёт вверх', () => {
    const f = make();
    f.flap();
    for (let i = 0; i < 30; i++) f.step(FRAME);
    expect(f.vy).toBeGreaterThan(0); // падает
    f.flap();
    expect(f.vy).toBeLessThan(0);    // пошёл вверх
    const y0 = f.y;
    f.step(FRAME);
    expect(f.y).toBeLessThan(y0);
  });
});

describe('createFlight — смерть', () => {
  it('падение на пол заканчивает партию', () => {
    const f = make();
    f.flap();
    // Один тап на старте и больше ничего: герой успевает упасть на землю
    // раньше, чем первая стена доедет до него.
    let over = false;
    for (let i = 0; i < 400 && !over; i++) over = f.step(FRAME).over;
    expect(over).toBe(true);
    expect(f.isOver).toBe(true);
    expect(f.cause).toBe('floor');
    expect(f.y + HERO_H / 2).toBeLessThanOrEqual(FLOOR_Y);
    // Погибли именно о пол: первая стена ещё не доехала до героя.
    expect(f.obstacles[0].x).toBeGreaterThan(HERO_X + HERO_W / 2);
  });

  it('вылет за потолок заканчивает партию', () => {
    const f = make();
    let over = false;
    for (let i = 0; i < 400 && !over; i++) {
      f.flap();                       // тапаем каждый кадр — упираемся в потолок
      over = f.step(FRAME).over;
    }
    expect(over).toBe(true);
    expect(f.cause).toBe('ceiling');
  });

  it('столкновение со стеной заканчивает партию', () => {
    // Ищем сид, где у первой случайной стены проём достаточно низко:
    // тогда середина верхней стены — безопасная от потолка цель для «тарана».
    let f = make();
    let wall = f.obstacles[1];
    for (let seed = 1; seed < 200 && wall.gapY < 200; seed++) {
      f = make(seed);
      wall = f.obstacles[1];
    }
    expect(wall.gapY).toBeGreaterThanOrEqual(200);

    const targetY = wall.gapY / 2; // строго внутри верхней стены
    f.flap();
    autopilot(f, 900, () => targetY);

    expect(f.isOver).toBe(true);
    expect(f.cause).toBe('wall');
    // Погибли именно на стене: до пола и потолка далеко.
    expect(f.y - HERO_H / 2).toBeGreaterThan(0);
    expect(f.y + HERO_H / 2).toBeLessThan(FLOOR_Y);
  });
});

describe('createFlight — счёт', () => {
  it('первый проём засчитывается ровно один раз', () => {
    const f = make();
    const first = f.obstacles[0];
    f.flap();
    let scoredFrames = 0;
    for (let i = 0; i < 400 && !f.isOver && !first.passed; i++) {
      const target = nextObstacle(f).gapY + GAP_H / 2;
      if (f.y > target) f.flap();
      if (f.step(FRAME).scored) scoredFrames++;
    }
    expect(first.passed).toBe(true);
    expect(f.score).toBe(1);
    expect(scoredFrames).toBe(1);

    // Дальше эта же стена уезжает влево и повторно не считается.
    for (let i = 0; i < 20 && !f.isOver; i++) f.step(FRAME);
    expect(f.score).toBe(1);
  });

  it('счёт равен числу событий scored', () => {
    const f = make(3);
    f.flap();
    const events = autopilot(f, 1500);
    expect(f.score).toBe(events);
    expect(f.score).toBeGreaterThan(3); // автопилот действительно летит
  });

  it('после конца партии счёт больше не меняется', () => {
    const f = make();
    f.flap();
    while (!f.isOver) f.step(FRAME); // падаем на пол
    const frozen = f.score;
    for (let i = 0; i < 100; i++) {
      const r = f.step(FRAME);
      expect(r.over).toBe(true);
      expect(r.scored).toBe(false);
    }
    expect(f.score).toBe(frozen);
  });
});

describe('createFlight — геометрия и детерминированность', () => {
  it('герой на фиксированном X, стены едут влево и ускоряются', () => {
    const f = make();
    const x0 = f.obstacles[0].x;
    const v0 = f.speed;
    f.flap();
    autopilot(f, 600);
    expect(f.obstacles[0].x).toBeLessThan(x0);
    expect(f.speed).toBeGreaterThan(v0); // скорость растёт со счётом
  });

  it('проём всегда одной высоты и внутри поля', () => {
    const f = make(11);
    f.flap();
    autopilot(f, 1200);
    for (const o of f.obstacles) {
      expect(o.gapH).toBe(GAP_H);
      expect(o.gapY).toBeGreaterThanOrEqual(0);
      expect(o.gapY + o.gapH).toBeLessThanOrEqual(FLOOR_Y);
    }
  });

  it('одинаковый seed → одинаковая последовательность проёмов', () => {
    const gaps = (seed: number) => {
      const f = make(seed);
      f.flap();
      const seen: number[] = [];
      for (let i = 0; i < 1200 && !f.isOver; i++) {
        const target = nextObstacle(f).gapY + GAP_H / 2;
        if (f.y > target) f.flap();
        f.step(FRAME);
        for (const o of f.obstacles) if (!seen.includes(o.gapY)) seen.push(o.gapY);
      }
      return seen;
    };
    expect(gaps(42)).toEqual(gaps(42));
    expect(gaps(42)).not.toEqual(gaps(43));
    expect(gaps(42).length).toBeGreaterThan(4);
  });

  it('фиксированный шаг: 1×32мс эквивалентны 2×16мс', () => {
    const a = make(5);
    const b = make(5);
    a.flap();
    b.flap();
    for (let i = 0; i < 20; i++) {
      a.step(32);
      b.step(16);
      b.step(16);
    }
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.obstacles[0].x).toBeCloseTo(b.obstacles[0].x, 6);
  });
});
