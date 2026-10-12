export const WIDTH = 330, HEIGHT = 480, BALL_R = 13, RIM_R = 4;
export const STEP_MS = 1000 / 120, MAX_MS = 180_000, MAX_BASKETS = 120, MAX_SCORE = 18_000;
export const TAP_COOLDOWN = 110, SCORE_COOLDOWN = 600;
const GRAVITY = 850, IMPULSE = -440, HORIZONTAL = 110;
export interface Ball { x: number; y: number; vx: number; vy: number }
export interface Hoop { x: number; y: number; baseY: number; width: number; side: 'left' | 'right'; dirty: boolean; scored: boolean }
export interface Court {
  ball: Ball; hoop: Hoop; elapsedMs: number; remainingMs: number; remainder: number;
  baskets: number; cleanBaskets: number; cleanStreak: number; bestCleanStreak: number;
  score: number; taps: number; resets: number; seed: number; rng: number;
  tapCooldown: number; pendingTap: boolean; lastBasketMs: number; netPulseMs: number;
  training: boolean; ended: 'time' | 'limit' | null;
}
export interface CourtEvent { type: 'tap' | 'basket' | 'clean' | 'reset' | 'contact' }
export function difficulty(baskets: number) {
  return { variedHeight: baskets >= 4, amplitude: baskets >= 8 ? 28 : 0,
    speed: baskets >= 12 ? 1.4 : 0.8, width: baskets >= 18 ? 72 : 84 };
}
function random(s: Court) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 2 ** 32;
}
export function createCourt(seed = 1, training = false): Court {
  return { ball: { x: 170, y: 300, vx: 0, vy: 0 },
    hoop: { x: 260, y: 220, baseY: 220, width: 84, side: 'right', dirty: false, scored: false },
    elapsedMs: 0, remainingMs: 10_000, remainder: 0, baskets: 0, cleanBaskets: 0,
    cleanStreak: 0, bestCleanStreak: 0, score: 0, taps: 0, resets: 0,
    seed: seed >>> 0, rng: seed >>> 0, tapCooldown: 0, pendingTap: false,
    lastBasketMs: -SCORE_COOLDOWN, netPulseMs: 0, training, ended: null };
}
/** One gesture, one queued impulse. Holding cannot generate repeats. */
export function queueTap(s: Court): boolean {
  if (s.ended || s.pendingTap || s.tapCooldown > 0 || (s.training && s.baskets > 0)) return false;
  s.pendingTap = true; return true;
}
function nextHoop(s: Court) {
  const config = difficulty(s.baskets), side = s.hoop.side === 'left' ? 'right' : 'left';
  const baseY = config.variedHeight ? 180 + Math.floor(random(s) * 100) : 220;
  s.hoop = { x: side === 'right' ? 260 : 70,
    y: baseY + Math.sin(s.elapsedMs / 1000 * config.speed) * config.amplitude, baseY,
    width: config.width, side, dirty: false, scored: false };
  s.ball.vx = side === 'right' ? HORIZONTAL : -HORIZONTAL;
}
function contact(s: Court, x: number, y: number, r: number, surfaceVy: number) {
  const b = s.ball, dx = b.x - x, dy = b.y - y, distance = Math.hypot(dx, dy), min = BALL_R + r;
  if (distance >= min) return false;
  const nx = distance > 1e-8 ? dx / distance : (s.hoop.side === 'right' ? -1 : 1);
  const ny = distance > 1e-8 ? dy / distance : 0;
  b.x += nx * (min - distance); b.y += ny * (min - distance);
  const dot = b.vx * nx + (b.vy - surfaceVy) * ny;
  if (dot < 0) { b.vx -= 1.65 * dot * nx; b.vy -= 1.65 * dot * ny; }
  s.hoop.dirty = true;
  return true;
}
function tick(s: Court, events: CourtEvent[]) {
  if (s.ended || (s.training && s.baskets > 0)) return;
  if (s.training && s.taps === 0 && !s.pendingTap) return;
  const dt = STEP_MS / 1000;
  s.tapCooldown = Math.max(0, s.tapCooldown - STEP_MS);
  s.netPulseMs = Math.max(0, s.netPulseMs - STEP_MS);
  if (s.pendingTap) {
    s.pendingTap = false; s.taps++; s.tapCooldown = TAP_COOLDOWN;
    s.ball.vy = IMPULSE; s.ball.vx = Math.sign(s.hoop.x - s.ball.x) * HORIZONTAL;
    events.push({ type: 'tap' });
  }
  if (!s.training) {
    s.elapsedMs = Math.min(MAX_MS, s.elapsedMs + STEP_MS);
    s.remainingMs = Math.max(0, s.remainingMs - STEP_MS);
    // Expired time cannot be rescued by a hit later in this tick.
    if (s.remainingMs <= 1e-7 || s.elapsedMs >= MAX_MS - 1e-7) { s.ended = 'time'; return; }
  }
  const h = s.hoop, b = s.ball, oldX = b.x, oldY = b.y, oldHoopY = h.y;
  const config = difficulty(s.baskets);
  // Scored hoops keep their physical pose until the ball leaves their zone.
  if (!s.training && !h.scored) h.y = h.baseY + Math.sin(s.elapsedMs / 1000 * config.speed) * config.amplitude;
  const hoopVy = (h.y - oldHoopY) / dt;
  b.vy = Math.min(550, b.vy + GRAVITY * dt); b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.75; }
  if (b.x > WIDTH - BALL_R) { b.x = WIDTH - BALL_R; b.vx = -Math.abs(b.vx) * 0.75; }
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.65; }
  let touched = false;
  for (const x of [h.x - h.width / 2, h.x + h.width / 2]) touched = contact(s, x, h.y, RIM_R, hoopVy) || touched;
  const boardX = h.x + (h.side === 'right' ? 1 : -1) * (h.width / 2 + 14);
  const closestX = Math.max(boardX - 3, Math.min(boardX + 3, b.x));
  const closestY = Math.max(h.y - 70, Math.min(h.y + 25, b.y));
  touched = contact(s, closestX, closestY, 0, hoopVy) || touched;
  b.vx = Math.max(-200, Math.min(200, b.vx)); b.vy = Math.max(-550, Math.min(550, b.vy));
  if (touched) events.push({ type: 'contact' });
  const before = oldY - oldHoopY, after = b.y - h.y;
  if (!h.scored && b.vy > 0 && before < 0 && after >= 0 && after > before) {
    const fraction = -before / (after - before), crossingX = oldX + (b.x - oldX) * fraction;
    if (Math.abs(crossingX - h.x) < h.width / 2 - BALL_R - RIM_R && s.elapsedMs - s.lastBasketMs >= SCORE_COOLDOWN - 1e-7) {
      h.scored = true; s.baskets++; s.lastBasketMs = s.elapsedMs; s.netPulseMs = 450;
      if (!h.dirty) { s.cleanBaskets++; s.cleanStreak++; s.bestCleanStreak = Math.max(s.bestCleanStreak, s.cleanStreak); }
      else s.cleanStreak = 0;
      s.score = 100 * s.baskets + 50 * s.cleanBaskets;
      s.remainingMs = Math.min(10_000, s.remainingMs + 4000);
      events.push({ type: h.dirty ? 'basket' : 'clean' });
      if (s.baskets >= MAX_BASKETS) s.ended = 'limit';
    }
  }
  if (h.scored && !s.training && s.elapsedMs - s.lastBasketMs >= SCORE_COOLDOWN
    && (Math.abs(b.x - h.x) > h.width / 2 + BALL_R || b.y > h.y + 70)) nextHoop(s);
  if (b.y > HEIGHT + BALL_R) {
    s.resets++; s.cleanStreak = 0; s.hoop.dirty = true;
    s.ball = { x: 170, y: 300, vx: 0, vy: 0 }; events.push({ type: 'reset' });
  }
}
export function advance(s: Court, deltaMs: number): CourtEvent[] {
  const events: CourtEvent[] = [];
  if (s.ended || (s.training && s.baskets > 0) || !Number.isFinite(deltaMs) || deltaMs <= 0) return events;
  s.remainder += Math.min(250, deltaMs);
  while (s.remainder + 1e-8 >= STEP_MS && !s.ended && !(s.training && s.baskets > 0)) {
    tick(s, events); s.remainder = Math.max(0, s.remainder - STEP_MS);
  }
  return events;
}
