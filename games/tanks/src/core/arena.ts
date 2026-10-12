export const TILE = 30;
export const COLS = 11;
export const ROWS = 13;
export const WIDTH = TILE * COLS;
export const HEIGHT = TILE * ROWS;
export const STEP_MS = 1000 / 60;
export const MAX_MS = 180_000;
export const MAX_WAVES = 15;
export const MAX_SCORE = MAX_WAVES * (4 * 100 + 50);
export type Direction = 'up' | 'right' | 'down' | 'left';
export type Tile = 'empty' | 'brick' | 'metal';
export type EndReason = 'armor' | 'core' | 'time' | 'victory';
export type Power = 'repair' | 'shield';
export type Route = 'direct' | 'left' | 'right';
export const SHIELD_MS = 5000;
export const VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};
const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
const LAYOUT = [
  '...........', '..b.....b..', '..b..m..b..', '...........', '.mm.....mm.',
  '....bbb....', '.b.......b.', '.b..m.m..b.', '...........', '..bb...bb..',
  '...........', '....b.b....', '...........',
];
export interface Tank {
  id: number; x: number; y: number; direction: Direction; hp: number;
  cooldown: number; shield: number; target: { x: number; y: number } | null;
  aim: { direction: Direction; remainingMs: number; phase: 'turn' | 'recoil' } | null;
  route: Route; flankReached: boolean;
}
export interface Bullet { id: number; x: number; y: number; direction: Direction; enemy: boolean }
export interface Spawn { x: number; y: number; remaining: number; armored: boolean; route: Route }
export interface ArenaEvent { type: 'shot' | 'kill' | 'wall' | 'damage' | 'core' | 'wave'; x: number; y: number }
export interface Arena {
  tiles: Tile[]; player: Tank; bots: Tank[]; bullets: Bullet[]; spawns: Spawn[];
  core: { x: number; y: number; hp: number; shield: number };
  elapsedMs: number; remainder: number; wave: number; waves: number; kills: number;
  damageTaken: number; streak: number; bestNoDamageStreak: number; score: number;
  intermission: number; nextId: number; seed: number; rng: number; training: boolean;
  ended: EndReason | null;
  choicePending: boolean; power: Power | null; powerShieldMs: number;
}
export interface Controls { direction: Direction | null; fire: boolean }

function random(s: Arena) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 2 ** 32;
}
function tank(id: number, col: number, row: number, hp = 1): Tank {
  return { id, x: (col + 0.5) * TILE, y: (row + 0.5) * TILE,
    direction: 'down', hp, cooldown: 1100, shield: 1200, target: null, aim: null,
    route: 'direct', flankReached: false };
}
export function createArena(seed = 1, training = false): Arena {
  const s: Arena = {
    tiles: LAYOUT.join('').split('').map(c => c === 'b' ? 'brick' : c === 'm' ? 'metal' : 'empty'),
    player: { ...tank(0, 5, 10, 3), direction: 'up', cooldown: 0, shield: 0 },
    core: { x: 165, y: 375, hp: 3, shield: 0 }, bots: [], bullets: [], spawns: [],
    elapsedMs: 0, remainder: 0, wave: 1, waves: 0, kills: 0, damageTaken: 0,
    streak: 0, bestNoDamageStreak: 0, score: 0, intermission: 0, nextId: 1,
    seed: seed >>> 0, rng: seed >>> 0, training, ended: null,
    choicePending: false, power: null, powerShieldMs: 0,
  };
  if (training) s.bots.push({ ...tank(s.nextId++, 5, 8), shield: 0 });
  else scheduleWave(s);
  return s;
}
export function waveConfig(wave: number) {
  return { count: Math.min(4, 1 + Math.floor((wave - 1) / 2)),
    fireMs: wave < 7 ? 2200 : 1650, speed: 42,
    armored: wave >= 10 ? (wave >= 13 ? 2 : 1) : 0,
    flankers: wave >= 10 ? 2 : wave >= 4 ? 1 : 0 };
}
function scheduleWave(s: Arena) {
  const config = waveConfig(s.wave);
  const cols = [2, 8, 5, 0];
  s.spawns = cols.slice(0, config.count).map((col, i) => ({
    x: (col + 0.5) * TILE, y: TILE / 2, remaining: 1100 + i * 400,
    armored: i < config.armored,
    route: i >= config.count - config.flankers ? (col < 5 ? 'left' : 'right') : 'direct',
  }));
}

/** One battle-only slot. A new choice explicitly replaces an unused power. */
export function choosePower(s: Arena, power: Power): boolean {
  if (!s.choicePending || s.ended || s.training || !['repair', 'shield'].includes(power)) return false;
  s.power = power; s.choicePending = false; s.remainder = 0;
  return true;
}
export function activatePower(s: Arena): boolean {
  if (s.ended || s.training || s.choicePending || !s.power) return false;
  if (s.power === 'repair') {
    if (s.player.hp >= 3 || s.player.hp <= 0) return false;
    s.player.hp = Math.min(3, s.player.hp + 1);
  } else {
    if (s.powerShieldMs > 0) return false;
    s.powerShieldMs = SHIELD_MS;
  }
  s.power = null;
  return true;
}
function intersects(x: number, y: number, r: number, cx: number, cy: number, half: number) {
  return Math.abs(x - cx) < r + half && Math.abs(y - cy) < r + half;
}
export function canOccupy(s: Arena, x: number, y: number, id = -1, radius = 11): boolean {
  if (x < radius || y < radius || x > WIDTH - radius || y > HEIGHT - radius) return false;
  for (let row = Math.floor((y - radius) / TILE); row <= Math.floor((y + radius) / TILE); row++) {
    for (let col = Math.floor((x - radius) / TILE); col <= Math.floor((x + radius) / TILE); col++) {
      if (s.tiles[row * COLS + col] !== 'empty') return false;
    }
  }
  if (intersects(x, y, radius, s.core.x, s.core.y, 12)) return false;
  return [s.player, ...s.bots].every(t => t.id === id || t.hp <= 0 || !intersects(x, y, radius, t.x, t.y, 11));
}
function move(s: Arena, t: Tank, d: Direction, distance: number) {
  t.direction = d;
  const v = VECTORS[d], x = t.x + v.x * distance, y = t.y + v.y * distance;
  if (!canOccupy(s, x, y, t.id)) return false;
  t.x = x; t.y = y;
  return true;
}
function shoot(s: Arena, t: Tank, enemy: boolean, events: ArenaEvent[]) {
  if (t.cooldown > 0 || (enemy && t.shield > 0)) return;
  // Start at the hull centre: spawning beyond a wall would skip collision.
  s.bullets.push({ id: s.nextId++, x: t.x, y: t.y, direction: t.direction, enemy });
  t.cooldown = enemy ? waveConfig(s.wave).fireMs + random(s) * 300 : 350;
  events.push({ type: 'shot', x: t.x, y: t.y });
}
function visibleDirection(s: Arena, from: Tank, to: { x: number; y: number }): Direction | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > 9 && Math.abs(dy) > 9) return null;
  const d: Direction = Math.abs(dx) < Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
  const v = VECTORS[d], length = Math.max(Math.abs(dx), Math.abs(dy));
  for (let distance = 15; distance < length - 12; distance += 5) {
    const col = Math.floor((from.x + v.x * distance) / TILE);
    const row = Math.floor((from.y + v.y * distance) / TILE);
    if (s.tiles[row * COLS + col] !== 'empty') return null;
  }
  return d;
}

/** A small BFS on the 143-cell arena. Bots path to a clear firing lane near the core. */
export function nextBotTarget(s: Arena, bot: Tank): { x: number; y: number } | null {
  const start = Math.floor(bot.y / TILE) * COLS + Math.floor(bot.x / TILE);
  // Flankers first reach the outside lower lane, then attack the core from
  // row 12. The checkpoint is remembered, so they cannot oscillate back to it.
  const side = bot.route === 'left' ? 0 : 10;
  const checkpoint = 10 * COLS + side;
  if (bot.route !== 'direct' && start === checkpoint) bot.flankReached = true;
  const goal = bot.route === 'direct' ? 10 * COLS + 5
    : bot.flankReached ? 12 * COLS + (side === 0 ? 4 : 6) : checkpoint;
  const queue = [start], previous = new Map<number, number>([[start, -1]]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === goal) break;
    for (const d of DIRECTIONS) {
      const v = VECTORS[d], col = current % COLS + v.x, row = Math.floor(current / COLS) + v.y;
      const index = row * COLS + col;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS || previous.has(index) || s.tiles[index] !== 'empty') continue;
      if (row === 12 && col === 5) continue;
      previous.set(index, current); queue.push(index);
    }
  }
  if (!previous.has(goal) || start === goal) return null;
  let next = goal;
  while (previous.get(next) !== start) next = previous.get(next)!;
  return { x: (next % COLS + 0.5) * TILE, y: (Math.floor(next / COLS) + 0.5) * TILE };
}
function updateBot(s: Arena, bot: Tank, dt: number, events: ArenaEvent[]) {
  if (bot.shield > 0) return;
  // A visible turn before the shot, then a short firing pose. Navigation must
  // not overwrite the facing direction in the same tick (or the same frame).
  if (bot.aim) {
    const aim = bot.aim;
    bot.direction = aim.direction;
    aim.remainingMs -= dt;
    if (aim.remainingMs > 0) return;
    if (aim.phase === 'turn') {
      const sight = visibleDirection(s, bot, s.player) ?? visibleDirection(s, bot, s.core);
      if (sight === aim.direction) {
        shoot(s, bot, true, events);
        bot.aim = { direction: aim.direction, remainingMs: 180, phase: 'recoil' };
        return;
      }
    }
    bot.aim = null;
    return;
  }
  const sight = visibleDirection(s, bot, s.player) ?? visibleDirection(s, bot, s.core);
  if (sight && bot.cooldown <= 0) {
    bot.direction = sight;
    bot.aim = { direction: sight, remainingMs: 180, phase: 'turn' };
    return;
  }
  if (!bot.target) bot.target = nextBotTarget(s, bot);
  const target = bot.target;
  if (!target) return;
  const dx = target.x - bot.x, dy = target.y - bot.y;
  const distance = Math.min(waveConfig(s.wave).speed * dt / 1000, Math.max(Math.abs(dx), Math.abs(dy)));
  if (distance < 0.01) { bot.target = null; return; }
  const d: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  if (!move(s, bot, d, distance)) {
    // A tank can briefly block a lane; no teleporting or overlapping.
    bot.target = null;
  }
  if (Math.hypot(target.x - bot.x, target.y - bot.y) < 0.1) bot.target = null;
}
function hitBullet(s: Arena, bullet: Bullet, events: ArenaEvent[]): boolean {
  if (bullet.x < 0 || bullet.y < 0 || bullet.x >= WIDTH || bullet.y >= HEIGHT) return true;
  const col = Math.floor(bullet.x / TILE), row = Math.floor(bullet.y / TILE);
  const cell = row * COLS + col;
  if (s.tiles[cell] !== 'empty') {
    if (s.tiles[cell] === 'brick') {
      s.tiles[cell] = 'empty'; events.push({ type: 'wall', x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
    }
    return true;
  }
  if (bullet.enemy && intersects(bullet.x, bullet.y, 2, s.core.x, s.core.y, 12)) {
    if (s.core.shield <= 0) {
      s.core.hp--; s.core.shield = 800; s.streak = 0;
      events.push({ type: 'core', x: s.core.x, y: s.core.y });
    }
    return true;
  }
  for (const t of bullet.enemy ? [s.player] : s.bots) {
    if (t.hp <= 0 || !intersects(bullet.x, bullet.y, 2, t.x, t.y, 11)) continue;
    if (t.shield > 0 || (t.id === 0 && s.powerShieldMs > 0)) return true;
    t.hp--;
    if (bullet.enemy) {
      s.damageTaken++; s.streak = 0; t.shield = 1200;
      events.push({ type: 'damage', x: t.x, y: t.y });
    } else if (t.hp === 0) {
      s.kills++; s.score += 100; s.streak++;
      s.bestNoDamageStreak = Math.max(s.bestNoDamageStreak, s.streak);
      events.push({ type: 'kill', x: t.x, y: t.y });
    }
    return true;
  }
  return false;
}
function tick(s: Arena, input: Controls, events: ArenaEvent[]) {
  if (s.ended || s.choicePending) return;
  const dt = STEP_MS;
  if (!s.training) s.elapsedMs = Math.min(MAX_MS, s.elapsedMs + dt);
  for (const t of [s.player, ...s.bots]) {
    t.cooldown = Math.max(0, t.cooldown - dt); t.shield = Math.max(0, t.shield - dt);
  }
  s.core.shield = Math.max(0, s.core.shield - dt);
  s.powerShieldMs = Math.max(0, s.powerShieldMs - dt);
  if (input.direction && !s.training) move(s, s.player, input.direction, 105 * dt / 1000);
  if (input.fire) shoot(s, s.player, false, events);
  if (!s.training) {
    s.spawns = s.spawns.filter(spawn => {
      spawn.remaining -= dt;
      if (spawn.remaining > 0 || !canOccupy(s, spawn.x, spawn.y)) return true;
      s.bots.push({ ...tank(s.nextId++, 0, 0, spawn.armored ? 2 : 1), x: spawn.x, y: spawn.y, route: spawn.route });
      return false;
    });
    for (const bot of s.bots) updateBot(s, bot, dt, events);
  }
  s.bullets = s.bullets.filter(bullet => {
    const v = VECTORS[bullet.direction];
    // Substeps keep the first-hit ordering even if projectile speed changes.
    const distance = (bullet.enemy ? 165 : 270) * dt / 1000;
    const steps = Math.ceil(distance / 2);
    for (let i = 0; i < steps; i++) {
      bullet.x += v.x * distance / steps; bullet.y += v.y * distance / steps;
      if (hitBullet(s, bullet, events)) return false;
    }
    return true;
  });
  s.bots = s.bots.filter(b => b.hp > 0);
  if (s.training) return;
  if (s.player.hp <= 0) s.ended = 'armor';
  else if (s.core.hp <= 0) s.ended = 'core';
  else if (s.elapsedMs >= MAX_MS) s.ended = 'time';
  if (s.ended) return;
  if (s.bots.length === 0 && s.spawns.length === 0) {
    if (s.intermission === 0) {
      s.waves++; s.score += 50; s.intermission = 1500;
      events.push({ type: 'wave', x: s.core.x, y: s.core.y });
      if (s.wave >= MAX_WAVES) { s.ended = 'victory'; return; }
      if (s.wave % 3 === 0) s.choicePending = true;
    } else {
      s.intermission -= dt;
      if (s.intermission <= 0) { s.intermission = 0; s.wave++; scheduleWave(s); }
    }
  }
}

/** Fixed simulation step; a frame stall is bounded and cannot tunnel through a wall. */
export function advance(s: Arena, input: Controls, deltaMs: number): ArenaEvent[] {
  const events: ArenaEvent[] = [];
  if (s.ended || s.choicePending || !Number.isFinite(deltaMs) || deltaMs <= 0) return events;
  s.remainder += Math.min(250, deltaMs);
  while (s.remainder + 1e-8 >= STEP_MS && !s.ended && !s.choicePending) {
    tick(s, input, events); s.remainder = Math.max(0, s.remainder - STEP_MS);
  }
  if (s.choicePending) s.remainder = 0; // Never catch up time spent choosing.
  return events;
}
