import { Scene } from 'phaser';
import type { Locale } from '../core/locale';
import { COLORS, FONT } from './palette';
import { t } from '../i18n';
import { makeButton } from './ui';

/** Прямоугольник в координатах сцены (400×720). */
export interface Rect { x: number; y: number; w: number; h: number; }

/**
 * Реальные зоны игрового экрана, которые подсвечивает обучение.
 * Все — настоящие объекты сцены, а не декорации: игрок учится на своём поле.
 */
export interface OnboardingTargets {
  /** Вся доска. */
  board: Rect;
  /** Одна настоящая строка сетки. */
  row: Rect;
  /** Один настоящий блок (2×2 для 4×4, 2×3 для 6×6). */
  block: Rect;
  /** Пустая клетка, на которой показываем ввод. */
  cell: Rect;
  /** Панель цифр. */
  keypad: Rect;
  /** Кнопка подсказки. */
  hint: Rect;
}

/** Демонстрация ввода на реальной сетке (управляет состоянием сцены Game). */
export interface OnboardingDemo {
  /** Выделить демонстрационную клетку — как при тапе игрока. */
  select(): void;
  /** Вписать в неё правильную цифру. */
  fill(): void;
  /** Откатить демонстрацию (сетка игрока остаётся нетронутой). */
  reset(): void;
}

const W = 400;
const H = 720;
const CX = 200;
const DIM = 0x241a12;
const DIM_ALPHA = 0.74;
const DEPTH = 1000;
const CARD_W = 344;
const CARD_PAD = 18;
/** Высота карточки = высота текста + отступы + точки + кнопка. */
const CARD_CHROME = 122;

interface Step {
  holes: (keyof OnboardingTargets)[];
  textKey: string;
  pad: number;
  radius: number;
  /** Шаг с реальным вводом в клетку. */
  demo?: boolean;
}

const STEPS: Step[] = [
  { holes: ['board'], textKey: 'onboarding.grid', pad: 6, radius: 10 },
  { holes: ['row'], textKey: 'onboarding.row', pad: 4, radius: 8 },
  { holes: ['block'], textKey: 'onboarding.block', pad: 4, radius: 8 },
  { holes: ['cell', 'keypad'], textKey: 'onboarding.input', pad: 5, radius: 10, demo: true },
  { holes: ['hint'], textKey: 'onboarding.hint', pad: 6, radius: 16 },
];
const TOTAL_STEPS = STEPS.length;

/**
 * Пошаговое обучение поверх настоящего игрового поля: затемняет экран, по очереди
 * подсвечивает сетку, строку, блок, ввод и подсказку. Игровой ввод на время обучения
 * перехватывается прозрачным блокером. Одноразовость — на стороне вызывающего.
 */
export function startOnboarding(
  scene: Scene,
  locale: Locale,
  targets: OnboardingTargets,
  demo: OnboardingDemo,
  onDone: () => void,
): void {
  new Onboarding(scene, locale, targets, demo, onDone).show(0);
}

class Onboarding {
  private layer?: Phaser.GameObjects.Container;
  private demoActive = false;
  private demoTimer?: Phaser.Time.TimerEvent;

  constructor(
    private scene: Scene,
    private locale: Locale,
    private targets: OnboardingTargets,
    private demo: OnboardingDemo,
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

    this.renderStep(layer, STEPS[step], step);

    this.scene.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  private next(step: number): void {
    this.stopDemo();
    if (step < TOTAL_STEPS - 1) this.show(step + 1);
    else this.finish();
  }

  private finish(): void {
    this.stopDemo();
    const layer = this.layer;
    this.layer = undefined;
    if (!layer) { this.onDone(); return; }
    this.scene.tweens.add({
      targets: layer, alpha: 0, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => { layer.destroy(); this.onDone(); },
    });
  }

  // ── Шаг ──────────────────────────────────────────────────────────────────────

  private renderStep(layer: Phaser.GameObjects.Container, cfg: Step, step: number): void {
    const holes = cfg.holes
      .map((k) => padClamp(this.targets[k], cfg.pad))
      .sort((a, b) => a.y - b.y);

    this.dimAround(layer, holes);
    for (const hole of holes) this.strokeHole(layer, hole, cfg.radius);

    // Текст создаём первым: высота карточки считается по нему, поэтому длинные
    // переводы (uz) не вылезают за края.
    const text = this.scene.add
      .text(CX, 0, t(this.locale, cfg.textKey), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText,
        align: 'center', wordWrap: { width: CARD_W - 48 }, lineSpacing: 3,
      })
      .setOrigin(0.5, 0);

    const cardH = Math.round(text.height + CARD_CHROME);
    const top = cardTopFor(holes, cardH);
    this.card(layer, CX, top + cardH / 2, CARD_W, cardH);
    text.setY(top + CARD_PAD);
    layer.add(text);

    const dotsY = top + CARD_PAD + text.height + 19;
    this.dots(layer, CX, dotsY, step);
    this.nextButton(layer, CX, dotsY + 43, step);
    this.skipLink(layer);

    if (cfg.demo) this.startDemo();
  }

  /** Реальный ввод на сетке: выделяем клетку, затем вписываем правильную цифру. */
  private startDemo(): void {
    this.demoActive = true;
    this.demo.select();
    this.demoTimer = this.scene.time.delayedCall(620, () => this.demo.fill());
  }

  private stopDemo(): void {
    if (!this.demoActive) return;
    this.demoActive = false;
    this.demoTimer?.remove();
    this.demoTimer = undefined;
    this.demo.reset();
  }

  // ── Примитивы ────────────────────────────────────────────────────────────────

  /** Затемняем всё, кроме «дырок» (по 4 полосы на каждую; дырки идут сверху вниз). */
  private dimAround(layer: Phaser.GameObjects.Container, holes: Rect[]): void {
    const strip = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      layer.add(this.scene.add.rectangle(x, y, w, h, DIM, DIM_ALPHA).setOrigin(0, 0));
    };
    let cursor = 0;
    for (const hole of holes) {
      strip(0, cursor, W, hole.y - cursor); // над дыркой
      strip(0, hole.y, hole.x, hole.h); // слева
      strip(hole.x + hole.w, hole.y, W - (hole.x + hole.w), hole.h); // справа
      cursor = Math.max(cursor, hole.y + hole.h);
    }
    strip(0, cursor, W, H - cursor); // под последней дыркой
  }

  /** Яркая рамка вокруг подсвеченной зоны + мягкая пульсация. */
  private strokeHole(layer: Phaser.GameObjects.Container, hole: Rect, radius: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, COLORS.primary, 1).strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, radius);
    layer.add(g);
    this.scene.tweens.add({ targets: g, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
    const btn = makeButton(this.scene, cx, y, label, () => this.next(step), { primary: true, width: 160, height: 46 });
    layer.add(btn.root);
  }

  /** «Пропустить» — под линией HUD, чтобы не наезжать на таймер партии. */
  private skipLink(layer: Phaser.GameObjects.Container): void {
    const link = this.scene.add
      .text(W - 16, 68, t(this.locale, 'onboarding.skip'), {
        fontFamily: FONT, fontSize: 14, color: '#ffffff',
      })
      .setOrigin(1, 0.5)
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

/**
 * Куда положить карточку с текстом: в свободную полосу экрана, не перекрывая
 * подсвеченные зоны. Предпочитаем полосу под первой дыркой (подпись под тем, о чём речь).
 */
function cardTopFor(holes: Rect[], cardH: number): number {
  const bands: { top: number; h: number }[] = [];
  let cursor = 0;
  for (const hole of holes) {
    bands.push({ top: cursor, h: hole.y - cursor });
    cursor = Math.max(cursor, hole.y + hole.h);
  }
  bands.push({ top: cursor, h: H - cursor });

  const margin = 12;
  const fits = bands.filter((b) => b.h >= cardH + margin * 2);
  const below = holes.length ? fits.filter((b) => b.top >= holes[0].y + holes[0].h) : fits;
  const largest = [...(fits.length ? fits : bands)].sort((a, b) => b.h - a.h)[0];
  const band = below[0] ?? largest;

  const top = band.top + (band.h - cardH) / 2;
  return Math.round(Math.min(Math.max(top, 8), H - 8 - cardH));
}
