import { Scene } from 'phaser';
import type { Locale } from '../core/locale';
import { COLORS, FONT } from './palette';
import { t } from '../i18n';
import { makeButton } from './ui';
import { DPR } from './dpr';

/** Прямоугольник в координатах сцены (400×720). */
export interface Rect { x: number; y: number; w: number; h: number; }

/** Один шаг обучения: что подсветить, что рассказать и что показать перед этим. */
export interface OnboardingStep {
  /**
   * Зона подсветки. Функция, а не готовый прямоугольник: поле живое, и к моменту
   * показа шага плитка могла переехать (см. `before`).
   */
  rect: () => Rect;
  /** Ключ i18n с текстом шага. */
  textKey: string;
  /**
   * Демонстрация перед показом карточки: затемнения ещё нет, игрок видит чистое
   * поле. Обязана вызвать `done`, когда анимация закончилась.
   */
  before?: (done: () => void) => void;
  /** Запас вокруг зоны подсветки (px). */
  pad?: number;
  /** Радиус скругления рамки. */
  radius?: number;
  /** Отступ карточки от подсветки. */
  gap?: number;
}

const W = 400;
const H = 720;
const DIM = 0x241a12;
const DIM_ALPHA = 0.74;
const DEPTH = 1000;
const CARD_W = 320;
/** Ниже этой линии карточка не опускается — там живёт ссылка «Пропустить». */
const CARD_BOTTOM_LIMIT = 696;
const SKIP_Y = 710;

/**
 * Пошаговое обучение поверх ЖИВОГО игрового поля: затемняет экран, по очереди
 * подсвечивает зоны из `steps` и показывает подпись. Шаг может сначала проиграть
 * демонстрацию (`before`) — например, реальный ход плитки.
 *
 * Игровой ввод на это время блокирует вызывающая сцена; здесь дополнительно стоит
 * полноэкранный перехватчик тапов.
 */
export function startOnboarding(
  scene: Scene,
  locale: Locale,
  steps: OnboardingStep[],
  onDone: () => void,
): void {
  new Onboarding(scene, locale, steps, onDone).show(0);
}

class Onboarding {
  private layer?: Phaser.GameObjects.Container;

  constructor(
    private scene: Scene,
    private locale: Locale,
    private steps: OnboardingStep[],
    private onDone: () => void,
  ) {}

  show(step: number): void {
    this.layer?.destroy();
    const layer = this.scene.add.container(0, 0).setDepth(DEPTH);
    this.layer = layer;

    // Полноэкранный перехватчик ввода: пока идёт обучение, тапы не доходят до игры.
    const blocker = this.scene.add.rectangle(0, 0, W, H, 0, 0).setOrigin(0, 0).setInteractive();
    blocker.on('pointerdown', () => { /* поглощаем */ });
    layer.add(blocker);

    const cfg = this.steps[step];
    const render = () => {
      if (this.layer !== layer) return; // обучение закрыли, пока шла демонстрация
      const body = this.scene.add.container(0, 0).setAlpha(0);
      layer.add(body);
      this.renderSpotlight(body, cfg, step);
      this.scene.tweens.add({ targets: body, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
    };

    // Есть демонстрация — сначала проигрываем её на чистом (незатемнённом) поле.
    if (cfg.before) cfg.before(render);
    else render();
  }

  private next(step: number): void {
    if (step < this.steps.length - 1) this.show(step + 1);
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

  // ── Шаг ──────────────────────────────────────────────────────────────────────

  private renderSpotlight(layer: Phaser.GameObjects.Container, cfg: OnboardingStep, step: number): void {
    const hole = padClamp(cfg.rect(), cfg.pad ?? 6);
    this.dimAround(layer, hole);
    this.strokeHole(layer, hole, cfg.radius ?? 14);
    this.captionCard(layer, hole, cfg, t(this.locale, cfg.textKey), step);
    this.skipLink(layer, step);
  }

  /** Затемняем всё, кроме «дырки» вокруг подсвеченной зоны (4 полосы). */
  private dimAround(layer: Phaser.GameObjects.Container, hole: Rect): void {
    const strip = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      layer.add(this.scene.add.rectangle(x, y, w, h, DIM, DIM_ALPHA).setOrigin(0, 0));
    };
    strip(0, 0, W, hole.y);                                        // сверху
    strip(0, hole.y + hole.h, W, H - (hole.y + hole.h));           // снизу
    strip(0, hole.y, hole.x, hole.h);                              // слева
    strip(hole.x + hole.w, hole.y, W - (hole.x + hole.w), hole.h);  // справа
  }

  /** Яркая рамка вокруг подсвеченной зоны + мягкая пульсация. */
  private strokeHole(layer: Phaser.GameObjects.Container, hole: Rect, radius: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, COLORS.primary, 1).strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, radius);
    layer.add(g);
    this.scene.tweens.add({ targets: g, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Белая карточка: текст, точки-индикатор слева и кнопка «Далее»/«Понятно» справа. */
  private captionCard(
    layer: Phaser.GameObjects.Container,
    hole: Rect,
    cfg: OnboardingStep,
    text: string,
    step: number,
  ): void {
    const padX = 20;
    const padTop = 16;
    const padBottom = 14;
    const rowH = 40;
    const textGap = 14;

    // Текст создаём первым — по его высоте считаем высоту карточки.
    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: FONT, fontSize: 16, color: COLORS.headText,
        align: 'center', wordWrap: { width: CARD_W - padX * 2 }, lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setResolution(DPR);

    const h = padTop + label.height + textGap + rowH + padBottom;
    const top = placeCard(hole, cfg.gap ?? 14, h);
    const cx = W / 2;

    this.card(layer, cx, top + h / 2, CARD_W, h);
    label.setPosition(cx, top + padTop);
    layer.add(label);

    const rowCy = top + h - padBottom - rowH / 2;
    this.dots(layer, cx - CARD_W / 2 + 58, rowCy, step);
    this.nextButton(layer, cx + CARD_W / 2 - 90, rowCy, step);
  }

  // ── Общие примитивы ──────────────────────────────────────────────────────────

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
    const n = this.steps.length;
    for (let i = 0; i < n; i++) {
      const dx = cx - (n - 1) * 7 + i * 14;
      const color = i === active ? COLORS.primary : COLORS.panelBorder;
      layer.add(this.scene.add.circle(dx, y, i === active ? 4.5 : 3.5, color));
    }
  }

  private nextButton(layer: Phaser.GameObjects.Container, cx: number, y: number, step: number): void {
    const last = step === this.steps.length - 1;
    const label = t(this.locale, last ? 'onboarding.done' : 'onboarding.next');
    const btn = makeButton(this.scene, cx, y, label, () => this.next(step), { primary: true, width: 140, height: 40 });
    layer.add(btn.root);
  }

  /** «Пропустить» под карточкой. На последнем шаге не нужна — там уже «Понятно». */
  private skipLink(layer: Phaser.GameObjects.Container, step: number): void {
    if (step === this.steps.length - 1) return;
    const link = this.scene.add
      .text(W / 2, SKIP_Y, t(this.locale, 'onboarding.skip'), {
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

/** Верхняя граница карточки высотой `h`: под подсветкой, иначе над ней, иначе с прижимом вниз. */
function placeCard(hole: Rect, gap: number, h: number): number {
  const below = hole.y + hole.h + gap;
  if (below + h <= CARD_BOTTOM_LIMIT) return below;
  const above = hole.y - gap - h;
  if (above >= 12) return above;
  return Math.max(12, Math.min(below, CARD_BOTTOM_LIMIT - h));
}
