import type { Scene, GameObjects } from 'phaser';
import { C, motionAllowed } from '@gamewingo/game-ui';
import { HEIGHT, WIDTH, BALL_R, RIM_R, type Court } from '../core/court';
export const COURT_X = 35, COURT_Y = 139;
export function floor(scene: Scene) {
  const g = scene.add.graphics().setPosition(COURT_X, COURT_Y);
  g.fillStyle(C.ink, 0.07).fillRoundedRect(-5, 4, WIDTH + 10, HEIGHT + 5, 18);
  g.fillStyle(C.surface).fillRoundedRect(-5, -5, WIDTH + 10, HEIGHT + 5, 18);
  g.fillStyle(C.accentSoft, 0.22).fillRoundedRect(0, 0, WIDTH, HEIGHT, 14);
  g.lineStyle(1, C.accentSoft, 0.7);
  for (let y = 30; y < HEIGHT; y += 40) g.lineBetween(0, y, WIDTH, y);
  g.lineStyle(2, C.surface, 0.95).strokeCircle(WIDTH / 2, HEIGHT - 90, 78)
    .lineBetween(0, HEIGHT - 90, WIDTH, HEIGHT - 90);
  return g;
}
export function ballView(scene: Scene) {
  const root = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(C.ink, 0.12).fillCircle(2, 3, BALL_R + 1);
  const ball = scene.add.graphics().fillStyle(C.primaryPressed).fillCircle(0, 0, BALL_R);
  ball.fillStyle(C.primary).fillCircle(-1, -1, BALL_R - 1);
  ball.fillStyle(C.primarySoft, 0.85).fillEllipse(-4, -5, 12, 7);
  ball.lineStyle(1.3, C.primaryPressed).strokeCircle(0, 0, BALL_R)
    .lineBetween(-BALL_R, 0, BALL_R, 0).lineBetween(0, -BALL_R, 0, BALL_R);
  ball.beginPath().moveTo(-8, -10).lineTo(-4, -5).lineTo(-3, 0).lineTo(-4, 6).lineTo(-8, 10).strokePath();
  ball.beginPath().moveTo(8, -10).lineTo(4, -5).lineTo(3, 0).lineTo(4, 6).lineTo(8, 10).strokePath();
  root.add([shadow, ball]); return { root, ball };
}
export function basket(back: GameObjects.Graphics, front: GameObjects.Graphics, s: Court) {
  const { x, y, width, side } = s.hoop, half = width / 2;
  const boardX = x + (side === 'right' ? 1 : -1) * (half + 14);
  back.clear().fillStyle(C.ink, 0.1).fillRoundedRect(boardX - 1, y - 67, 7, 95, 3);
  back.fillStyle(C.surface).fillRoundedRect(boardX - 3, y - 70, 6, 95, 2)
    .lineStyle(1, C.accent).strokeRoundedRect(boardX - 3, y - 70, 6, 95, 2);
  const swing = motionAllowed() && s.netPulseMs > 0 ? Math.sin(s.netPulseMs / 36) * s.netPulseMs / 75 : 0;
  back.lineStyle(1.5, C.muted, 0.65);
  for (let i = 0; i <= 6; i++) {
    const top = x - half + width * i / 6, bottom = x - half * 0.55 + width * 0.55 * i / 6 + swing;
    back.lineBetween(top, y + 3, bottom, y + 58);
  }
  for (let i = 1; i < 4; i++) {
    const fraction = i / 4, inset = half * 0.45 * fraction;
    back.lineBetween(x - half + inset + swing * fraction, y + 58 * fraction,
      x + half - inset + swing * fraction, y + 58 * fraction);
  }
  back.lineStyle(3, C.primaryPressed).strokeEllipse(x, y, width, 8);
  // Ellipse-like front lip does not imply a solid horizontal collision wall.
  front.clear().lineStyle(3, C.primary).lineBetween(x - half, y + 3, x + half, y + 3);
  for (const rimX of [x - half, x + half]) front.fillStyle(C.primaryPressed).fillCircle(rimX, y, RIM_R);
}
