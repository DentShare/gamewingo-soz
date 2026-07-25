import { Scene } from 'phaser';
import type { BrandTheme } from '@gamewingo/game-bridge';
import { COLORS, FONT } from './palette';

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
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
  setLabel(s: string): void;
  destroy(): void;
}

/** Простая кнопка: прямоугольник + текст, hover/tap. Тап-таргет ≥ 44px.
 *  `primary` — заливка брендовым `theme.primary` (если задан) для главной CTA. */
export function makeButton(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number; primary?: boolean } = {},
): Button {
  const w = opts.width ?? 240;
  const h = opts.height ?? 48;
  const isPrimary = !!opts.primary;
  const brandPrimary = isPrimary ? hexToNum(getTheme(scene)?.primary) : undefined;
  const base = isPrimary ? (brandPrimary ?? COLORS.primary) : COLORS.panel;
  const hover = isPrimary ? base : COLORS.panelHover;
  const border = isPrimary ? base : COLORS.panelBorder;
  const bg = scene.add
    .rectangle(x, y, w, h, base)
    .setStrokeStyle(1, border)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add
    .text(x, y, label, { fontFamily: FONT, fontSize: 18, color: isPrimary ? '#ffffff' : COLORS.headText })
    .setOrigin(0.5);
  bg.on('pointerover', () => bg.setFillStyle(hover));
  bg.on('pointerout', () => bg.setFillStyle(base));
  bg.on('pointerup', onClick);
  return {
    bg,
    txt,
    setLabel: (s: string) => txt.setText(s),
    destroy: () => { bg.destroy(); txt.destroy(); },
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
    .setDepth(100);
  scene.tweens.add({
    targets: t, alpha: 0, delay: 1100, duration: 400,
    onComplete: () => t.destroy(),
  });
}
