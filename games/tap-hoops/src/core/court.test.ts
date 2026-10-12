import { describe, expect, it } from 'vitest';
import { advance, createCourt, difficulty, queueTap, BALL_R, HEIGHT, MAX_MS, MAX_SCORE, STEP_MS, WIDTH, type Court } from './court';
function run(s: Court, ms: number) { const events = []; for (let t = 0; t < ms; t += STEP_MS) events.push(...advance(s, STEP_MS)); return events; }
function hit(s: Court) { Object.assign(s.ball, { x: s.hoop.x, y: s.hoop.y - 1, vx: 0, vy: 180 }); return advance(s, STEP_MS); }
describe('basketball physics', () => {
  it('one tap completes the stationary training hoop without spending time', () => {
    const s = createCourt(7, true); const ball = { ...s.ball };
    run(s, 3000); expect(s.ball).toEqual(ball); expect(s.elapsedMs).toBe(0);
    queueTap(s); run(s, 1000); expect(s.baskets).toBe(1); expect(s.score).toBe(150);
    expect(s.remainingMs).toBe(10_000); expect(s.elapsedMs).toBe(0);
    const snapshot = JSON.stringify(s); run(s, 1000); expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('queues a single tap through a short frame and applies cooldown, not held repeats', () => {
    const s = createCourt(); expect(queueTap(s)).toBe(true); expect(queueTap(s)).toBe(false);
    advance(s, 1); expect(s.taps).toBe(0); advance(s, STEP_MS);
    expect(s.taps).toBe(1); expect(s.ball.vy).toBeLessThan(0); expect(queueTap(s)).toBe(false);
    run(s, 150); expect(s.taps).toBe(1); expect(queueTap(s)).toBe(true);
  });
  it('scores a downward crossing exactly once and grants capped time', () => {
    const s = createCourt(); s.remainingMs = 8500;
    expect(hit(s).map(e => e.type)).toContain('clean');
    expect(s.score).toBe(150); expect(s.cleanBaskets).toBe(1); expect(s.remainingMs).toBe(10_000);
    hit(s); expect(s.baskets).toBe(1);
  });
  it('steers each impulse toward the hoop even after overshooting it', () => {
    for (const [x, direction] of [[290, -1], [200, 1], [260, 0]]) {
      const s = createCourt(); s.ball.x = x; s.ball.y = 330;
      queueTap(s); advance(s, STEP_MS);
      expect(Math.sign(s.ball.vx)).toBe(direction);
    }
    const s = createCourt(); s.hoop.side = 'left'; s.hoop.x = 70; s.ball.x = 30;
    queueTap(s); advance(s, STEP_MS); expect(s.ball.vx).toBeGreaterThan(0);
  });
  it('does not count upward crossings, outside the opening, or rapid repeat hits', () => {
    const s = createCourt(); Object.assign(s.ball, { x: 260, y: 221, vy: -180, vx: 0 }); advance(s, STEP_MS);
    expect(s.baskets).toBe(0);
    Object.assign(s.ball, { x: 190, y: 219, vy: 180, vx: 0 }); advance(s, STEP_MS); expect(s.baskets).toBe(0);
    s.lastBasketMs = s.elapsedMs; hit(s); expect(s.baskets).toBe(0);
  });
  it('keeps rim geometry solid and marks a touched attempt as non-clean', () => {
    const s = createCourt(); Object.assign(s.ball, { x: s.hoop.x - s.hoop.width / 2, y: s.hoop.y - 15, vx: 0, vy: 100 });
    advance(s, STEP_MS); expect(s.hoop.dirty).toBe(true); expect(s.ball.vy).toBeLessThan(0);
    hit(s); expect(s.score).toBe(100); expect(s.cleanBaskets).toBe(0);
  });
  it('bounces on the backboard with the same visible collider', () => {
    const s = createCourt(), boardX = s.hoop.x + s.hoop.width / 2 + 14;
    Object.assign(s.ball, { x: boardX - BALL_R - 2, y: s.hoop.y - 40, vx: 110, vy: 0 });
    advance(s, STEP_MS); expect(s.hoop.dirty).toBe(true); expect(s.ball.vx).toBeLessThan(0);
  });
  it('alternates sides only after leaving the old hoop and the minimum interval', () => {
    const s = createCourt(); hit(s); run(s, 200); expect(s.hoop.side).toBe('right');
    s.ball.y = s.hoop.y + 80; run(s, 500);
    expect(s.hoop.side).toBe('left'); expect(s.hoop.scored).toBe(false); expect(s.hoop.dirty).toBe(false);
  });
  it('resets a fallen ball without giving time or losing earned score', () => {
    const s = createCourt(); s.score = 150; s.baskets = 1; s.cleanStreak = 1;
    s.ball.y = HEIGHT + BALL_R + 1; const time = s.remainingMs; advance(s, STEP_MS);
    expect(s.resets).toBe(1); expect(s.ball.y).toBe(300); expect(s.remainingMs).toBeLessThan(time);
    expect(s.score).toBe(150); expect(s.cleanStreak).toBe(0);
  });
  it('bounds velocity, border position and frame stalls', () => {
    const s = createCourt(); s.ball.x = WIDTH - BALL_R - 1; s.ball.vx = 200; advance(s, 2000);
    expect(s.ball.x).toBeLessThanOrEqual(WIDTH - BALL_R); expect(s.elapsedMs).toBeLessThanOrEqual(250.01);
    expect(Math.abs(s.ball.vy)).toBeLessThanOrEqual(550);
    const snapshot = JSON.stringify(s); for (const ms of [-1, 0, NaN, Infinity]) advance(s, ms);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('expires before counting a late basket, and freezes after the hard cap', () => {
    const s = createCourt(); s.remainingMs = STEP_MS; hit(s); expect(s.ended).toBe('time'); expect(s.baskets).toBe(0);
    const hard = createCourt(); hard.elapsedMs = MAX_MS - STEP_MS; advance(hard, STEP_MS); expect(hard.ended).toBe('time');
    const snapshot = JSON.stringify(hard); expect(queueTap(hard)).toBe(false); run(hard, 1000); expect(JSON.stringify(hard)).toBe(snapshot);
  });
  it('caps baskets and formal score at 120 and 18000', () => {
    const s = createCourt(); s.baskets = 119; s.cleanBaskets = 119; hit(s);
    expect(s.ended).toBe('limit'); expect(s.score).toBe(MAX_SCORE); expect(s.baskets).toBe(120);
  });
  it('adds only the documented difficulty lever at each milestone', () => {
    expect(difficulty(4)).toEqual({ ...difficulty(3), variedHeight: true });
    expect(difficulty(8)).toEqual({ ...difficulty(7), amplitude: 28 });
    expect(difficulty(12)).toEqual({ ...difficulty(11), speed: 1.4 });
    expect(difficulty(18)).toEqual({ ...difficulty(17), width: 72 });
  });
  it('reproduces the same physics at 60/120 Hz and a seeded hoop sequence', () => {
    const a = createCourt(42), b = createCourt(42); queueTap(a); queueTap(b);
    for (let i = 0; i < 240; i++) advance(a, STEP_MS);
    for (let i = 0; i < 120; i++) advance(b, STEP_MS * 2);
    expect(a).toEqual(b);
    for (const s of [a, b]) { s.baskets = 4; s.hoop.scored = true; s.lastBasketMs = -1000; s.ball.y = 350; advance(s, STEP_MS); }
    expect(a.hoop).toEqual(b.hoop);
  });
});
