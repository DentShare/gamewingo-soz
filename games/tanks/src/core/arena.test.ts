import { describe, expect, it } from 'vitest';
import { advance, canOccupy, createArena, COLS, MAX_MS, MAX_SCORE, STEP_MS, TILE, waveConfig,
  nextBotTarget, activatePower, choosePower, SHIELD_MS, type Arena, type Bullet, type Controls } from './arena';

const idle: Controls = { direction: null, fire: false };
function run(s: Arena, ms: number, input = idle) {
  const events = [];
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) events.push(...advance(s, input, STEP_MS));
  return events;
}
function empty() {
  const s = createArena(17);
  s.tiles.fill('empty'); s.spawns = [];
  s.bots = [{ ...s.player, id: 1, x: 75, y: 75, hp: 2, shield: MAX_MS, target: null }];
  return s;
}
function bullet(s: Arena, properties: Partial<Bullet>) {
  s.bullets.push({ id: s.nextId++, x: 165, y: 100, direction: 'down', enemy: true, ...properties });
}

describe('arena simulation', () => {
  it('offers exactly one choice after waves 3/6/9/12, but not before victory or training', () => {
    for (let wave = 1; wave <= 15; wave++) {
      const s = empty(); s.wave = wave; s.waves = wave - 1; s.bots = [];
      run(s, 100);
      expect(s.choicePending).toBe(wave < 15 && wave % 3 === 0);
      expect(s.waves).toBe(wave);
      if (s.choicePending) {
        expect(choosePower(s, 'shield')).toBe(true);
        expect(choosePower(s, 'repair')).toBe(false);
        run(s, 1600);
        expect(s.wave).toBe(wave + 1); expect(s.choicePending).toBe(false);
        expect(s.waves).toBe(wave);
      }
    }
    const training = createArena(1, true); training.wave = 3; training.bots = [];
    run(training, 100); expect(training.choicePending).toBe(false);
  });
  it('stops the entire simulation inside a large frame at the choice, with no catch-up', () => {
    const s = empty(); s.bots = []; s.wave = 3; s.player.cooldown = 1000;
    advance(s, idle, 250);
    expect(s.elapsedMs).toBeCloseTo(STEP_MS); expect(s.remainder).toBe(0);
    const snapshot = JSON.stringify(s);
    run(s, 20_000, { direction: 'right', fire: true });
    expect(JSON.stringify(s)).toBe(snapshot); expect(activatePower(s)).toBe(false);
    choosePower(s, 'repair'); advance(s, idle, STEP_MS);
    expect(s.elapsedMs).toBeCloseTo(2 * STEP_MS);
  });
  it('stores powers until activation, restores only one tank armor, and never wastes a full repair', () => {
    const s = empty(); s.choicePending = true;
    choosePower(s, 'repair'); expect(s.power).toBe('repair');
    expect(activatePower(s)).toBe(false); expect(s.power).toBe('repair');
    s.player.hp = 1; s.core.hp = 1;
    expect(activatePower(s)).toBe(true); expect(s.player.hp).toBe(2); expect(s.core.hp).toBe(1);
    expect(s.power).toBeNull(); expect(activatePower(s)).toBe(false);
  });
  it('absorbs hits for five active seconds without protecting the core or changing score/streak', () => {
    const s = empty(); s.power = 'shield'; s.streak = 4;
    expect(activatePower(s)).toBe(true); expect(s.powerShieldMs).toBe(SHIELD_MS);
    bullet(s, { y: 308 }); bullet(s, { y: 365 }); run(s, 100);
    expect(s.player.hp).toBe(3); expect(s.damageTaken).toBe(0); expect(s.core.hp).toBe(2);
    expect(s.score).toBe(0); expect(s.powerShieldMs).toBeCloseTo(4900);
    s.choicePending = true; const duration = s.powerShieldMs; run(s, 1000);
    expect(s.powerShieldMs).toBe(duration);
    s.choicePending = false; run(s, 5000); expect(s.powerShieldMs).toBe(0);
    bullet(s, { y: 308 }); run(s, 50); expect(s.player.hp).toBe(2);
  });
  it('replaces the one stored slot only on a new choice and resets all powers for a new battle', () => {
    const s = empty(); s.power = 'repair';
    expect(choosePower(s, 'shield')).toBe(false); expect(s.power).toBe('repair');
    s.choicePending = true; expect(choosePower(s, 'shield')).toBe(true);
    activatePower(s); s.power = 'shield'; expect(activatePower(s)).toBe(false);
    for (const fresh of [createArena(), createArena(1, true)]) {
      expect(fresh.power).toBeNull(); expect(fresh.powerShieldMs).toBe(0); expect(fresh.choicePending).toBe(false);
    }
    s.ended = 'time'; expect(activatePower(s)).toBe(false);
    s.ended = null; s.training = true; expect(activatePower(s)).toBe(false);
  });
  it('introduces flankers at wave 4 with the same speed and health as a basic bot', () => {
    expect(waveConfig(3).flankers).toBe(0); expect(waveConfig(4).flankers).toBe(1);
    expect(waveConfig(4).speed).toBe(waveConfig(3).speed);
    const s = empty(); s.wave = 3; s.bots = []; run(s, 100); choosePower(s, 'shield'); run(s, 1600);
    expect(s.spawns.filter(p => p.route !== 'direct')).toHaveLength(1);
    run(s, 1600); expect(s.bots.filter(b => b.route !== 'direct')).toHaveLength(1);
    expect(s.bots.every(b => b.hp === 1)).toBe(true);
  });
  it('routes both flankers through their outside checkpoint to a side firing lane without crossing walls/core', () => {
    for (const route of ['left', 'right'] as const) {
      const s = createArena(), bot = { ...s.player, id: 7, route, x: route === 'left' ? 75 : 255, y: 15 };
      const visited: { x: number; y: number }[] = [];
      for (let step = 0; step < 100; step++) {
        const next = nextBotTarget(s, bot); if (!next) break;
        expect(Math.abs(next.x - bot.x) + Math.abs(next.y - bot.y)).toBe(TILE);
        expect(s.tiles[Math.floor(next.y / TILE) * COLS + Math.floor(next.x / TILE)]).toBe('empty');
        expect(next).not.toEqual({ x: s.core.x, y: s.core.y });
        Object.assign(bot, next); visited.push(next);
      }
      expect(visited).toContainEqual({ x: route === 'left' ? 15 : 315, y: 315 });
      expect(bot.flankReached).toBe(true);
      expect({ x: bot.x, y: bot.y }).toEqual({ x: route === 'left' ? 135 : 195, y: 375 });
      expect(nextBotTarget(s, bot)).toBeNull();
    }
  });
  it('physically traverses each flanking route on the original map without becoming stuck', () => {
    for (const route of ['left', 'right'] as const) {
      const s = createArena(); s.spawns = [];
      const bot = { ...s.player, id: 7, route, x: route === 'left' ? 75 : 255, y: 15,
        cooldown: MAX_MS, shield: 0 };
      s.bots = [bot]; run(s, 20_000);
      expect(bot.flankReached).toBe(true);
      expect(bot.x).toBeCloseTo(route === 'left' ? 135 : 195);
      expect(bot.y).toBeCloseTo(375);
    }
  });
  for (const [direction, x, y] of [
    ['right', 225, 165], ['left', 105, 165], ['up', 165, 105], ['down', 165, 225],
  ] as const) {
    it(`visibly turns ${direction} before shooting and holds the firing pose`, () => {
      const s = empty();
      s.player.x = x; s.player.y = y;
      const bot = s.bots[0];
      Object.assign(bot, { x: 165, y: 165, direction: 'down', cooldown: 0, shield: 0,
        target: { x: 165, y: 195 } });
      advance(s, idle, STEP_MS);
      expect(bot.direction).toBe(direction);
      expect(s.bullets).toHaveLength(0);
      expect(bot.aim?.phase).toBe('turn');
      run(s, 200);
      expect(s.bullets).toHaveLength(1);
      expect(s.bullets[0].direction).toBe(direction);
      expect(bot.direction).toBe(direction);
      expect(bot.aim?.phase).toBe('recoil');
      expect({ x: bot.x, y: bot.y }).toEqual({ x: 165, y: 165 });
    });
  }
  it('keeps the barrel aligned with a new shot across a multi-step frame', () => {
    const s = empty(), bot = s.bots[0];
    s.player.x = 225; s.player.y = 165;
    Object.assign(bot, { x: 165, y: 165, direction: 'down', cooldown: 0, shield: 0,
      target: { x: 165, y: 195 } });
    advance(s, idle, 250);
    expect(bot.direction).toBe('right');
    expect(s.bullets[0].direction).toBe('right');
    expect(bot.y).toBe(165);
  });
  it('cancels the shot if the target leaves the firing lane during aiming', () => {
    const s = empty(), bot = s.bots[0];
    s.player.x = 225; s.player.y = 165;
    Object.assign(bot, { x: 165, y: 165, cooldown: 0, shield: 0 });
    advance(s, idle, STEP_MS);
    s.player.y = 195;
    run(s, 190);
    expect(s.bullets).toHaveLength(0);
    // The old player shot is cancelled; the bot may already be aiming at the core.
    expect(bot.aim?.direction).not.toBe('right');
  });
  it('starts with clear player/core positions and telegraphed spawns', () => {
    const s = createArena(1);
    expect(s.player.hp).toBe(3); expect(s.core.hp).toBe(3);
    expect(canOccupy(s, s.player.x, s.player.y, 0)).toBe(true);
    expect(s.bots).toHaveLength(0); expect(s.spawns).toHaveLength(1);
    run(s, 1000); expect(s.bots).toHaveLength(0);
    run(s, 150); expect(s.bots).toHaveLength(1); expect(s.bots[0].shield).toBeGreaterThan(0);
  });
  it('has routes from all spawn lanes to the firing lane near the core', () => {
    for (const col of [0, 2, 5, 8]) {
      const s = createArena();
      const bot = { ...s.player, id: 3, x: (col + 0.5) * TILE, y: 15 };
      expect(nextBotTarget(s, bot)).not.toBeNull();
    }
  });
  it('moves only in the selected cardinal direction', () => {
    const s = empty(), x = s.player.x;
    run(s, 200, { direction: 'right', fire: false });
    expect(s.player.x).toBeGreaterThan(x); expect(s.player.y).toBe(315);
    const stopped = s.player.x; run(s, 100); expect(s.player.x).toBe(stopped);
  });
  it('stops against walls, borders, other tanks and the core', () => {
    const s = empty(); s.tiles[10 * COLS + 6] = 'metal';
    run(s, 600, { direction: 'right', fire: false });
    expect(s.player.x).toBeLessThanOrEqual(169);
    expect(canOccupy(s, -1, 50)).toBe(false);
    expect(canOccupy(s, 75, 75)).toBe(false);
    expect(canOccupy(s, s.core.x, s.core.y, 0)).toBe(false);
  });
  it('destroys the first brick only, without a large frame tunnelling through metal', () => {
    const s = empty(); s.tiles[5 * COLS + 5] = 'brick'; s.tiles[6 * COLS + 5] = 'metal';
    bullet(s, { x: 165, y: 140, direction: 'down', enemy: false });
    const events = advance(s, idle, 2000);
    expect(s.tiles[5 * COLS + 5]).toBe('empty'); expect(s.tiles[6 * COLS + 5]).toBe('metal');
    expect(events.filter(e => e.type === 'wall')).toHaveLength(1); expect(s.bullets).toHaveLength(0);
    bullet(s, { x: 165, y: 175, direction: 'down', enemy: false });
    run(s, 250); expect(s.tiles[6 * COLS + 5]).toBe('metal'); expect(s.bullets).toHaveLength(0);
  });
  it('does not create projectiles beyond a wall adjacent to the barrel', () => {
    const s = empty(); s.player.x = 167; s.player.direction = 'right'; s.tiles[10 * COLS + 6] = 'brick';
    run(s, 100, { direction: null, fire: true });
    expect(s.tiles[10 * COLS + 6]).toBe('empty');
    expect(s.bullets).toHaveLength(0);
  });
  it('scores a robot once even with overlapping projectiles', () => {
    const s = empty(); s.bots[0] = { ...s.bots[0], x: 165, y: 200, hp: 1, shield: 0 };
    for (let i = 0; i < 2; i++) bullet(s, { y: 190, enemy: false });
    const events = run(s, 100);
    expect(s.kills).toBe(1); expect(s.score).toBe(150);
    expect(events.filter(e => e.type === 'kill')).toHaveLength(1);
    run(s, 500); expect(s.waves).toBe(1); expect(s.score).toBe(150);
  });
  it('requires two hits for an armored robot', () => {
    const s = empty(); s.bots[0] = { ...s.bots[0], x: 165, y: 200, hp: 2, shield: 0 };
    bullet(s, { y: 190, enemy: false }); run(s, 30);
    expect(s.bots[0].hp).toBe(1); expect(s.kills).toBe(0);
    bullet(s, { y: 190, enemy: false }); run(s, 30); expect(s.kills).toBe(1);
  });
  it('gives invulnerability after player/core damage and consumes hitting bullets', () => {
    const s = empty(); s.streak = 5;
    for (let i = 0; i < 3; i++) bullet(s, { y: 308 });
    run(s, 50); expect(s.player.hp).toBe(2); expect(s.damageTaken).toBe(1); expect(s.streak).toBe(0);
    for (let i = 0; i < 3; i++) bullet(s, { y: 365 });
    run(s, 50); expect(s.core.hp).toBe(2); expect(s.bullets).toHaveLength(0);
  });
  it('ends immediately when armor or core is lost and cannot score afterwards', () => {
    for (const target of ['player', 'core'] as const) {
      const s = empty(); s[target].hp = 1;
      bullet(s, { x: s[target].x, y: s[target].y - 5 }); run(s, 50);
      expect(s.ended).toBe(target === 'player' ? 'armor' : 'core');
      const snapshot = JSON.stringify(s); run(s, 1000); expect(JSON.stringify(s)).toBe(snapshot);
    }
  });
  it('finishes at the hard time cap', () => {
    const s = empty(); s.elapsedMs = MAX_MS - STEP_MS;
    run(s, 100); expect(s.ended).toBe('time'); expect(s.elapsedMs).toBe(MAX_MS);
  });
  it('caps waves and score and increases only scheduled difficulty levers', () => {
    expect(waveConfig(1).count).toBe(1); expect(waveConfig(6).count).toBe(3);
    expect(waveConfig(7).speed).toBe(waveConfig(6).speed);
    expect(waveConfig(7).fireMs).toBeLessThan(waveConfig(6).fireMs);
    expect(waveConfig(10).armored).toBe(1); expect(waveConfig(15).count).toBe(4);
    const s = empty(); s.wave = 15; s.waves = 14; s.bots = []; s.score = MAX_SCORE - 50;
    run(s, 100); expect(s.ended).toBe('victory'); expect(s.score).toBe(MAX_SCORE); expect(s.waves).toBe(15);
  });
  it('does not advance time, move player, or spawn/fire bots during training', () => {
    const s = createArena(3, true), y = s.player.y;
    run(s, 1000, { direction: 'up', fire: true });
    expect(s.elapsedMs).toBe(0); expect(s.player.y).toBe(y); expect(s.kills).toBe(1);
    expect(s.wave).toBe(1); expect(s.waves).toBe(0); expect(s.spawns).toHaveLength(0);
    expect(s.bullets.every(b => !b.enemy)).toBe(true);
  });
  it('is deterministic for equal seeds and equivalent frame budgets', () => {
    const a = createArena(42), b = createArena(42);
    for (let i = 0; i < 600; i++) advance(a, idle, STEP_MS);
    for (let i = 0; i < 300; i++) advance(b, idle, STEP_MS * 2);
    expect(b).toEqual(a);
  });
  it('rejects invalid deltas and bounds frame stalls', () => {
    const s = empty();
    for (const delta of [-1, 0, NaN, Infinity]) advance(s, idle, delta);
    expect(s.elapsedMs).toBe(0);
    advance(s, idle, 60_000); expect(s.elapsedMs).toBeLessThanOrEqual(250.001);
  });
});
