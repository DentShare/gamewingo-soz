import { Scene } from 'phaser';
import type { Locale } from '../core/locale';
import { COLORS, FONT } from './palette';
import { t } from '../i18n';
import { makeButton } from './ui';
import { DPR } from './dpr';

/** Прямоугольник в координатах сцены (400×720). */
export interface Rect { x: number; y: number; w: number; h: number; }

/** Зоны интерфейса, которые подсвечивает обучение. */
export interface OnboardingTargets {
  /** Игровое поле 4×4. */
  board: Rect;
  /** Блок счёта и рекорда в шапке. */
  hud: Rect;
}

export interface OnboardingHooks {
  /**
   * Выполняет НАСТОЯЩИЙ ход на реальном поле, при котором две плитки «2» сливаются в «4».
   * Возвращает прямоугольник получившейся плитки (для подсветки) или null, если хода не было.
   */
  demoMerge(): Rect | null;
}

const W = 400;
const H = 720;
const DIM = 0x1a1a1a;
const DIM_ALPHA = 0.74;
const DEPTH = 1000;
const TOTAL_STEPS = 4;

/** Карточка с текстом: размеры и внутренняя раскладка. */
const CARD_W = 344;
const CARD_H = 156;

/**
 * Карточка всегда под полем и не двигается между шагами — перемещается только
 * подсветка, так что кнопка «Далее» остаётся под пальцем.
 */
const CARD_CY = 602;

interface Step {
  target: keyof OnboardingTargets;
  textKey: string;
  pad: number;
  radius: number;
  /** Шаг с реальным слиянием на поле. */
  demo?: boolean;
}

/**
 * Пошаговое обучение поверх РЕАЛЬНОГО игрового поля: затемняет экран, подсвечивает
 * зону и объясняет правило. Второй шаг делает настоящий ход со слиянием — игрок
 * видит, как «2» + «2» превращаются в «4», а не читает об этом.
 * Игровой ввод на время обучения блокирует вызывающая сцена.
 */
export function startOnboarding(
  scene: Scene,
  locale: Locale,
  targets: OnboardingTargets,
  hooks: OnboardingHooks,
  onDone: () => void,
): void {
  new Onboarding(scene, locale, targets, hooks, onDone).show(0);
}

class Onboarding {
  private layer?: Phaser.GameObjects.Container;

  private readonly steps: Step[] = [
    { target: 'board', textKey: 'onboarding.swipe', pad: 5, radius: 18 },
    { target: 'board', textKey: 'onboarding.merge', pad: 5, radius: 18, demo: true },
    { target: 'hud', textKey: 'onboarding.score', pad: 8, radius: 10 },
    { target: 'board', textKey: 'onboarding.goal', pad: 5, radius: 18 },
  ];

  constructor(
    private scene: Scene,
    private locale: Locale,
    private targets: OnboardingTargets,
    private hooks: OnboardingHooks,
    private onDone: () => void,
  ) {}

  show(step: number): void {
    this.layer?.destroy();
    const layer = this.scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
    this.layer = layer;

    // Полноэкранный перехватчик ввода: пока идёт обучение, тапы не доходят до игры.
    const blocker = this.scene.add.rectangle(0, 0, W, H, 0, 0).setOrigin(0, 0).setInteractive();
    blocker.on('pointerdown', () => { /* поглощаем */ });
    layer.add(blocker);

    const cfg = this.steps[step];
    const hole = padClamp(this.targets[cfg.target], cfg.pad);
    this.dimAround(layer, hole);
    this.strokeHole(layer, hole, cfg.radius);
    this.captionCard(layer, CARD_CY, t(this.locale, cfg.textKey), step);
    this.skipLink(layer);

    if (cfg.demo) this.runDemoMerge(layer);

    this.scene.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  /** Настоящий ход на поле + подсветка получившейся плитки «4». */
  private runDemoMerge(layer: Phaser.GameObjects.Container): void {
    this.scene.time.delayedCall(620, () => {
      if (this.layer !== layer) return; // игрок уже ушёл дальше
      const merged = this.hooks.demoMerge();
      if (!merged || this.layer !== layer) return;
      const r = padClamp(merged, 4);
      const g = this.scene.add.graphics();
      g.lineStyle(3, COLORS.primary, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
      layer.add(g);
      this.scene.tweens.add({
        targets: g, alpha: 0.35, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });
  }

  private next(step: number): void {
    if (step < TOTAL_STEPS - 1) this.show(step + 1);
    else this.finish();
  }

  private finish(): void {
    const layer = this.layer;
    this.layer = undefined;
    if (!layer) { this.onDone(); return; }
    this.scene.tweens.add({
      targets: layer, alpha: 0, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => { layer.destroy(); this.onDone(); },
    });
  }

  // ── Примитивы ────────────────────────────────────────────────────────────────

  /** Затемняем всё, кроме «дырки» вокруг подсвеченной зоны (4 полосы). */
  private dimAround(layer: Phaser.GameObjects.Container, hole: Rect): void {
    const strip = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      layer.add(this.scene.add.rectangle(x, y, w, h, DIM, DIM_ALPHA).setOrigin(0, 0));
    };
    strip(0, 0, W, hole.y); // сверху
    strip(0, hole.y + hole.h, W, H - (hole.y + hole.h)); // снизу
    strip(0, hole.y, hole.x, hole.h); // слева
    strip(hole.x + hole.w, hole.y, W - (hole.x + hole.w), hole.h); // справа
  }

  /** Яркая рамка вокруг подсвеченной зоны + мягкая пульсация. */
  private strokeHole(layer: Phaser.GameObjects.Container, hole: Rect, radius: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, COLORS.primary, 1).strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, radius);
    layer.add(g);
    this.scene.tweens.add({
      targets: g, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private captionCard(layer: Phaser.GameObjects.Container, cy: number, text: string, step: number): void {
    this.card(layer, 200, cy, CARD_W, CARD_H);
    layer.add(
      this.scene.add
        .text(200, cy - 40, text, {
          fontFamily: FONT, fontSize: 17, color: COLORS.headText,
          align: 'center', wordWrap: { width: CARD_W - 44 }, lineSpacing: 3,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
    );
    this.dots(layer, 200, cy + 14, step);
    this.nextButton(layer, 200, cy + 46, step);
  }

  /** Белая карточка со скруглением, тенью и тонкой рамкой. */
  private card(layer: Phaser.GameObjects.Container, cx: number, cy: number, w: number, h: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.14).fillRoundedRect(cx - w / 2, cy - h / 2 + 5, w, h, 18);
    g.fillStyle(COLORS.panel, 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 18);
    g.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 18);
    layer.add(g);
  }

  /** Индикатор шага (точки). */
  private dots(layer: Phaser.GameObjects.Container, cx: number, y: number, active: number): void {
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const dx = cx - (TOTAL_STEPS - 1) * 8 + i * 16;
      const color = i === active ? COLORS.primary : COLORS.panelBorder;
      layer.add(this.scene.add.circle(dx, y, i === active ? 4.5 : 3.5, color));
    }
  }

  private nextButton(layer: Phaser.GameObjects.Container, cx: number, y: number, step: number): void {
    const last = step === TOTAL_STEPS - 1;
    const label = t(this.locale, last ? 'onboarding.done' : 'onboarding.next');
    const btn = makeButton(this.scene, cx, y, label, () => this.next(step), {
      primary: true, width: 160, height: 44,
    });
    layer.add(btn.root);
  }

  private skipLink(layer: Phaser.GameObjects.Container): void {
    const link = this.scene.add
      .text(200, 700, t(this.locale, 'onboarding.skip'), {
        fontFamily: FONT, fontSize: 14, color: '#ffffff',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setInteractive({ useHandCursor: true });
    link.on('pointerup', () => this.finish());
    layer.add(link);
  }
}

/** Расширяет прямоугольник на `p` и обрезает по экрану. */
function padClamp(r: Rect, p: number): Rect {
  const x = Math.max(0, r.x - p);
  const y = Math.max(0, r.y - p);
  const right = Math.min(W, r.x + r.w + p);
  const bottom = Math.min(H, r.y + r.h + p);
  return { x, y, w: right - x, h: bottom - y };
}
