import { Scene } from 'phaser';
import type { Locale } from '../core/locale';
import type { UnitStatus } from '../core/evaluate';
import { COLORS, FONT, statusColor, type Palette } from './palette';
import { t } from '../i18n';
import { makeButton } from './ui';

/** Прямоугольник в координатах сцены (400×720). */
export interface Rect { x: number; y: number; w: number; h: number; }

/** Зоны интерфейса, которые подсвечивает обучение. */
export interface OnboardingTargets {
  board: Rect;
  keyboard: Rect;
  enterKey: Rect;
}

const W = 400;
const H = 720;
const DIM = 0x241a12;
const DIM_ALPHA = 0.74;
const DEPTH = 1000;
const TOTAL_STEPS = 4; // 3 подсветки + легенда цветов

/** Буквы-примеры для легенды цветов (по локали). */
const SAMPLE: Record<Locale, { correct: string; present: string; absent: string; win: string[] }> = {
  ru: { correct: 'С', present: 'О', absent: 'Р', win: ['И', 'Г', 'Р', 'О', 'К'] },
  uz: { correct: 'S', present: 'O', absent: 'R', win: ['S', 'A', 'L', 'O', 'M'] },
};

interface SpotStep { target: keyof OnboardingTargets; textKey: string; captionY: number; pad: number; radius: number; }

/**
 * Первый запуск: пошаговое обучение поверх игры. Затемняет экран и по очереди
 * подсвечивает доску, клавиатуру и кнопку ввода, затем показывает легенду цветов.
 * Показывается один раз (флаг persistence — на стороне вызывающего).
 */
export function startOnboarding(
  scene: Scene,
  locale: Locale,
  palette: Palette,
  targets: OnboardingTargets,
  onDone: () => void,
): void {
  new Onboarding(scene, locale, palette, targets, onDone).show(0);
}

class Onboarding {
  private layer?: Phaser.GameObjects.Container;

  private readonly spotSteps: SpotStep[] = [
    { target: 'board', textKey: 'onboarding.board', captionY: 560, pad: 6, radius: 10 },
    { target: 'keyboard', textKey: 'onboarding.keyboard', captionY: 232, pad: 6, radius: 14 },
    { target: 'enterKey', textKey: 'onboarding.enter', captionY: 232, pad: 5, radius: 10 },
  ];

  constructor(
    private scene: Scene,
    private locale: Locale,
    private palette: Palette,
    private targets: OnboardingTargets,
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

    if (step < this.spotSteps.length) this.renderSpotlight(layer, this.spotSteps[step], step);
    else this.renderLegend(layer, step);

    this.scene.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
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

  // ── Шаги-подсветки ─────────────────────────────────────────────────────────

  private renderSpotlight(layer: Phaser.GameObjects.Container, cfg: SpotStep, step: number): void {
    const hole = padClamp(this.targets[cfg.target], cfg.pad);
    this.dimAround(layer, hole);
    this.strokeHole(layer, hole, cfg.radius);
    this.captionCard(layer, cfg.captionY, t(this.locale, cfg.textKey), step);
    this.skipLink(layer, step);
  }

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

  private captionCard(layer: Phaser.GameObjects.Container, cy: number, text: string, step: number): void {
    const w = 320;
    const h = 168;
    this.card(layer, 200, cy, w, h);
    layer.add(
      this.scene.add
        .text(200, cy - 40, text, {
          fontFamily: FONT, fontSize: 17, color: COLORS.headText,
          align: 'center', wordWrap: { width: w - 40 }, lineSpacing: 3,
        })
        .setOrigin(0.5),
    );
    this.dots(layer, 200, cy + 22, step);
    this.nextButton(layer, 200, cy + 54, step);
  }

  // ── Легенда цветов ──────────────────────────────────────────────────────────

  private renderLegend(layer: Phaser.GameObjects.Container, step: number): void {
    layer.add(this.scene.add.rectangle(0, 0, W, H, DIM, DIM_ALPHA).setOrigin(0, 0));

    const cx = 200;
    const cardCy = 360;
    const cardW = 344;
    const cardH = 470;
    const top = cardCy - cardH / 2;
    this.card(layer, cx, cardCy, cardW, cardH);

    layer.add(
      this.scene.add
        .text(cx, top + 30, t(this.locale, 'onboarding.legendTitle'), {
          fontFamily: FONT, fontSize: 20, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const s = SAMPLE[this.locale];
    const rows: Array<{ status: UnitStatus; letter: string; key: string }> = [
      { status: 'correct', letter: s.correct, key: 'onboarding.correct' },
      { status: 'present', letter: s.present, key: 'onboarding.present' },
      { status: 'absent', letter: s.absent, key: 'onboarding.absent' },
    ];
    rows.forEach((row, i) => {
      const y = top + 80 + i * 53;
      this.tile(layer, 78, y, 40, statusColor(row.status, this.palette), row.letter);
      layer.add(
        this.scene.add
          .text(112, y, t(this.locale, row.key), {
            fontFamily: FONT, fontSize: 15, color: COLORS.headText, wordWrap: { width: 234 },
          })
          .setOrigin(0, 0.5),
      );
    });

    // Разделитель.
    const divY = top + 250;
    const div = this.scene.add.graphics();
    div.lineStyle(1.5, COLORS.panelBorder, 1);
    div.beginPath();
    div.moveTo(cx - 138, divY);
    div.lineTo(cx + 138, divY);
    div.strokePath();
    layer.add(div);

    // Ряд «всё зелёное» — слово отгадано.
    const winY = top + 298;
    const size = 40;
    const gap = 6;
    const totalW = s.win.length * size + (s.win.length - 1) * gap;
    const firstCx = cx - totalW / 2 + size / 2;
    s.win.forEach((letter, c) => {
      this.tile(layer, firstCx + c * (size + gap), winY, size, statusColor('correct', this.palette), letter);
    });
    layer.add(
      this.scene.add
        .text(cx, top + 342, t(this.locale, 'onboarding.win'), {
          fontFamily: FONT, fontSize: 15, color: COLORS.headText, fontStyle: 'bold', align: 'center',
        })
        .setOrigin(0.5),
    );

    this.dots(layer, cx, top + 388, step);
    this.nextButton(layer, cx, top + 428, step);
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

  /** Цветная плитка с буквой (как в игре). */
  private tile(layer: Phaser.GameObjects.Container, cx: number, cy: number, size: number, color: number, letter: string): void {
    layer.add(this.scene.add.rectangle(cx, cy, size, size, color).setOrigin(0.5));
    layer.add(
      this.scene.add
        .text(cx, cy, letter, { fontFamily: FONT, fontSize: Math.round(size * 0.5), color: '#ffffff' })
        .setOrigin(0.5),
    );
  }

  /** Индикатор шага (точки). */
  private dots(layer: Phaser.GameObjects.Container, cx: number, y: number, active: number): void {
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const dx = cx - (TOTAL_STEPS - 1) * 8 + i * 16;
      const color = i === active ? COLORS.primary : COLORS.filledBorder;
      const dot = this.scene.add.circle(dx, y, i === active ? 4.5 : 3.5, color);
      layer.add(dot);
    }
  }

  private nextButton(layer: Phaser.GameObjects.Container, cx: number, y: number, step: number): void {
    const last = step === TOTAL_STEPS - 1;
    const label = t(this.locale, last ? 'onboarding.done' : 'onboarding.next');
    const btn = makeButton(this.scene, cx, y, label, () => this.next(step), { primary: true, width: 160, height: 46 });
    layer.add(btn.root);
  }

  private skipLink(layer: Phaser.GameObjects.Container, _step: number): void {
    const link = this.scene.add
      .text(W - 16, 28, t(this.locale, 'onboarding.skip'), {
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
