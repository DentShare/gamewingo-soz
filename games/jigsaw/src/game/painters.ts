import { C } from '@gamewingo/game-ui';

/**
 * Векторные сцены пазла.
 *
 * Это ПЛЕЙСХОЛДЕРЫ: сцены нарисованы кодом в палитре каталога, чтобы игра была
 * играбельной и тестируемой до прихода купленного набора иллюстраций. Когда
 * набор появится, картинка подменяется файлом в `public/pictures/<id>.webp`
 * (см. `src/core/pictures.ts`, поле `src`) — код резки на кусочки и сборки
 * не меняется.
 *
 * Сцены пишутся в квадрате 0…SIZE, а «кисть» умножает координаты на масштаб
 * текстуры. Так рисунок сразу попадает в нужный размер: полагаться на
 * трансформацию Graphics нельзя — `generateTexture` пишет буфер команд.
 */

export const SIZE = 100;

/** Палитра сцен: мягкие цвета каталога плюс пара природных оттенков. */
const P = {
  sky: 0xbfe3ef,
  skyNight: 0x2f3d63,
  sun: 0xffc84a,
  moon: 0xf3f1e2,
  grass: 0x7cc36b,
  grassDark: 0x5aa84f,
  water: 0x5fb6d4,
  waterDark: 0x3f97b8,
  sand: 0xf0d9a8,
  snow: 0xf2f7fa,
  cloud: 0xffffff,
  wood: 0xb5793f,
  woodDark: 0x8c5a2c,
  roof: C.primary,
  wall: 0xfff2e6,
  leaf: 0x4f9e4a,
  leafDark: 0x2f7a4f,
  apple: 0xe0533f,
  cat: 0xf2a65a,
  catDark: 0xd98b45,
  fish: C.primary,
  fishAlt: 0xffb35c,
  rocket: 0xf3f5f7,
  metal: 0xc9d2d6,
  star: 0xfff2b8,
  petal: 0xff8fb1,
  petalAlt: 0xf7d154,
  bee: 0xffcf3f,
  ink: 0x2f3a45,
  balloon: 0xe0533f,
  balloonAlt: C.accent,
  train: 0x4e9b90,
  road: 0x9aa3ad,
  planet: 0x6fcfc7,
  ground: 0x2a5f45,
};

/** Кисть: те же примитивы, но все координаты умножены на масштаб текстуры. */
export interface Brush {
  bg(color: number): void;
  rect(x: number, y: number, w: number, h: number, color: number): void;
  circle(x: number, y: number, r: number, color: number, alpha?: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, color: number): void;
  poly(points: Array<[number, number]>, color: number): void;
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number): void;
}

export function makeBrush(g: Phaser.GameObjects.Graphics, k: number): Brush {
  return {
    bg(color) {
      g.fillStyle(color, 1).fillRect(0, 0, SIZE * k, SIZE * k);
    },
    rect(x, y, w, h, color) {
      g.fillStyle(color, 1).fillRect(x * k, y * k, w * k, h * k);
    },
    circle(x, y, r, color, alpha = 1) {
      g.fillStyle(color, alpha).fillCircle(x * k, y * k, r * k);
    },
    ellipse(x, y, rx, ry, color) {
      g.fillStyle(color, 1).fillEllipse(x * k, y * k, rx * 2 * k, ry * 2 * k);
    },
    poly(points, color) {
      g.fillStyle(color, 1);
      g.beginPath();
      points.forEach(([x, y], i) => {
        if (i === 0) g.moveTo(x * k, y * k); else g.lineTo(x * k, y * k);
      });
      g.closePath();
      g.fillPath();
    },
    line(x1, y1, x2, y2, width, color) {
      g.lineStyle(width * k, color, 1);
      g.beginPath();
      g.moveTo(x1 * k, y1 * k);
      g.lineTo(x2 * k, y2 * k);
      g.strokePath();
    },
  };
}

export type Painter = (b: Brush) => void;

/* ── Кирпичики, из которых собраны сцены ──────────────────────────────────── */

const ground = (b: Brush, y: number, color: number) => b.rect(0, y, SIZE, SIZE - y, color);

const cloud = (b: Brush, x: number, y: number, s: number) => {
  b.circle(x, y, s, P.cloud);
  b.circle(x + s * 0.9, y + s * 0.2, s * 0.75, P.cloud);
  b.circle(x - s * 0.9, y + s * 0.2, s * 0.7, P.cloud);
  b.rect(x - s * 0.9, y + s * 0.1, s * 1.8, s * 0.9, P.cloud);
};

const tree = (b: Brush, x: number, base: number, h: number, crown = P.leaf) => {
  b.rect(x - h * 0.06, base - h * 0.55, h * 0.12, h * 0.55, P.wood);
  b.circle(x, base - h * 0.7, h * 0.28, crown);
  b.circle(x - h * 0.2, base - h * 0.55, h * 0.22, crown);
  b.circle(x + h * 0.2, base - h * 0.55, h * 0.22, crown);
};

const flower = (b: Brush, x: number, y: number, r: number, color: number) => {
  b.rect(x - r * 0.1, y, r * 0.2, r * 2.2, P.grassDark);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.circle(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.55, color);
  }
  b.circle(x, y, r * 0.5, P.sun);
};

const star = (b: Brush, x: number, y: number, r: number) => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  b.poly(pts, P.star);
};

const house = (b: Brush, x: number, base: number, w: number) => {
  const h = w * 0.85;
  b.rect(x - w / 2, base - h, w, h, P.wall);
  b.poly([[x - w * 0.62, base - h], [x, base - h - w * 0.5], [x + w * 0.62, base - h]], P.roof);
  b.rect(x - w * 0.3, base - h * 0.72, w * 0.26, w * 0.26, P.water);
  b.rect(x + w * 0.06, base - h * 0.5, w * 0.24, h * 0.5, P.wood);
};

const fish = (b: Brush, x: number, y: number, r: number, color: number, dir = 1) => {
  b.ellipse(x, y, r * 1.1, r * 0.7, color);
  b.poly([
    [x - dir * r * 1.1, y],
    [x - dir * r * 1.9, y - r * 0.7],
    [x - dir * r * 1.9, y + r * 0.7],
  ], color);
  b.circle(x + dir * r * 0.5, y - r * 0.2, r * 0.28, 0xffffff);
  b.circle(x + dir * r * 0.55, y - r * 0.2, r * 0.14, P.ink);
};

/* ── Пятнадцать сцен ──────────────────────────────────────────────────────── */

/** 1. Солнечный день: холмы, солнце и цветы. */
const sunnyDay: Painter = (b) => {
  b.bg(P.sky);
  b.circle(78, 22, 12, P.sun);
  cloud(b, 26, 22, 7);
  ground(b, 62, P.grass);
  b.ellipse(22, 66, 26, 12, P.grassDark);
  b.ellipse(74, 68, 30, 13, P.grassDark);
  flower(b, 18, 78, 5, P.petal);
  flower(b, 50, 84, 5, P.petalAlt);
  flower(b, 82, 79, 5, P.petal);
};

/** 2. Домик у дерева. */
const cosyHouse: Painter = (b) => {
  b.bg(P.sky);
  b.circle(84, 18, 10, P.sun);
  ground(b, 66, P.grass);
  house(b, 42, 70, 40);
  tree(b, 82, 72, 34);
  flower(b, 14, 80, 4, P.petalAlt);
};

/** 3. Кораблик в море. */
const littleBoat: Painter = (b) => {
  b.bg(P.sky);
  b.circle(20, 20, 10, P.sun);
  cloud(b, 74, 18, 8);
  ground(b, 58, P.water);
  b.ellipse(24, 74, 17, 4, P.waterDark);
  b.ellipse(76, 86, 20, 4, P.waterDark);
  b.poly([[30, 64], [70, 64], [62, 74], [38, 74]], P.wood);
  b.rect(49, 34, 2, 30, P.metal);
  b.poly([[51, 36], [70, 62], [51, 62]], 0xffffff);
  b.poly([[47, 36], [30, 62], [47, 62]], P.roof);
};

/** 4. Ракета в космосе. */
const rocketFlight: Painter = (b) => {
  b.bg(P.skyNight);
  star(b, 18, 20, 5);
  star(b, 82, 26, 4);
  star(b, 30, 76, 4);
  star(b, 72, 84, 3);
  b.circle(80, 66, 14, P.planet);
  b.poly([[46, 22], [58, 46], [58, 68], [38, 68], [38, 46]], P.rocket);
  b.poly([[38, 60], [28, 76], [38, 72]], P.roof);
  b.poly([[58, 60], [68, 76], [58, 72]], P.roof);
  b.circle(48, 46, 7, P.water);
  b.poly([[42, 68], [54, 68], [48, 88]], P.sun);
};

/** 5. Яблоня. */
const appleTree: Painter = (b) => {
  b.bg(P.sky);
  ground(b, 70, P.grass);
  b.rect(46, 44, 8, 28, P.woodDark);
  b.circle(50, 36, 22, P.leaf);
  b.circle(32, 46, 15, P.leaf);
  b.circle(68, 46, 15, P.leaf);
  b.circle(40, 34, 4, P.apple);
  b.circle(58, 30, 4, P.apple);
  b.circle(52, 48, 4, P.apple);
  b.circle(30, 50, 3.4, P.apple);
  b.circle(24, 76, 5, P.apple);
  b.circle(72, 78, 5, P.apple);
};

/** 6. Котёнок. */
const kitten: Painter = (b) => {
  b.bg(0xffe9d6);
  b.poly([[28, 38], [34, 16], [46, 30]], P.cat);
  b.poly([[72, 38], [66, 16], [54, 30]], P.cat);
  b.circle(50, 48, 28, P.cat);
  b.ellipse(50, 62, 15, 9, P.catDark);
  b.circle(40, 44, 7, 0xffffff);
  b.circle(60, 44, 7, 0xffffff);
  b.circle(41, 45, 3.4, P.ink);
  b.circle(61, 45, 3.4, P.ink);
  b.poly([[46, 55], [54, 55], [50, 60]], P.petal);
  b.line(30, 54, 16, 50, 1.4, P.ink);
  b.line(30, 58, 16, 60, 1.4, P.ink);
  b.line(70, 54, 84, 50, 1.4, P.ink);
  b.line(70, 58, 84, 60, 1.4, P.ink);
};

/** 7. Рыбки в аквариуме. */
const aquarium: Painter = (b) => {
  b.bg(P.water);
  b.rect(0, 0, SIZE, 14, P.waterDark);
  ground(b, 82, P.sand);
  b.ellipse(16, 74, 5, 17, P.leaf);
  b.ellipse(26, 78, 4, 13, P.leaf);
  b.ellipse(86, 76, 4.5, 15, P.leaf);
  fish(b, 44, 40, 9, P.fish, 1);
  fish(b, 68, 62, 7, P.fishAlt, -1);
  b.circle(58, 26, 3, 0xffffff, 0.5);
  b.circle(64, 18, 2, 0xffffff, 0.5);
};

/** 8. Поезд. */
const train: Painter = (b) => {
  b.bg(P.sky);
  cloud(b, 22, 18, 7);
  b.circle(82, 18, 9, P.sun);
  ground(b, 72, P.grass);
  b.rect(0, 74, SIZE, 3, P.metal);
  b.rect(10, 50, 32, 24, P.train);
  b.rect(46, 56, 20, 18, P.train);
  b.rect(70, 56, 20, 18, P.roof);
  b.rect(16, 56, 9, 9, 0xffffff);
  b.rect(30, 56, 9, 9, 0xffffff);
  b.rect(51, 60, 9, 8, 0xffffff);
  b.rect(75, 60, 9, 8, 0xffffff);
  for (const cx of [18, 36, 52, 62, 76, 86]) b.circle(cx, 76, 4, P.ink);
  b.circle(14, 42, 5, P.cloud);
  b.circle(22, 34, 4, P.cloud);
};

/** 9. Бабочка на лугу. */
const butterfly: Painter = (b) => {
  b.bg(P.sky);
  ground(b, 66, P.grass);
  flower(b, 20, 74, 6, P.petal);
  flower(b, 78, 76, 6, P.petalAlt);
  b.ellipse(38, 38, 13, 10, P.petal);
  b.ellipse(38, 54, 10, 8, P.petal);
  b.ellipse(62, 38, 13, 10, P.balloonAlt);
  b.ellipse(62, 54, 10, 8, P.balloonAlt);
  b.ellipse(50, 46, 3, 15, P.ink);
  b.circle(50, 30, 4, P.ink);
  b.line(50, 28, 44, 18, 1.4, P.ink);
  b.line(50, 28, 56, 18, 1.4, P.ink);
};

/** 10. Снеговик. */
const snowman: Painter = (b) => {
  b.bg(0xdfeef7);
  ground(b, 74, P.snow);
  b.poly([[84, 74], [74, 74], [79, 52]], P.leafDark);
  b.poly([[86, 62], [72, 62], [79, 44]], P.leafDark);
  b.circle(42, 66, 18, P.snow);
  b.circle(42, 44, 13, P.snow);
  b.circle(42, 28, 9, P.snow);
  b.circle(39, 26, 1.8, P.ink);
  b.circle(45, 26, 1.8, P.ink);
  b.rect(32, 18, 20, 3, P.ink);
  b.rect(36, 10, 12, 9, P.ink);
  b.poly([[42, 30], [54, 32], [42, 34]], P.roof);
  b.line(30, 42, 16, 34, 2, P.wood);
  b.line(54, 42, 68, 34, 2, P.wood);
};

/** 11. Воздушный шар. */
const balloonRide: Painter = (b) => {
  b.bg(P.sky);
  cloud(b, 20, 30, 8);
  cloud(b, 82, 46, 7);
  ground(b, 84, P.grass);
  b.circle(50, 38, 24, P.balloon);
  b.ellipse(42, 38, 5, 23, P.balloonAlt);
  b.ellipse(58, 38, 5, 23, P.balloonAlt);
  b.rect(43, 66, 14, 10, P.wood);
  b.line(38, 56, 44, 66, 1.2, P.woodDark);
  b.line(62, 56, 56, 66, 1.2, P.woodDark);
};

/** 12. Пчёлка и цветы. */
const beeMeadow: Painter = (b) => {
  b.bg(0xdff3ff);
  ground(b, 68, P.grass);
  flower(b, 24, 72, 7, P.petalAlt);
  flower(b, 56, 78, 7, P.petal);
  flower(b, 84, 72, 6, P.petalAlt);
  b.ellipse(46, 34, 13, 9, P.bee);
  b.rect(40, 26, 4, 16, P.ink);
  b.rect(50, 26, 4, 16, P.ink);
  b.circle(60, 34, 7, P.ink);
  b.ellipse(42, 22, 8, 4.5, 0xffffff);
  b.ellipse(52, 22, 8, 4.5, 0xffffff);
};

/** 13. Машинка на дороге. */
const littleCar: Painter = (b) => {
  b.bg(P.sky);
  b.circle(20, 18, 9, P.sun);
  ground(b, 62, P.grass);
  b.rect(0, 70, SIZE, 22, P.road);
  for (let x = 6; x < SIZE; x += 22) b.rect(x, 80, 10, 3, 0xffffff);
  b.rect(22, 52, 46, 14, P.roof);
  b.poly([[32, 52], [40, 40], [58, 40], [62, 52]], P.roof);
  b.rect(41, 42, 15, 9, P.water);
  b.circle(32, 68, 7, P.ink);
  b.circle(58, 68, 7, P.ink);
  b.circle(32, 68, 3, P.metal);
  b.circle(58, 68, 3, P.metal);
};

/** 14. Радуга после дождя. */
const rainbow: Painter = (b) => {
  b.bg(0xd7eefb);
  const colors = [0xe0533f, 0xff9a3e, 0xffd23f, 0x5fbf6a, 0x4aa3d8, 0x7a5fd0];
  colors.forEach((color, i) => b.circle(50, 78, 46 - i * 6, color));
  b.circle(50, 78, 10, 0xd7eefb);
  ground(b, 78, P.grass);
  cloud(b, 16, 30, 8);
  cloud(b, 84, 26, 7);
  flower(b, 34, 86, 4, P.petal);
  flower(b, 66, 88, 4, P.petalAlt);
};

/** 15. Ночь: луна и звёзды над домом. */
const goodNight: Painter = (b) => {
  b.bg(P.skyNight);
  b.circle(76, 22, 12, P.moon);
  b.circle(70, 18, 11, P.skyNight);
  star(b, 20, 18, 5);
  star(b, 36, 30, 3.4);
  star(b, 16, 44, 3);
  star(b, 54, 20, 3.4);
  ground(b, 72, P.ground);
  house(b, 40, 76, 38);
  b.rect(28, 56, 10, 10, P.sun);
  tree(b, 80, 78, 30, P.leafDark);
};

/** Все сцены под своими id. Ключ = id картинки в манифесте. */
export const PAINTERS: Record<string, Painter> = {
  'sunny-day': sunnyDay,
  'cosy-house': cosyHouse,
  'little-boat': littleBoat,
  'rocket': rocketFlight,
  'apple-tree': appleTree,
  'kitten': kitten,
  'aquarium': aquarium,
  'train': train,
  'butterfly': butterfly,
  'snowman': snowman,
  'balloon': balloonRide,
  'bee-meadow': beeMeadow,
  'little-car': littleCar,
  'rainbow': rainbow,
  'good-night': goodNight,
};
