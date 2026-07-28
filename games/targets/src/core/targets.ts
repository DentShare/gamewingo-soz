/**
 * Ядро аркады «Меткий глаз»: цели вспыхивают в случайных местах поля и живут
 * ограниченное время. Никакого Phaser/DOM — только числа, чтобы логика была
 * детерминированной и покрывалась тестами.
 */

/** Игровое поле в координатах сцены 400×720 (не заходит под HUD). */
export const FIELD = { x: 12, y: 104, w: 376, h: 580 } as const;

/** Партия ровно минута. */
export const ROUND_MS = 60_000;

/** Границы радиуса цели: от самой крупной (старт) до самой мелкой (конец партии). */
export const R_BIG = 46;
export const R_SMALL = 18;

/** Потолок множителя серии. */
export const MAX_MULTIPLIER = 5;

/** Сколько попаданий подряд поднимают множитель на единицу. */
const COMBO_STEP = 4;

/** Каждая N-я цель — золотая (короче живёт, больше очков). */
const GOLDEN_EVERY = 10;

/** Множитель очков за золотую цель. */
const GOLDEN_BONUS = 3;

/** Допуск попадания для пальца (px сверх радиуса). */
const TAP_PAD = 6;

/** Максимальный шаг внутреннего тика — темп не зависит от частоты кадров. */
const SLICE_MS = 50;

/** Пауза до самой первой цели, чтобы игрок увидел поле. */
const FIRST_GAP_MS = 220;

/** Минимальный зазор между целями при спавне. */
const SPACING = 10;

export interface Target {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Время рождения в шкале партии (мс от старта). */
  readonly bornMs: number;
  readonly ttlMs: number;
  readonly golden: boolean;
}

export interface TapResult {
  hit: boolean;
  points: number;
  targetId?: number;
  golden?: boolean;
}

export interface TargetsOptions {
  /** Длительность партии, мс. */
  durationMs: number;
  /** Сколько целей может гореть одновременно. */
  maxAlive: number;
  /** Игровое поле. */
  field: { x: number; y: number; w: number; h: number };
}

export const DEFAULT_OPTIONS: TargetsOptions = {
  durationMs: ROUND_MS,
  maxAlive: 5,
  field: FIELD,
};

export interface TargetsGame {
  /** Живые цели (порядок спавна). Не мутировать. */
  readonly targets: readonly Target[];
  readonly score: number;
  /** Попаданий подряд без промаха и без «протухших» целей. */
  readonly combo: number;
  /** Текущий множитель очков (1…MAX_MULTIPLIER). */
  readonly multiplier: number;
  readonly maxCombo: number;
  readonly hits: number;
  readonly misses: number;
  /** Целей, погасших сами по себе. */
  readonly expired: number;
  readonly elapsedMs: number;
  readonly remainingMs: number;
  readonly isOver: boolean;
  /** Прошедшая доля партии 0…1 — по ней растёт темп. */
  readonly progress: number;
  step(dtMs: number): void;
  tap(x: number, y: number): TapResult;
  /** Принудительный спавн — обучение («вот цель») и тесты. */
  spawnTarget(overrides?: Partial<Omit<Target, 'id' | 'bornMs'>>): Target;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Множитель по длине серии: каждые COMBO_STEP попаданий +1, но не выше потолка. */
export function multiplierFor(combo: number): number {
  if (combo <= 0) return 1;
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP));
}

export interface PointsInput {
  r: number;
  /** Сколько цель прожила до попадания. */
  ageMs: number;
  ttlMs: number;
  golden: boolean;
  multiplier: number;
}

/**
 * Очки за цель: мелкая даёт больше крупной, быстрая реакция — больше медленной,
 * золотая — ×3, всё умножается на множитель серии.
 * Максимум с одной цели: round(40 × 1.45) × 3 × 5 = 870.
 */
export function targetPoints({ r, ageMs, ttlMs, golden, multiplier }: PointsInput): number {
  const sizeFactor = clamp01((R_BIG - r) / (R_BIG - R_SMALL)); // 0 — крупная, 1 — мелкая
  const base = 10 + 30 * sizeFactor;                            // 10…40
  const reaction = ttlMs > 0 ? clamp01(1 - ageMs / ttlMs) : 0;  // 1 — мгновенно, 0 — на излёте
  const speed = 0.55 + 0.9 * reaction;                          // 0.55…1.45
  const gold = golden ? GOLDEN_BONUS : 1;
  return Math.max(1, Math.round(base * speed * gold) * multiplier);
}

/** Диапазон радиусов на момент `p` (0…1): к концу партии цели мельчают. */
function radiusRange(p: number): [number, number] {
  return [lerp(30, 20, p), lerp(R_BIG, 30, p)];
}

/** Время жизни обычной цели на момент `p`. */
function ttlFor(p: number): number {
  return lerp(1700, 950, p);
}

/** Пауза между спавнами на момент `p`. */
function gapFor(p: number): number {
  return lerp(800, 420, p);
}

export function createTargetsGame(
  rng: () => number,
  opts: Partial<TargetsOptions> = {},
): TargetsGame {
  const cfg: TargetsOptions = { ...DEFAULT_OPTIONS, ...opts };
  const field = cfg.field;

  const list: Target[] = [];
  let nextId = 1;
  let spawnCount = 0;
  let spawnAcc = 0;
  let nextGap = FIRST_GAP_MS;

  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let hits = 0;
  let misses = 0;
  let expired = 0;
  let elapsedMs = 0;
  let over = false;

  const progress = () => clamp01(elapsedMs / cfg.durationMs);

  /** Свободна ли точка: не налезает на уже горящие цели. */
  function isFree(x: number, y: number, r: number): boolean {
    for (const t of list) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (Math.hypot(dx, dy) < t.r + r + SPACING) return false;
    }
    return true;
  }

  function place(r: number): { x: number; y: number } {
    const minX = field.x + r;
    const spanX = Math.max(0, field.w - 2 * r);
    const minY = field.y + r;
    const spanY = Math.max(0, field.h - 2 * r);
    let x = minX;
    let y = minY;
    for (let attempt = 0; attempt < 14; attempt++) {
      x = minX + rng() * spanX;
      y = minY + rng() * spanY;
      if (isFree(x, y, r)) break;
    }
    return { x, y };
  }

  function spawn(): Target {
    spawnCount++;
    const p = progress();
    const [lo, hi] = radiusRange(p);
    const golden = spawnCount % GOLDEN_EVERY === 0;
    const r = golden ? lo : lo + rng() * (hi - lo);
    const ttlMs = golden ? ttlFor(p) * 0.62 : ttlFor(p);
    const { x, y } = place(r);
    const t: Target = { id: nextId++, x, y, r, bornMs: elapsedMs, ttlMs, golden };
    list.push(t);
    return t;
  }

  /** Один внутренний тик фиксированной длины: старение + спавн. */
  function tick(ms: number): void {
    elapsedMs += ms;

    for (let i = list.length - 1; i >= 0; i--) {
      if (elapsedMs - list[i].bornMs >= list[i].ttlMs) {
        list.splice(i, 1);
        expired++;
        combo = 0; // «протухшая» цель сбивает серию так же, как промах
      }
    }

    spawnAcc += ms;
    while (spawnAcc >= nextGap) {
      spawnAcc -= nextGap;
      nextGap = gapFor(progress());
      if (list.length < cfg.maxAlive) spawn();
    }
  }

  return {
    get targets() { return list; },
    get score() { return score; },
    get combo() { return combo; },
    get multiplier() { return multiplierFor(combo); },
    get maxCombo() { return maxCombo; },
    get hits() { return hits; },
    get misses() { return misses; },
    get expired() { return expired; },
    get elapsedMs() { return elapsedMs; },
    get remainingMs() { return Math.max(0, cfg.durationMs - elapsedMs); },
    get isOver() { return over; },
    get progress() { return progress(); },

    step(dtMs) {
      if (over || !(dtMs > 0)) return;
      let left = Math.min(dtMs, cfg.durationMs - elapsedMs);
      while (left > 0) {
        const slice = Math.min(SLICE_MS, left);
        tick(slice);
        left -= slice;
      }
      if (elapsedMs >= cfg.durationMs) {
        over = true;
        list.length = 0; // поле гаснет вместе с концом партии
      }
    },

    tap(x, y) {
      if (over) return { hit: false, points: 0 };
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const d = Math.hypot(x - t.x, y - t.y);
        if (d <= t.r + TAP_PAD && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) {
        misses++;
        combo = 0;
        return { hit: false, points: 0 };
      }
      const [t] = list.splice(best, 1);
      hits++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      const points = targetPoints({
        r: t.r,
        ageMs: elapsedMs - t.bornMs,
        ttlMs: t.ttlMs,
        golden: t.golden,
        multiplier: multiplierFor(combo),
      });
      score += points;
      return { hit: true, points, targetId: t.id, golden: t.golden };
    },

    spawnTarget(overrides = {}) {
      const p = progress();
      const [lo, hi] = radiusRange(p);
      const golden = overrides.golden ?? false;
      const r = overrides.r ?? (golden ? lo : (lo + hi) / 2);
      const base = place(r);
      const t: Target = {
        id: nextId++,
        x: overrides.x ?? base.x,
        y: overrides.y ?? base.y,
        r,
        bornMs: elapsedMs,
        ttlMs: overrides.ttlMs ?? (golden ? ttlFor(p) * 0.62 : ttlFor(p)),
        golden,
      };
      list.push(t);
      return t;
    },
  };
}
