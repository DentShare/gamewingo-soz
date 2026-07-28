import { Scene } from 'phaser';
import type { BrandTheme } from '@gamewingo/game-bridge';
import { COLORS, FONT } from './palette';
import { DPR, LOGICAL_W, LOGICAL_H } from './dpr';

/** Настраивает камеру сцены на плотный рендер: zoom = DPR, вёрстка в логических 400×720. */
export function setupCamera(scene: Scene): void {
  scene.cameras.main.setZoom(DPR);
  scene.cameras.main.centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
}

/** Тема бренда из INIT (или null для дефолтной палитры). */
export function getTheme(scene: Scene): BrandTheme | null {
  return (scene.registry.get('theme') as BrandTheme | null) ?? null;
}

/** Хекс-строку темы (#RRGGBB) → число Phaser (0xRRGGBB). */
function hexToNum(hex?: string): number | undefined {
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

export interface Button {
  /** Корневой контейнер (для анимаций появления/пульса). */
  root: Phaser.GameObjects.Container;
  setLabel(s: string): void;
  destroy(): void;
}

/** Затемнить цвет 0xRRGGBB на долю amt (0..1) — для нижнего 3D-бортика. */
export function darken(color: number, amt: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amt)));
  return (d(r) << 16) | (d(g) << 8) | d(b);
}

/**
 * Объёмная «чанки»-кнопка: тёмный нижний бортик + приподнятая лицевая часть,
 * вдавливается при нажатии. `primary` — брендовый `theme.primary` для CTA.
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
  const h = opts.height ?? 52;
  const isPrimary = !!opts.primary;
  const brandPrimary = isPrimary ? hexToNum(getTheme(scene)?.primary) : undefined;
  const face = isPrimary ? (brandPrimary ?? COLORS.primary) : COLORS.panel;
  const lipColor = darken(face, isPrimary ? 0.28 : 0.14);
  const lip = 6;
  const r = 14;
  const left = -w / 2;
  const top = -h / 2;

  const root = scene.add.container(x, y);

  // Нижний бортик (тёмная база), выступает на `lip` снизу.
  const baseG = scene.add.graphics();
  baseG.fillStyle(lipColor, 1).fillRoundedRect(left, top, w, h, r);

  // Лицевая часть (поднята на `lip` вверх) + текст.
  const faceC = scene.add.container(0, -lip);
  const faceG = scene.add.graphics();
  faceG.fillStyle(face, 1).fillRoundedRect(left, top, w, h, r);
  if (!isPrimary) faceG.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(left, top, w, h, r);
  const txt = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: 18, color: isPrimary ? '#ffffff' : COLORS.headText })
    .setOrigin(0.5)
    .setResolution(DPR);
  faceC.add([faceG, txt]);

  const hit = scene.add.rectangle(0, -lip / 2, w, h + lip, 0x000000, 0).setInteractive({ useHandCursor: true });
  root.add([baseG, faceC, hit]);

  let pressed = false;
  const press = (down: boolean) => { faceC.y = down ? -1 : -lip; };
  hit.on('pointerdown', () => { pressed = true; press(true); });
  hit.on('pointerup', () => { if (pressed) { pressed = false; press(false); onClick(); } });
  hit.on('pointerout', () => { if (pressed) { pressed = false; press(false); } });

  return {
    root,
    setLabel: (s: string) => txt.setText(s),
    destroy: () => root.destroy(),
  };
}

/** Всплывающая подсказка внизу, сама исчезает. */
export function toast(scene: Scene, x: number, y: number, message: string): void {
  const t = scene.add
    .text(x, y, message, {
      fontFamily: FONT, fontSize: 16, color: COLORS.toastText,
      backgroundColor: COLORS.toastBg, padding: { x: 12, y: 8 },
    })
    .setOrigin(0.5)
    .setResolution(DPR)
    .setDepth(100);
  scene.tweens.add({
    targets: t, alpha: 0, delay: 1100, duration: 400,
    onComplete: () => t.destroy(),
  });
}
