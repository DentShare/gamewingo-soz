/**
 * Чистая механика «Полёта»: герой на фиксированном X падает под гравитацией,
 * тап даёт импульс вверх, навстречу едут стены с проёмом.
 * Без Phaser и DOM — только числа, чтобы логика была тестируемой и детерминированной.
 *
 * Симуляция идёт фиксированным шагом (`STEP_MS`): `step(dtMs)` копит время и
 * прокручивает целые тики, поэтому результат не зависит от частоты кадров.
 */

// ── Геометрия поля (совпадает с размером сцены Phaser) ───────────────────────
export const FIELD_W = 400;
export const FIELD_H = 720;
/** Высота земли внизу — «пол». */
export const GROUND_H = 84;
/** Y пола: ниже герою нельзя. */
export const FLOOR_Y = FIELD_H - GROUND_H; // 636

// ── Герой ────────────────────────────────────────────────────────────────────
export const HERO_X = 118;
export const HERO_W = 34;
export const HERO_H = 30;
export const HERO_START_Y = 280;

// ── Препятствия ──────────────────────────────────────────────────────────────
export const WALL_W = 62;
/** Высота проёма фиксирована и комфортна (≈6 ростов героя). */
export const GAP_H = 190;
export const GAP_MIN_Y = 70;
export const GAP_MAX_Y = FLOOR_Y - GAP_H - 70; // 376
/** Расстояние между соседними стенами по X. */
export const SPACING = 230;
/** Первая стена стоит на виду, её проём выровнен по стартовой высоте героя (даром). */
export const FIRST_X = 300;
/** Пока последняя стена ближе этого X — спавним следующую. */
const SPAWN_AHEAD_X = FIELD_W + 40;

// ── Физика ───────────────────────────────────────────────────────────────────
export const GRAVITY = 1500;      // px/с²
export const FLAP_VY = -430;      // px/с, импульс вверх
export const MAX_FALL_VY = 700;   // предел скорости падения
export const SPEED_START = 150;   // px/с, скорость набегания стен
export const SPEED_MAX = 260;
/** Прибавка скорости за каждый пройденный проём. */
export const SPEED_PER_SCORE = 2.2;

/** Шаг симуляции: 100 Гц. */
export const STEP_MS = 10;
const STEP_S = STEP_MS / 1000;
/** Больше 100 мс за кадр не отыгрываем (возврат из фона не должен «телепортировать» героя). */
const MAX_FRAME_MS = 100;

interface MutObstacle { x: number; gapY: number; gapH: number; passed: boolean; }

/** Стена с проёмом. `x` — левый край стены, `gapY` — верх проёма. */
export type Obstacle = Readonly<MutObstacle>;

/** Что убило героя (для эффектов и тестов). */
export type OverCause = 'none' | 'floor' | 'ceiling' | 'wall';

export interface StepResult {
  /** В этом кадре засчитан хотя бы один пройденный проём. */
  scored: boolean;
  /** Партия окончена (в этом кадре или раньше). */
  over: boolean;
}

export interface Flight {
  readonly y: number;
  readonly vy: number;
  readonly obstacles: readonly Obstacle[];
  readonly score: number;
  readonly isOver: boolean;
  /** Физика запускается только с первого тапа — герой висит и ждёт. */
  readonly started: boolean;
  readonly cause: OverCause;
  /** Текущая скорость стен, px/с. */
  readonly speed: number;
  /** Импульс вверх (и старт партии, если она ещё не началась). */
  flap(): void;
  step(dtMs: number): StepResult;
}

export function createFlight(rnd: () => number): Flight {
  let y = HERO_START_Y;
  let vy = 0;
  let score = 0;
  let over = false;
  let started = false;
  let cause: OverCause = 'none';
  let acc = 0;

  const obstacles: MutObstacle[] = [
    { x: FIRST_X, gapY: HERO_START_Y - GAP_H / 2, gapH: GAP_H, passed: false },
  ];
  fill();

  function speed(): number {
    return Math.min(SPEED_MAX, SPEED_START + score * SPEED_PER_SCORE);
  }

  /** Держим одну стену за правым краем экрана — новых объектов на кадр не создаём. */
  function fill(): void {
    while (obstacles[obstacles.length - 1].x < SPAWN_AHEAD_X) {
      const gapY = GAP_MIN_Y + Math.floor(rnd() * (GAP_MAX_Y - GAP_MIN_Y + 1));
      obstacles.push({
        x: obstacles[obstacles.length - 1].x + SPACING,
        gapY,
        gapH: GAP_H,
        passed: false,
      });
    }
  }

  /** Прямоугольник героя против стены: пересечение по X и выход за проём по Y. */
  function hitsWall(o: MutObstacle): boolean {
    const left = HERO_X - HERO_W / 2;
    const right = HERO_X + HERO_W / 2;
    if (o.x + WALL_W <= left || o.x >= right) return false;
    return y - HERO_H / 2 < o.gapY || y + HERO_H / 2 > o.gapY + o.gapH;
  }

  function die(reason: OverCause): void {
    over = true;
    cause = reason;
  }

  function tick(): boolean {
    vy = Math.min(MAX_FALL_VY, vy + GRAVITY * STEP_S);
    y += vy * STEP_S;

    const dx = speed() * STEP_S;
    let scored = false;
    const heroLeft = HERO_X - HERO_W / 2;
    for (const o of obstacles) {
      o.x -= dx;
      if (!o.passed && o.x + WALL_W < heroLeft) {
        o.passed = true;
        score++;
        scored = true;
      }
    }
    while (obstacles.length > 1 && obstacles[0].x + WALL_W < -10) obstacles.shift();
    fill();

    for (const o of obstacles) {
      if (hitsWall(o)) { die('wall'); return scored; }
    }
    if (y + HERO_H / 2 >= FLOOR_Y) {
      y = FLOOR_Y - HERO_H / 2;
      die('floor');
    } else if (y - HERO_H / 2 <= 0) {
      y = HERO_H / 2;
      die('ceiling');
    }
    return scored;
  }

  return {
    get y() { return y; },
    get vy() { return vy; },
    get obstacles() { return obstacles as readonly Obstacle[]; },
    get score() { return score; },
    get isOver() { return over; },
    get started() { return started; },
    get cause() { return cause; },
    get speed() { return speed(); },

    flap() {
      if (over) return;
      started = true;
      vy = FLAP_VY;
    },

    step(dtMs: number): StepResult {
      if (over) return { scored: false, over: true };
      if (!started) return { scored: false, over: false };
      acc += Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
      let scored = false;
      while (acc >= STEP_MS && !over) {
        acc -= STEP_MS;
        if (tick()) scored = true;
      }
      if (over) acc = 0;
      return { scored, over };
    },
  };
}
