import type { Scene } from 'phaser';
import { C, S, FONT, WEIGHT } from './tokens.js';
import { DPR } from './viewport.js';
import { sparkle } from './motion.js';

/**
 * Счётчик бонусов в хедере и анимация начисления «+N летит в счётчик».
 *
 * Баланс чип читает из localStorage сам: ключ продублирован из
 * @gamewingo/game-progress осознанно — game-ui остаётся без зависимостей.
 * Начисляет всегда game-progress (а в проде — сервер), здесь только показ.
 */
const KEY = 'wingo:bonus';

export function readBonusBalance(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = Number((JSON.parse(raw) as { balance?: number }).balance);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  } catch {
    return 0;
  }
}

/** Высота чипа и радиус — совпадают с чипами дизайн-системы. */
const H = 26;

/** Золотая монетка с бликом; `r` — радиус. */
function drawCoin(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  g.fillStyle(C.gold, 1).fillCircle(cx, cy, r);
  g.fillStyle(C.goldSoft, 1).fillCircle(cx, cy, r * 0.62);
  g.fillStyle(C.gold, 1).fillCircle(cx, cy, r * 0.34);
  g.fillStyle(C.white, 0.5).fillEllipse(cx - r * 0.34, cy - r * 0.4, r * 0.5, r * 0.3);
}

export interface BonusChip {
  root: Phaser.GameObjects.Container;
  setValue(n: number): void;
  /**
   * Анимация начисления: «+N» появляется в (fromX, fromY), летит в чип,
   * чип вспыхивает, а число докручивается до нового баланса.
   */
  award(amount: number, fromX: number, fromY: number): void;
  destroy(): void;
}

/**
 * Чип баланса, прижатый правым краем к `rightX` на высоте `cy`.
 * `onBar` — вариант для оранжевой шапки (полупрозрачная подложка, белый текст);
 * без него — белая карточка с обводкой для светлых экранов.
 */
export function makeBonusChip(
  scene: Scene,
  rightX: number,
  cy: number,
  opts: { onBar?: boolean } = {},
): BonusChip {
  const onBar = !!opts.onBar;
  const root = scene.add.container(rightX, cy).setDepth(1500);
  const bg = scene.add.graphics();
  const coin = scene.add.graphics();
  const txt = scene.add
    .text(0, 0, '', {
      fontFamily: FONT,
      fontSize: 14,
      fontStyle: WEIGHT.semibold,
      color: onBar ? S.white : S.ink,
    })
    .setOrigin(0, 0.5)
    .setResolution(DPR);
  root.add([bg, coin, txt]);

  let value = readBonusBalance();

  // Вся геометрия рисуется влево от нуля — правый край чипа зафиксирован.
  const layout = () => {
    txt.setText(String(value));
    const w = 10 + 16 + 5 + txt.width + 11;
    bg.clear();
    if (onBar) {
      bg.fillStyle(C.white, 0.22).fillRoundedRect(-w, -H / 2, w, H, H / 2);
    } else {
      bg.fillStyle(C.surface, 1).fillRoundedRect(-w, -H / 2, w, H, H / 2);
      bg.lineStyle(1, C.divider, 1).strokeRoundedRect(-w, -H / 2, w, H, H / 2);
    }
    coin.clear();
    drawCoin(coin, -w + 18, 0, 8);
    txt.x = -w + 31;
  };
  layout();

  const countUpTo = (target: number) => {
    const proxy = { v: value };
    scene.tweens.add({
      targets: proxy,
      v: target,
      duration: 450,
      ease: 'Quad.easeOut',
      onUpdate: () => { value = Math.round(proxy.v); layout(); },
      onComplete: () => { value = target; layout(); },
    });
  };

  return {
    root,
    setValue: (n) => { value = Math.max(0, Math.round(n)); layout(); },
    award: (amount, fromX, fromY) => {
      if (amount <= 0) return;
      const target = value + amount;

      // «+N» с монеткой: рождается в точке события…
      const fly = scene.add.container(fromX, fromY).setDepth(2000).setScale(0);
      const fcoin = scene.add.graphics();
      drawCoin(fcoin, -6, 0, 9);
      const ftxt = scene.add
        .text(6, 0, `+${amount}`, {
          fontFamily: FONT, fontSize: 22, fontStyle: WEIGHT.bold, color: S.gold,
        })
        .setOrigin(0, 0.5)
        .setResolution(DPR);
      fly.add([fcoin, ftxt]);

      scene.tweens.add({ targets: fly, scale: 1, duration: 260, ease: 'Back.easeOut' });
      // …висит, чтобы игрок успел прочитать, и улетает в чип.
      scene.tweens.add({
        targets: fly,
        x: root.x - 30,
        y: root.y,
        scale: 0.4,
        delay: 780,
        duration: 520,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          fly.destroy();
          // Искры в момент зачисления: баланс не просто меняет цифру.
          sparkle(scene, root.x - 24, root.y, { count: 14, power: 0.7, depth: 2400 });
          countUpTo(target);
          scene.tweens.add({
            targets: root, scale: 1.18, duration: 130, yoyo: true, ease: 'Quad.easeOut',
          });
        },
      });
    },
    destroy: () => root.destroy(),
  };
}
