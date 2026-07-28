import type { Shape } from '../core/sorting';
import { COLORS } from './palette';
import { darken } from './ui';

/**
 * Векторные примитивы игры: фигурки (круг/квадрат/треугольник) и корзины.
 * Ничего не грузим — всё рисуется Graphics, вес билда не растёт.
 */

/** Фигурка, вписанная в квадрат size×size с центром в (cx, cy). */
export function drawFigure(
  g: Phaser.GameObjects.Graphics,
  shape: Shape,
  size: number,
  color: number,
  cx = 0,
  cy = 0,
  alpha = 1,
): void {
  const h = size / 2;
  g.fillStyle(color, alpha);
  if (shape === 'circle') {
    g.fillCircle(cx, cy, h);
  } else if (shape === 'square') {
    g.fillRoundedRect(cx - h, cy - h, size, size, Math.round(size * 0.18));
  } else {
    // Треугольник чуть приподнят, чтобы визуально совпадать по «весу» с кругом.
    g.fillTriangle(cx, cy - h, cx + h * 0.96, cy + h * 0.82, cx - h * 0.96, cy + h * 0.82);
  }
}

/**
 * Корзина: начало координат — в ОСНОВАНИИ (0, 0), тело уходит вверх до −h.
 * Так подпрыгивание (scaleY) и качание (angle) выглядят естественно.
 */
export function drawBin(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  face: number,
  neutral = false,
): void {
  const rim = 22;
  const r = 16;
  // Тело.
  g.fillStyle(face, 1).fillRoundedRect(-w / 2, -h + rim - 4, w, h - rim + 4, r);
  // Верхний бортик — шире тела, темнее: читается как «ящик, куда кладут».
  g.fillStyle(darken(face, neutral ? 0.1 : 0.22), 1)
    .fillRoundedRect(-w / 2 - 7, -h, w + 14, rim + 4, 11);
  if (neutral) {
    g.lineStyle(2, COLORS.panelBorder, 1).strokeRoundedRect(-w / 2, -h + rim - 4, w, h - rim + 4, r);
  }
}
