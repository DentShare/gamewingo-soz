import type { Scene } from 'phaser';
import { C, RADIUS, TYPE, WEIGHT } from '@gamewingo/game-ui';
import { COLORS, FONT } from './palette';
import { DPR } from './dpr';

/**
 * Кнопка варианта ответа. Отдельный виджет, а не общий makeButton: текст здесь
 * многострочный (вопросы бывают длинными), а после ответа кнопка перекрашивается
 * в «верно»/«неверно» — общей кнопке такое состояние не нужно.
 */

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dim';

export interface Option {
  root: Phaser.GameObjects.Container;
  /** Высота кнопки — зависит от числа строк текста. */
  readonly height: number;
  setState(state: OptionState): void;
  /** Отключить нажатия (после ответа). */
  lock(): void;
  destroy(): void;
}

export const OPTION_W = 336;
const MIN_H = 48;
const PAD_Y = 14;

export function makeOption(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  onPick: () => void,
): Option {
  const root = scene.add.container(x, y);
  const g = scene.add.graphics();

  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: FONT,
      fontSize: TYPE.body,
      fontStyle: WEIGHT.semibold,
      color: COLORS.optionText,
      align: 'center',
      wordWrap: { width: OPTION_W - 28 },
    })
    .setOrigin(0.5)
    .setResolution(DPR);

  const h = Math.max(MIN_H, txt.height + PAD_Y * 2);
  const hit = scene.add.rectangle(0, 0, OPTION_W, h, 0x000000, 0).setInteractive({ useHandCursor: true });

  const paint = (fill: number, border: boolean) => {
    g.clear();
    g.fillStyle(fill, 1).fillRoundedRect(-OPTION_W / 2, -h / 2, OPTION_W, h, RADIUS.button);
    if (border) {
      g.lineStyle(1, C.divider, 1).strokeRoundedRect(-OPTION_W / 2, -h / 2, OPTION_W, h, RADIUS.button);
    }
  };
  paint(COLORS.optionFace, true);
  root.add([g, txt, hit]);

  let locked = false;
  let pressed = false;
  hit.on('pointerdown', () => {
    if (locked) return;
    pressed = true;
    paint(COLORS.optionPressed, true);
  });
  hit.on('pointerup', () => {
    if (locked || !pressed) return;
    pressed = false;
    paint(COLORS.optionFace, true);
    onPick();
  });
  hit.on('pointerout', () => {
    if (!pressed) return;
    pressed = false;
    paint(COLORS.optionFace, true);
  });

  return {
    root,
    height: h,
    setState(state: OptionState) {
      switch (state) {
        case 'correct':
          paint(COLORS.correctFace, false);
          txt.setColor(COLORS.correctText);
          break;
        case 'wrong':
          paint(COLORS.wrongFace, false);
          txt.setColor(COLORS.wrongText);
          break;
        case 'dim':
          paint(COLORS.optionFace, true);
          txt.setColor(COLORS.headMuted);
          root.setAlpha(0.7);
          break;
        default:
          paint(COLORS.optionFace, true);
          txt.setColor(COLORS.optionText);
          root.setAlpha(1);
      }
    },
    lock() {
      locked = true;
      hit.disableInteractive();
    },
    destroy: () => root.destroy(),
  };
}
