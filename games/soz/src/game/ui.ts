import { Scene } from 'phaser';
import { COLORS, FONT } from './palette';

export interface Button {
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
  setLabel(s: string): void;
  destroy(): void;
}

/** Простая кнопка: прямоугольник + текст, hover/tap. Тап-таргет ≥ 44px. */
export function makeButton(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number } = {},
): Button {
  const w = opts.width ?? 240;
  const h = opts.height ?? 48;
  const bg = scene.add
    .rectangle(x, y, w, h, COLORS.panel)
    .setStrokeStyle(1, COLORS.emptyBorder)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add
    .text(x, y, label, { fontFamily: FONT, fontSize: 18, color: '#e9e9ea' })
    .setOrigin(0.5);
  bg.on('pointerover', () => bg.setFillStyle(COLORS.emptyBorder));
  bg.on('pointerout', () => bg.setFillStyle(COLORS.panel));
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
      fontFamily: FONT, fontSize: 16, color: '#111317',
      backgroundColor: '#e9e9ea', padding: { x: 12, y: 8 },
    })
    .setOrigin(0.5)
    .setDepth(100);
  scene.tweens.add({
    targets: t, alpha: 0, delay: 1100, duration: 400,
    onComplete: () => t.destroy(),
  });
}
