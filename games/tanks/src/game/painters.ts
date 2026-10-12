import type { Scene } from 'phaser';
import { C, motionAllowed } from '@gamewingo/game-ui';
import { COLS, HEIGHT, ROWS, TILE, WIDTH, type Arena, type Tank, type Power } from '../core/arena';

export const ARENA_X = 35;
export const ARENA_Y = 139;

export function floor(scene: Scene) {
  const g = scene.add.graphics().setPosition(ARENA_X, ARENA_Y);
  g.fillStyle(C.ink, 0.07).fillRoundedRect(-5, 3, WIDTH + 10, HEIGHT + 10, 14);
  g.fillStyle(C.surface).fillRoundedRect(-5, -5, WIDTH + 10, HEIGHT + 10, 14);
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    g.fillStyle((row + col) % 2 ? C.slot : C.slotSoft)
      .fillRoundedRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2, 3);
  }
  return g;
}
export function walls(g: Phaser.GameObjects.Graphics, s: Arena) {
  g.clear();
  s.tiles.forEach((tile, i) => {
    if (tile === 'empty') return;
    const x = (i % COLS) * TILE, y = Math.floor(i / COLS) * TILE;
    g.fillStyle(tile === 'brick' ? C.primaryPressed : C.muted).fillRoundedRect(x + 1, y + 3, 28, 27, 4);
    g.fillStyle(tile === 'brick' ? C.primarySoft : C.divider).fillRoundedRect(x + 1, y + 1, 28, 25, 4);
    if (tile === 'brick') {
      g.lineStyle(2, C.primaryPressed, 0.55).lineBetween(x + 2, y + 13, x + 28, y + 13)
        .lineBetween(x + 13, y + 2, x + 13, y + 13).lineBetween(x + 20, y + 13, x + 20, y + 25);
    } else {
      g.lineStyle(1.5, C.surface, 0.8).strokeRoundedRect(x + 5, y + 5, 20, 17, 3);
      g.fillStyle(C.muted).fillCircle(x + 8, y + 8, 1.5).fillCircle(x + 22, y + 20, 1.5);
    }
  });
}
export interface TankView {
  root: Phaser.GameObjects.Container;
  tracks: Phaser.GameObjects.Graphics;
  turret: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  previous: { x: number; y: number };
}
export function tankView(scene: Scene, enemy = false, armored = false, flanker = false): TankView {
  const root = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(C.ink, 0.16).fillEllipse(1, 6, 32, 31);
  const tracks = scene.add.graphics();
  const body = scene.add.graphics();
  body.fillStyle(enemy ? C.primaryPressed : C.accentDark).fillRoundedRect(-10, -13, 20, 28, 5);
  body.fillStyle(enemy ? C.primary : C.accent).fillRoundedRect(-10, -14, 20, 25, 5);
  body.fillStyle(enemy ? C.primarySoft : C.accentSoft).fillRoundedRect(-7, -12, 14, 5, 2);
  body.lineStyle(1, C.white, 0.3).strokeRoundedRect(-8, -12, 16, 20, 4);
  if (armored) body.lineStyle(2, C.surface, 0.9).strokeRoundedRect(-11, -14, 22, 27, 5);
  const turret = scene.add.container(0, 0);
  const barrel = scene.add.graphics().fillStyle(C.ink).fillRoundedRect(-3.5, -24, 7, 20, 2);
  barrel.fillStyle(C.muted).fillRect(-3.5, -24, 7, 4);
  const cap = scene.add.graphics().fillStyle(enemy ? C.primaryPressed : C.accentDark).fillCircle(0, 0, 8.5);
  cap.fillStyle(enemy ? C.primarySoft : C.accentSoft).fillCircle(-1, -2, 7);
  cap.fillStyle(C.white, 0.35).fillEllipse(-3, -4, 6, 3);
  turret.add([barrel, cap]);
  const ring = scene.add.graphics();
  root.add([shadow, tracks, body, turret, ring]);
  if (flanker) root.add(scene.add.graphics().lineStyle(2, C.white)
    .lineBetween(-7, 8, 0, 13).lineBetween(0, 13, 7, 8));
  return { root, tracks, turret, ring, previous: { x: 0, y: 0 } };
}
export function syncTank(view: TankView, tank: Tank, time: number, activeShield = false) {
  const moving = Math.hypot(tank.x - view.previous.x, tank.y - view.previous.y) > 0.1;
  view.previous = { x: tank.x, y: tank.y };
  const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[tank.direction];
  view.root.setPosition(ARENA_X + tank.x, ARENA_Y + tank.y).setRotation(angle);
  const g = view.tracks.clear();
  const phase = moving && motionAllowed() ? Math.floor(time / 75) % 4 : 0;
  for (const x of [-15, 9]) {
    g.fillStyle(C.ink).fillRoundedRect(x, -15, 6, 30, 3);
    g.lineStyle(1.5, C.muted);
    for (let y = -12; y <= 12; y += 5) g.lineBetween(x + 1, y + phase, x + 5, y + phase);
  }
  view.ring.clear();
  if (tank.shield > 0 || activeShield) view.ring.lineStyle(activeShield ? 3 : 2, C.accentSoft, 0.9).strokeCircle(0, 0, 21);
  if (activeShield) view.ring.lineStyle(1, C.accent).strokeCircle(0, 0, 25);
}
/** Original code-native glyphs; no raster assets or external font symbols. */
export function powerIcon(g: Phaser.GameObjects.Graphics, power: Power | null, color: number) {
  g.clear().lineStyle(3, color);
  if (power === 'shield') {
    g.beginPath().moveTo(0, -17).lineTo(15, -11).lineTo(12, 7)
      .lineTo(0, 17).lineTo(-12, 7).lineTo(-15, -11).closePath().strokePath();
    g.lineBetween(-6, 0, -1, 6).lineBetween(-1, 6, 7, -6);
  } else if (power === 'repair') {
    g.strokeRoundedRect(-15, -12, 30, 26, 5).strokeRoundedRect(-6, -18, 12, 6, 2);
    g.lineBetween(-7, 1, 7, 1).lineBetween(0, -6, 0, 8);
  } else {
    g.strokeCircle(0, 0, 15).lineBetween(-6, 0, 6, 0).lineBetween(0, -6, 0, 6);
  }
}
export function core(g: Phaser.GameObjects.Graphics, s: Arena) {
  const { x, y, shield, hp } = s.core;
  g.clear().fillStyle(C.ink, 0.12).fillEllipse(x, y + 8, 34, 20);
  g.fillStyle(hp > 1 ? C.accentDark : C.danger).fillRoundedRect(x - 13, y - 12, 26, 26, 7);
  g.fillStyle(C.accentSoft).fillRoundedRect(x - 10, y - 12, 20, 21, 6);
  g.fillStyle(C.surface).fillTriangle(x, y - 9, x - 6, y + 2, x + 1, y + 2)
    .fillTriangle(x, y + 9, x + 6, y - 2, x - 1, y - 2);
  if (shield > 0) g.lineStyle(2, C.danger, 0.7).strokeCircle(x, y, 19);
}
