import type { Scene } from 'phaser';
import { C } from './tokens.js';

/**
 * Векторные значки каталога: предметы для счёта, символы карточек, герои меню.
 * Рисуются примитивами в палитре из `docs/DESIGN.md` — в отличие от эмодзи, они
 * не зависят от шрифта устройства, одинаковы на iOS и Android и не выпадают из стиля.
 *
 * Все фигуры строятся в квадрате −0.5…0.5 и масштабируются параметром `size`.
 */
export type GlyphName =
  | 'apple' | 'star' | 'ball' | 'heart' | 'flower' | 'leaf' | 'fish' | 'balloon'
  | 'drop' | 'ring' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'bolt' | 'plus'
  /** Служебные: указатель тапа в обучении и кораблик «Полёта». */
  | 'tap' | 'craft';

/** Полный набор: 16 значков, каждый узнаётся и по форме, и по цвету. */
export const GLYPHS: GlyphName[] = [
  'apple', 'star', 'ball', 'heart', 'flower', 'leaf', 'fish', 'balloon',
  'drop', 'ring', 'square', 'triangle', 'diamond', 'hexagon', 'bolt', 'plus',
];

type Draw = (g: Phaser.GameObjects.Graphics, s: number) => void;
type Pt = { x: number; y: number };

/** Залить произвольный многоугольник (без Phaser.Math.Vector2 — пакет не тянет рантайм Phaser). */
function fillPoly(g: Phaser.GameObjects.Graphics, pts: Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

/** Точки правильного многоугольника (угол отсчитывается от «12 часов»). */
function poly(n: number, r: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/** Точки звезды: чередование внешнего и внутреннего радиуса. */
function starPoints(spikes: number, outer: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

const DRAW: Record<GlyphName, Draw> = {
  apple: (g, s) => {
    g.fillStyle(C.danger, 1);
    g.fillCircle(-0.13 * s, 0.08 * s, 0.29 * s);
    g.fillCircle(0.13 * s, 0.08 * s, 0.29 * s);
    g.fillRect(-0.13 * s, -0.2 * s, 0.26 * s, 0.3 * s);
    g.fillStyle(C.accentDark, 1).fillRect(-0.025 * s, -0.32 * s, 0.05 * s, 0.16 * s);
    g.fillStyle(C.accent, 1).fillEllipse(0.12 * s, -0.29 * s, 0.22 * s, 0.12 * s);
  },
  star: (g, s) => {
    g.fillStyle(C.gold, 1);
    fillPoly(g, starPoints(5, 0.48 * s, 0.2 * s));
  },
  ball: (g, s) => {
    g.fillStyle(C.primary, 1).fillCircle(0, 0, 0.44 * s);
    g.fillStyle(C.white, 0.4).fillEllipse(-0.14 * s, -0.16 * s, 0.2 * s, 0.13 * s);
  },
  heart: (g, s) => {
    g.fillStyle(C.danger, 1);
    g.fillCircle(-0.19 * s, -0.12 * s, 0.22 * s);
    g.fillCircle(0.19 * s, -0.12 * s, 0.22 * s);
    g.fillTriangle(-0.39 * s, -0.02 * s, 0.39 * s, -0.02 * s, 0, 0.45 * s);
  },
  flower: (g, s) => {
    g.fillStyle(C.primary, 1);
    poly(5, 0.27 * s).forEach((p) => g.fillCircle(p.x, p.y, 0.19 * s));
    g.fillStyle(C.gold, 1).fillCircle(0, 0, 0.17 * s);
  },
  leaf: (g, s) => {
    g.fillStyle(C.accent, 1).fillEllipse(0, 0, 0.4 * s, 0.8 * s);
    g.fillStyle(C.accentDark, 1).fillRect(-0.02 * s, -0.34 * s, 0.04 * s, 0.68 * s);
  },
  fish: (g, s) => {
    g.fillStyle(C.accent, 1).fillEllipse(0.04 * s, 0, 0.66 * s, 0.42 * s);
    g.fillTriangle(-0.28 * s, 0, -0.48 * s, -0.24 * s, -0.48 * s, 0.24 * s);
    g.fillStyle(C.white, 1).fillCircle(0.2 * s, -0.06 * s, 0.06 * s);
    g.fillStyle(C.ink, 1).fillCircle(0.21 * s, -0.06 * s, 0.03 * s);
  },
  balloon: (g, s) => {
    g.fillStyle(C.primary, 1).fillEllipse(0, -0.12 * s, 0.6 * s, 0.68 * s);
    g.fillTriangle(-0.06 * s, 0.2 * s, 0.06 * s, 0.2 * s, 0, 0.3 * s);
    g.lineStyle(Math.max(1, 0.03 * s), C.muted, 1);
    g.beginPath();
    g.moveTo(0, 0.28 * s);
    g.lineTo(0.05 * s, 0.48 * s);
    g.strokePath();
    g.fillStyle(C.white, 0.5).fillEllipse(-0.14 * s, -0.24 * s, 0.16 * s, 0.22 * s);
  },
  drop: (g, s) => {
    g.fillStyle(C.accent, 1).fillCircle(0, 0.12 * s, 0.32 * s);
    g.fillTriangle(-0.26 * s, 0.04 * s, 0.26 * s, 0.04 * s, 0, -0.46 * s);
  },
  ring: (g, s) => {
    g.lineStyle(0.16 * s, C.gold, 1).strokeCircle(0, 0, 0.36 * s);
  },
  square: (g, s) => {
    g.fillStyle(C.primary, 1).fillRoundedRect(-0.38 * s, -0.38 * s, 0.76 * s, 0.76 * s, 0.14 * s);
  },
  triangle: (g, s) => {
    g.fillStyle(C.accent, 1).fillTriangle(-0.44 * s, 0.36 * s, 0.44 * s, 0.36 * s, 0, -0.4 * s);
  },
  diamond: (g, s) => {
    g.fillStyle(C.primarySoft, 1);
    fillPoly(g, poly(4, 0.46 * s));
  },
  hexagon: (g, s) => {
    g.fillStyle(C.accentDark, 1);
    fillPoly(g, poly(6, 0.44 * s));
  },
  bolt: (g, s) => {
    g.fillStyle(C.gold, 1);
    fillPoly(g, [
      { x: 0.08 * s, y: -0.46 * s }, { x: -0.3 * s, y: 0.08 * s }, { x: -0.04 * s, y: 0.08 * s },
      { x: -0.1 * s, y: 0.46 * s }, { x: 0.3 * s, y: -0.1 * s }, { x: 0.03 * s, y: -0.1 * s },
    ]);
  },
  tap: (g, s) => {
    g.lineStyle(Math.max(1, 0.06 * s), C.primary, 0.55).strokeCircle(0, 0, 0.44 * s);
    g.fillStyle(C.primary, 1).fillCircle(0, 0, 0.22 * s);
  },
  craft: (g, s) => {
    g.fillStyle(C.accent, 1).fillEllipse(-0.04 * s, 0, 0.66 * s, 0.36 * s);
    g.fillTriangle(0.16 * s, -0.18 * s, 0.16 * s, 0.18 * s, 0.48 * s, 0);
    g.fillStyle(C.accentDark, 1).fillTriangle(-0.3 * s, 0.02 * s, -0.44 * s, 0.3 * s, -0.1 * s, 0.16 * s);
    g.fillStyle(C.white, 0.9).fillCircle(0.02 * s, -0.04 * s, 0.1 * s);
  },
  plus: (g, s) => {
    g.fillStyle(C.danger, 1);
    g.fillRoundedRect(-0.14 * s, -0.42 * s, 0.28 * s, 0.84 * s, 0.1 * s);
    g.fillRoundedRect(-0.42 * s, -0.14 * s, 0.84 * s, 0.28 * s, 0.1 * s);
  },
};

/**
 * Значок в точке (x, y). `size` — сторона описанного квадрата.
 * Возвращает контейнер: можно двигать, крутить и анимировать как обычный объект.
 */
export function makeGlyph(
  scene: Scene,
  x: number,
  y: number,
  name: GlyphName,
  size = 40,
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  DRAW[name](g, size);
  return scene.add.container(x, y, [g]);
}
