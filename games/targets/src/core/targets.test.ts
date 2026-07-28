import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng';
import {
  createTargetsGame, targetPoints, multiplierFor,
  MAX_MULTIPLIER, ROUND_MS, R_BIG, R_SMALL,
  type TargetsGame,
} from './targets';

/** Прогоняет партию кадрами по 16 мс (как реальный 60 fps). */
function run(game: TargetsGame, ms: number): void {
  for (let t = 0; t < ms; t += 16) game.step(16);
}

/** Партия с целями наверняка: шагаем, пока не появится хотя бы одна. */
function withTarget(seed = 7) {
  const game = createTargetsGame(mulberry32(seed));
  while (game.targets.length === 0) game.step(16);
  return game;
}

describe('createTargetsGame — попадания и промахи', () => {
  it('тап внутри цели — попадание с положительными очками', () => {
    const game = withTarget();
    const target = game.targets[0];
    const res = game.tap(target.x, target.y);
    expect(res.hit).toBe(true);
    expect(res.points).toBeGreaterThan(0);
    expect(res.targetId).toBe(target.id);
    expect(game.score).toBe(res.points);
    expect(game.hits).toBe(1);
  });

  it('тап далеко от целей — промах без очков и без штрафа', () => {
    const game = withTarget();
    const scoreBefore = game.score;
    const res = game.tap(-500, -500);
    expect(res.hit).toBe(false);
    expect(res.points).toBe(0);
    expect(game.score).toBe(scoreBefore);
    expect(game.misses).toBe(1);
  });

  it('цель нельзя сбить дважды', () => {
    const game = withTarget();
    const target = game.targets[0];
    const first = game.tap(target.x, target.y);
    expect(first.hit).toBe(true);
    expect(game.targets.some((t) => t.id === target.id)).toBe(false);

    const second = game.tap(target.x, target.y);
    expect(second.hit).toBe(false);
    expect(game.hits).toBe(1);
    expect(game.score).toBe(first.points);
  });
});

describe('createTargetsGame — время жизни цели', () => {
  it('истечение ttl удаляет цель и обнуляет серию', () => {
    const game = createTargetsGame(mulberry32(3));
    const alive = game.spawnTarget({ x: 200, y: 300, r: 30, ttlMs: 600 });
    game.tap(alive.x, alive.y); // серия = 1
    expect(game.combo).toBe(1);

    const doomed = game.spawnTarget({ x: 120, y: 500, r: 30, ttlMs: 600 });
    run(game, 700);
    expect(game.targets.some((t) => t.id === doomed.id)).toBe(false);
    expect(game.expired).toBeGreaterThanOrEqual(1);
    expect(game.combo).toBe(0);
  });
});

describe('createTargetsGame — серия и множитель', () => {
  it('серия растёт при попаданиях подряд и обнуляется при промахе', () => {
    const game = createTargetsGame(mulberry32(11));
    for (let i = 0; i < 3; i++) {
      const t = game.spawnTarget({ x: 60 + i * 90, y: 200, r: 30, ttlMs: 5000 });
      expect(game.tap(t.x, t.y).hit).toBe(true);
    }
    expect(game.combo).toBe(3);
    expect(game.maxCombo).toBe(3);

    game.tap(-100, -100);
    expect(game.combo).toBe(0);
    expect(game.maxCombo).toBe(3); // лучший результат сохраняется
  });

  it('множитель растёт с серией, но ограничен потолком', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(3)).toBe(1);
    expect(multiplierFor(4)).toBe(2);
    expect(multiplierFor(100)).toBe(MAX_MULTIPLIER);

    const game = createTargetsGame(mulberry32(12));
    for (let i = 0; i < 40; i++) {
      const t = game.spawnTarget({ x: 200, y: 300, r: 24, ttlMs: 9000 });
      game.tap(t.x, t.y);
    }
    expect(game.combo).toBe(40);
    expect(game.multiplier).toBe(MAX_MULTIPLIER);
  });

  it('множитель серии увеличивает очки за одинаковые цели', () => {
    const solo = targetPoints({ r: 30, ageMs: 0, ttlMs: 1200, golden: false, multiplier: 1 });
    const streak = targetPoints({ r: 30, ageMs: 0, ttlMs: 1200, golden: false, multiplier: 3 });
    expect(streak).toBe(solo * 3);
  });
});

describe('createTargetsGame — начисление очков', () => {
  it('быстрое попадание даёт больше очков, чем медленное по такой же цели', () => {
    const fast = createTargetsGame(mulberry32(21));
    const slow = createTargetsGame(mulberry32(21));
    const a = fast.spawnTarget({ x: 200, y: 300, r: 30, ttlMs: 1400 });
    const b = slow.spawnTarget({ x: 200, y: 300, r: 30, ttlMs: 1400 });

    const quick = fast.tap(a.x, a.y);
    run(slow, 1000); // почти дотянули до исчезновения
    const late = slow.tap(b.x, b.y);

    expect(quick.hit && late.hit).toBe(true);
    expect(quick.points).toBeGreaterThan(late.points);
  });

  it('мелкая цель даёт больше очков, чем крупная', () => {
    const small = targetPoints({ r: R_SMALL, ageMs: 0, ttlMs: 1200, golden: false, multiplier: 1 });
    const big = targetPoints({ r: R_BIG, ageMs: 0, ttlMs: 1200, golden: false, multiplier: 1 });
    expect(small).toBeGreaterThan(big);

    const game = createTargetsGame(mulberry32(31));
    const bigT = game.spawnTarget({ x: 100, y: 200, r: 44, ttlMs: 2000 });
    const bigHit = game.tap(bigT.x, bigT.y);
    const smallT = game.spawnTarget({ x: 300, y: 500, r: 20, ttlMs: 2000 });
    const smallHit = game.tap(smallT.x, smallT.y);
    expect(smallHit.points).toBeGreaterThan(bigHit.points);
  });

  it('золотая цель даёт больше очков, чем обычная того же размера', () => {
    const gold = targetPoints({ r: 26, ageMs: 0, ttlMs: 900, golden: true, multiplier: 1 });
    const plain = targetPoints({ r: 26, ageMs: 0, ttlMs: 900, golden: false, multiplier: 1 });
    expect(gold).toBeGreaterThan(plain);

    const game = createTargetsGame(mulberry32(41));
    const g = game.spawnTarget({ x: 120, y: 240, r: 26, ttlMs: 900, golden: true });
    const goldHit = game.tap(g.x, g.y);
    game.tap(-999, -999); // сбрасываем серию, чтобы сравнивать при множителе 1
    const n = game.spawnTarget({ x: 280, y: 480, r: 26, ttlMs: 900 });
    const plainHit = game.tap(n.x, n.y);
    expect(goldHit.points).toBeGreaterThan(plainHit.points);
  });

  it('золотые цели появляются регулярно, но редко', () => {
    const game = createTargetsGame(mulberry32(5), { maxAlive: 99 });
    const golden: number[] = [];
    let seen = 0;
    for (let t = 0; t < ROUND_MS; t += 16) {
      game.step(16);
      for (const target of game.targets) {
        if (target.id > seen) {
          seen = target.id;
          if (target.golden) golden.push(target.id);
        }
      }
    }
    expect(golden.length).toBeGreaterThan(3);
    expect(golden.length).toBeLessThan(seen / 5);
  });
});

describe('createTargetsGame — конец партии', () => {
  it('через 60 000 мс партия закончена и tap больше не начисляет', () => {
    const game = createTargetsGame(mulberry32(77));
    run(game, ROUND_MS - 200);
    expect(game.isOver).toBe(false);

    run(game, 400);
    expect(game.isOver).toBe(true);
    expect(game.elapsedMs).toBe(ROUND_MS);
    expect(game.remainingMs).toBe(0);
    expect(game.targets.length).toBe(0);

    const scoreBefore = game.score;
    const res = game.tap(200, 300);
    expect(res.hit).toBe(false);
    expect(game.score).toBe(scoreBefore);
  });

  it('партия набирает очки и держит темп в разумных пределах', () => {
    const game = createTargetsGame(mulberry32(99));
    let spawned = 0;
    let seen = 0;
    for (let t = 0; t < ROUND_MS; t += 16) {
      game.step(16);
      for (const target of game.targets) {
        if (target.id > seen) { seen = target.id; spawned++; }
      }
      // «идеальный игрок» бьёт всё, что видит
      while (game.targets.length > 0) {
        const target = game.targets[0];
        expect(game.tap(target.x, target.y).hit).toBe(true);
      }
    }
    expect(spawned).toBeGreaterThan(80);
    expect(spawned).toBeLessThanOrEqual(110);
    expect(game.hits).toBe(spawned);
    expect(game.score).toBeLessThan(50_000); // серверный потолок из score.ts
  });
});

describe('createTargetsGame — детерминированность', () => {
  it('одинаковый seed даёт одинаковую партию', () => {
    const snap = (seed: number) => {
      const game = createTargetsGame(mulberry32(seed));
      const seenIds = new Set<number>();
      const log: string[] = [];
      for (let t = 0; t < 12_000; t += 16) {
        game.step(16);
        for (const target of game.targets) {
          if (seenIds.has(target.id)) continue;
          seenIds.add(target.id);
          log.push(
            `${target.id}:${target.x.toFixed(3)}:${target.y.toFixed(3)}:${target.r.toFixed(3)}:${target.golden}`,
          );
        }
        if (game.targets.length > 0 && t % 320 === 0) game.tap(game.targets[0].x, game.targets[0].y);
      }
      return { log, score: game.score, hits: game.hits, maxCombo: game.maxCombo };
    };
    const a = snap(2024);
    const b = snap(2024);
    const c = snap(2025);
    expect(a).toEqual(b);
    expect(a.log).not.toEqual(c.log);
  });

  it('цели всегда полностью внутри поля', () => {
    const game = createTargetsGame(mulberry32(13));
    for (let t = 0; t < ROUND_MS; t += 16) {
      game.step(16);
      for (const target of game.targets) {
        expect(target.x - target.r).toBeGreaterThanOrEqual(12 - 0.001);
        expect(target.x + target.r).toBeLessThanOrEqual(12 + 376 + 0.001);
        expect(target.y - target.r).toBeGreaterThanOrEqual(104 - 0.001);
        expect(target.y + target.r).toBeLessThanOrEqual(104 + 580 + 0.001);
      }
    }
  });
});
