import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT } from './tokens.js';
import { DPR } from './viewport.js';
import { darken } from './widgets.js';

/**
 * Экран выбора уровня — общий для всех игр каталога.
 * Плитка уровня: номер, три звезды под ним, замок на закрытом. Стиль тот же, что
 * у кнопок и клавиш: плоская белая карточка, тонкая обводка, скругление 12.
 */

/** Сторона плитки уровня и зазор между плитками. */
export const TILE = 60;
export const TILE_GAP = 12;
/** Плиток в ряду: 5 × 60 + 4 × 12 = 348 — влезает в поле 400 с полями по 26. */
export const PER_ROW = 5;

/** Высота сетки для `count` уровней — игре нужно знать, сколько места занять. */
export function levelGridHeight(count: number): number {
  const rows = Math.ceil(count / PER_ROW);
  return rows * TILE + Math.max(0, rows - 1) * TILE_GAP;
}

/** Пятиконечная звезда в точке (x, y); `r` — радиус описанной окружности. */
function drawStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillPath();
}

/**
 * Ряд из трёх звёзд: заработанные — золотые, остальные — бледные.
 * Используется и на плитке уровня, и на экране итога партии.
 *
 * `empty` задаёт вид незаработанных: на белом это серый `C.divider`, а на
 * оранжевой плитке текущего уровня — полупрозрачный белый, иначе бледно-серые
 * звёзды на оранжевом читаются как уже заработанные.
 */
export function makeStarRow(
  scene: Scene,
  x: number,
  y: number,
  earned: number,
  size = 10,
  empty: { color: number; alpha: number } = { color: C.divider, alpha: 1 },
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const step = size * 2.2;
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * step;
    if (i < earned) drawStar(g, cx, 0, size, C.gold);
    else drawStar(g, cx, 0, size, empty.color, empty.alpha);
  }
  return scene.add.container(x, y, [g]);
}

/** Дужка и корпус замка — закрытый уровень. */
function drawLock(g: Phaser.GameObjects.Graphics, size: number): void {
  const w = size * 0.62, h = size * 0.5, r = size * 0.26;
  g.lineStyle(size * 0.14, C.muted, 1);
  g.beginPath();
  g.arc(0, -h * 0.55, r, Math.PI, 0);
  g.strokePath();
  g.fillStyle(C.muted, 1).fillRoundedRect(-w / 2, -h * 0.15, w, h, size * 0.12);
}

export interface LevelTileState {
  n: number;
  /** Открыт ли уровень (закрытый не нажимается). */
  unlocked: boolean;
  /** Заработанные звёзды: 0 — не пройден. */
  stars: number;
  /** Уровень, который игра предлагает следующим — выделен основным цветом. */
  current?: boolean;
}

export interface LevelGrid {
  root: Phaser.GameObjects.Container;
  /** Высота сетки — чтобы разместить кнопки под ней. */
  height: number;
  destroy(): void;
}

/**
 * Сетка уровней с центром ряда в `x`. `y` — верх сетки.
 * Закрытые уровни показывают замок и не реагируют на тап.
 */
export function makeLevelGrid(
  scene: Scene,
  x: number,
  y: number,
  levels: readonly LevelTileState[],
  onPick: (n: number) => void,
): LevelGrid {
  const root = scene.add.container(0, 0);
  const rowWidth = PER_ROW * TILE + (PER_ROW - 1) * TILE_GAP;
  const left = x - rowWidth / 2 + TILE / 2;

  levels.forEach((lv, i) => {
    const cx = left + (i % PER_ROW) * (TILE + TILE_GAP);
    const cy = y + TILE / 2 + Math.floor(i / PER_ROW) * (TILE + TILE_GAP);
    root.add(makeLevelTile(scene, cx, cy, lv, onPick));
  });

  return {
    root,
    height: levelGridHeight(levels.length),
    destroy: () => root.destroy(),
  };
}

function makeLevelTile(
  scene: Scene,
  x: number,
  y: number,
  lv: LevelTileState,
  onPick: (n: number) => void,
): Phaser.GameObjects.Container {
  const half = TILE / 2;
  const face = lv.current ? C.primary : C.surface;
  const g = scene.add.graphics();
  const paint = (fill: number) => {
    g.clear();
    g.fillStyle(fill, 1).fillRoundedRect(-half, -half, TILE, TILE, RADIUS.card);
    if (fill === C.surface) g.lineStyle(1, C.divider, 1).strokeRoundedRect(-half, -half, TILE, TILE, RADIUS.card);
  };
  paint(face);

  const items: Phaser.GameObjects.GameObject[] = [g];

  if (lv.unlocked) {
    // Номер поднят на 6 px: под ним живёт ряд звёзд.
    items.push(
      scene.add
        .text(0, -6, String(lv.n), {
          fontFamily: FONT,
          fontSize: TYPE.title,
          fontStyle: WEIGHT.bold,
          color: lv.current ? S.white : S.ink,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
    );
    const empty = lv.current
      ? { color: C.white, alpha: 0.38 }
      : { color: C.divider, alpha: 1 };
    items.push(makeStarRow(scene, 0, 15, lv.stars, 5, empty));
  } else {
    const lock = scene.add.graphics();
    drawLock(lock, TILE * 0.44);
    items.push(scene.add.container(0, 0, [lock]));
  }

  const root = scene.add.container(x, y, items);
  if (!lv.unlocked) return root;

  const hit = scene.add.rectangle(0, 0, TILE, TILE, 0x000000, 0).setInteractive({ useHandCursor: true });
  root.add(hit);

  let pressed = false;
  hit.on('pointerdown', () => { pressed = true; paint(face === C.surface ? C.tint : darken(face, 0.12)); });
  hit.on('pointerup', () => { if (pressed) { pressed = false; paint(face); onPick(lv.n); } });
  hit.on('pointerout', () => { if (pressed) { pressed = false; paint(face); } });
  return root;
}

/**
 * Полоса прогресса лестницы: «Уровень 7 из 20» и собранные звёзды.
 * Одна строка под шапкой — игрок сразу видит, сколько ещё впереди.
 */
export function makeLadderSummary(
  scene: Scene,
  x: number,
  y: number,
  text: string,
  stars: number,
  maxStars: number,
): Phaser.GameObjects.Container {
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: TYPE.body, color: S.muted })
    .setOrigin(0.5, 0.5)
    .setResolution(DPR);
  const counter = scene.add
    .text(0, 20, `★ ${stars} / ${maxStars}`, {
      fontFamily: FONT, fontSize: TYPE.body, fontStyle: WEIGHT.semibold, color: S.gold,
    })
    .setOrigin(0.5, 0.5)
    .setResolution(DPR);
  return scene.add.container(x, y, [label, counter]);
}
