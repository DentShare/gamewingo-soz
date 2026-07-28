import { Scene } from 'phaser';
import type { Locale } from '../core/locale';
import { COLORS, FONT } from './palette';
import { t } from '../i18n';
import { makeButton, darken } from './ui';
import { DPR } from './dpr';

/** Прямоугольник в координатах сцены (400×720). */
export interface Rect { x: number; y: number; w: number; h: number; }

export interface OnboardingStep {
  /** Ключ i18n для текста подсказки. */
  textKey: string;
  /** Подсвечиваемая зона; вычисляется в момент показа шага (после `prepare`). */
  target: () => Rect;
  /** Отступ «дырки» вокруг зоны. */
  pad?: number;
  /** Радиус скругления рамки. */
  radius?: number;
  /** Демонстрация на реальном поле перед показом подсказки (например, переворот карточек). */
  prepare?: () => void;
}

const W = 400;
const H = 720;
const DIM = 0x241a12;
const DIM_ALPHA = 0.74;
const DEPTH = 1000;
const CARD_W = 320;
/** Пауза после `prepare`, чтобы игрок увидел анимацию до появления подсказки. */
const PREPARE_MS = 520;

/**
 * Пошаговое обучение поверх НАСТОЯЩЕГО игрового поля: затемняет экран, вырезает
 * «дырку» вокруг подсвеченной зоны и показывает карточку с текстом. Шаги могут
 * заранее менять поле (`prepare`) — так правила показываются на реальных карточках.
 * Ввод игры на это время перехвачен полноэкранным блокировщиком.
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
    const layer = this.scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
    this.layer = layer;

    // Полноэкранный перехватчик ввода: пока идёт обучение, тапы не доходят до игры.
    const blocker = this.scene.add.rectangle(0, 0, W, H, 0, 0).setOrigin(0, 0).setInteractive();
    blocker.on('pointerdown', () => { /* поглощаем */ });
    layer.add(blocker);

    const cfg = this.steps[step];
    cfg.prepare?.();

    const hole = padClamp(cfg.target(), cfg.pad ?? 6);
    this.dimAround(layer, hole);
    this.strokeHole(layer, hole, cfg.radius ?? 12);
    if (step < this.steps.length - 1) this.skipLink(layer);

    // Подсказка появляется после демонстрации на поле — иначе она перекроет анимацию.
    const showCaption = () => {
      if (this.layer !== layer) return;
      this.captionCard(layer, hole, t(this.locale, cfg.textKey), step);
    };
    if (cfg.prepare) this.scene.time.delayedCall(PREPARE_MS, showCaption);
    else showCaption();

    this.scene.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
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

  // ── Подсветка ────────────────────────────────────────────────────────────────

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
    this.scene.tweens.add({ targets: g, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ── Карточка-подсказка ───────────────────────────────────────────────────────

  private captionCard(layer: Phaser.GameObjects.Container, hole: Rect, text: string, step: number): void {
    const txt = this.scene.add
      .text(200, 0, text, {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText,
        align: 'center', wordWrap: { width: CARD_W - 40 }, lineSpacing: 3,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const h = 136 + txt.height;
    const cy = placeCaption(hole, h);
    const top = cy - h / 2;

    this.card(layer, 200, cy, CARD_W, h);
    txt.setY(top + 24 + txt.height / 2);
    layer.add(txt);
    this.dots(layer, 200, top + 24 + txt.height + 23, step);
    this.nextButton(layer, 200, top + 24 + txt.height + 67, step);
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
    const total = this.steps.length;
    for (let i = 0; i < total; i++) {
      const dx = cx - (total - 1) * 8 + i * 16;
      const color = i === active ? COLORS.primary : darken(COLORS.panelBorder, 0.12);
      layer.add(this.scene.add.circle(dx, y, i === active ? 4.5 : 3.5, color));
    }
  }

  private nextButton(layer: Phaser.GameObjects.Container, cx: number, y: number, step: number): void {
    const last = step === this.steps.length - 1;
    const label = t(this.locale, last ? 'onboarding.done' : 'onboarding.next');
    const btn = makeButton(this.scene, cx, y, label, () => this.next(step), { primary: true, width: 160, height: 46 });
    layer.add(btn.root);
  }

  private skipLink(layer: Phaser.GameObjects.Container): void {
    const link = this.scene.add
      .text(W - 16, 28, t(this.locale, 'onboarding.skip'), {
        fontFamily: FONT, fontSize: 14, color: '#ffffff',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR)
      .setInteractive({ useHandCursor: true });
    link.on('pointerup', () => this.finish());

    // Подложка: под ссылкой лежит HUD (таймер), сквозь затемнение он читался бы вперемешку.
    const pad = 9;
    const g = this.scene.add.graphics();
    g.fillStyle(DIM, 0.96);
    g.fillRoundedRect(W - 16 - link.width - pad, 28 - 13, link.width + pad * 2, 26, 13);
    layer.add([g, link]);
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

/**
 * Кладёт карточку-подсказку под подсвеченной зоной, если там есть место, иначе над ней.
 * Если зона занимает почти весь экран (всё поле карточек) — прижимаем карточку вниз.
 */
function placeCaption(hole: Rect, h: number): number {
  const below = hole.y + hole.h + 14 + h / 2;
  if (below + h / 2 <= H - 12) return below;
  const above = hole.y - 14 - h / 2;
  if (above - h / 2 >= 52) return above;
  return H - 12 - h / 2;
}
