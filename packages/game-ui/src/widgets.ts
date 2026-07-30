import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT, TOP_BAR_H, BUTTON_H } from './tokens.js';
import { DPR, LOGICAL_W } from './viewport.js';

/** Тема бренда из INIT. Совпадает по форме с `BrandTheme` моста, но без зависимости на него. */
export interface Theme {
  primary?: string;
  background?: string;
}

/** Тема бренда из реестра сцены (или null для дефолтной палитры). */
export function getTheme(scene: Scene): Theme | null {
  return (scene.registry.get('theme') as Theme | null) ?? null;
}

/** Хекс-строку темы (#RRGGBB) → число Phaser (0xRRGGBB). */
export function hexToNum(hex?: string): number | undefined {
  if (!hex) return undefined;
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return Number.isNaN(n) ? undefined : n;
}

/** Применяет брендовую тему из INIT поверх дефолтной палитры (цвет фона). */
export function applyTheme(scene: Scene): void {
  const theme = getTheme(scene);
  if (theme?.background) scene.cameras.main.setBackgroundColor(theme.background);
}

/** Затемнить цвет 0xRRGGBB на долю amt (0..1). */
export function darken(color: number, amt: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amt)));
  return (d(r) << 16) | (d(g) << 8) | d(b);
}

export interface Button {
  /** Корневой контейнер (для анимаций появления/пульса). */
  root: Phaser.GameObjects.Container;
  setLabel(s: string): void;
  destroy(): void;
}

/**
 * Кнопка дизайн-системы: плоская, радиус 12, при нажатии заливка темнеет.
 * `primary` — оранжевая заливка (брендовый `theme.primary`, если пришёл в INIT),
 * иначе белая с тонкой обводкой.
 */
export function makeButton(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number; primary?: boolean } = {},
): Button {
  const w = opts.width ?? 248;
  const h = opts.height ?? BUTTON_H.md;
  const isPrimary = !!opts.primary;
  const brandPrimary = isPrimary ? hexToNum(getTheme(scene)?.primary) : undefined;
  const face = isPrimary ? (brandPrimary ?? C.primary) : C.surface;
  const pressedFace = isPrimary ? darken(face, 0.12) : C.tint;
  const left = -w / 2;
  const top = -h / 2;

  const root = scene.add.container(x, y);
  const g = scene.add.graphics();
  const paint = (fill: number) => {
    g.clear();
    g.fillStyle(fill, 1).fillRoundedRect(left, top, w, h, RADIUS.button);
    if (!isPrimary) g.lineStyle(1, C.divider, 1).strokeRoundedRect(left, top, w, h, RADIUS.button);
  };
  paint(face);

  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: FONT,
      fontSize: TYPE.body,
      fontStyle: WEIGHT.semibold,
      color: isPrimary ? S.white : S.ink,
    })
    .setOrigin(0.5)
    .setResolution(DPR);

  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setInteractive({ useHandCursor: true });
  root.add([g, txt, hit]);

  let pressed = false;
  hit.on('pointerdown', () => { pressed = true; paint(pressedFace); });
  hit.on('pointerup', () => { if (pressed) { pressed = false; paint(face); onClick(); } });
  hit.on('pointerout', () => { if (pressed) { pressed = false; paint(face); } });

  return {
    root,
    setLabel: (s: string) => txt.setText(s),
    destroy: () => root.destroy(),
  };
}

/**
 * Шапка экрана: оранжевый градиент, стрелка «назад» слева, заголовок по центру.
 * Повторяет шапку хаба, поэтому переход «каталог → игра» выглядит одним приложением.
 */
export function makeTopBar(
  scene: Scene,
  title: string,
  onBack: () => void,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);

  const bar = scene.add.graphics();
  bar
    .fillGradientStyle(C.topBarLeft, C.topBarRight, C.topBarLeft, C.topBarRight, 1)
    .fillRect(0, 0, LOGICAL_W, TOP_BAR_H);

  const cy = TOP_BAR_H / 2;
  const chevron = scene.add.graphics();
  chevron
    .lineStyle(2, C.white, 1)
    .beginPath();
  chevron.moveTo(41, cy - 8);
  chevron.lineTo(33, cy);
  chevron.lineTo(41, cy + 8);
  chevron.strokePath();

  const heading = scene.add
    .text(LOGICAL_W / 2, cy, title, {
      fontFamily: FONT,
      fontSize: TYPE.title,
      fontStyle: WEIGHT.semibold,
      color: S.white,
    })
    .setOrigin(0.5)
    .setResolution(DPR);

  const hit = scene.add
    .rectangle(36, cy, 48, 48, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', onBack);

  root.add([bar, chevron, heading, hit]);
  return root;
}

/** Белая карточка дизайн-системы: `surface`, радиус 12. Координаты — левый верхний угол. */
export function makeCard(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(C.surface, 1).fillRoundedRect(x, y, w, h, RADIUS.card);
  return g;
}

export interface Chip {
  root: Phaser.GameObjects.Container;
  setText(s: string): void;
  destroy(): void;
}

/**
 * Чип: персиковая плашка с оранжевым текстом. В играх — метрики HUD
 * (счёт, время, ходы), в хабе — метки языка и возраста.
 */
export function makeChip(scene: Scene, x: number, y: number, text: string, minWidth = 0): Chip {
  const root = scene.add.container(x, y);
  const g = scene.add.graphics();
  const txt = scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: TYPE.caption,
      fontStyle: WEIGHT.bold,
      color: S.chipInk,
    })
    .setOrigin(0.5)
    .setResolution(DPR);

  const paint = () => {
    const w = Math.max(minWidth, txt.width + 16);
    const h = 26;
    g.clear();
    g.fillStyle(C.chipBg, 1).fillRoundedRect(-w / 2, -h / 2, w, h, RADIUS.chip);
  };
  paint();

  root.add([g, txt]);
  return {
    root,
    setText: (s: string) => { txt.setText(s); paint(); },
    destroy: () => root.destroy(),
  };
}

/** Ключ текстуры иконки игры (файл `icon.svg` рядом с index.html). */
export const GAME_ICON_KEY = 'gameIcon';

/**
 * Загрузить иконку игры — ту же, что показывает каталог (`hub/icons/<slug>.svg`).
 * Растеризуем с запасом (300 px), в меню уменьшается до нужного размера.
 * Вызывать в `preload()` первой сцены.
 */
export function loadGameIcon(scene: Scene): void {
  scene.load.svg(GAME_ICON_KEY, 'icon.svg', { width: 300, height: 300 });
}

/**
 * Иконка игры в меню. Возвращает контейнер (можно анимировать масштаб),
 * либо null, если файл не загрузился — сцена тогда рисует свой запасной значок.
 */
export function makeGameIcon(
  scene: Scene,
  x: number,
  y: number,
  size = 88,
): Phaser.GameObjects.Container | null {
  if (!scene.textures.exists(GAME_ICON_KEY)) return null;
  const img = scene.add.image(0, 0, GAME_ICON_KEY).setDisplaySize(size, size);
  return scene.add.container(x, y, [img]);
}

/** Всплывающая подсказка: тёмная плашка, сама исчезает. */
export function toast(scene: Scene, x: number, y: number, message: string): void {
  const root = scene.add.container(x, y).setDepth(100);
  const txt = scene.add
    .text(0, 0, message, { fontFamily: FONT, fontSize: TYPE.body, color: S.white })
    .setOrigin(0.5)
    .setResolution(DPR);
  const w = txt.width + 28;
  const h = 40;
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, RADIUS.card);
  root.add([g, txt]);

  scene.tweens.add({
    targets: root, alpha: 0, delay: 1100, duration: 400,
    onComplete: () => root.destroy(),
  });
}
