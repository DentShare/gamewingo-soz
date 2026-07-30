import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createCountingGame, ITEMS, type CountingGame,
} from '../../core/counting';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera, makeGlyph, type GlyphName, makeBackButton } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import confetti from 'canvas-confetti';

const W = 400;
/** Белое поле с предметами. */
const BOARD = { x: 16, y: 124, w: 368, h: 340 };
const FEEDBACK_Y = 500;
/** Ряд крупных кнопок-цифр. */
const PAD_Y = 592;
const PAD_SIZE = 82;
const PAD_GAP = 14;
const PAD_LIP = 7;

/** Сколько предметов в ряду при заданном количестве (1..10) — аккуратные раскладки. */
const LAYOUT: Array<[cols: number, rows: number]> = [
  [1, 1], [2, 1], [3, 1], [2, 2], [3, 2], [3, 2], [4, 2], [4, 2], [3, 3], [5, 2],
];

/** Пауза между подсветками предметов при пересчёте-подсказке. */
const COUNT_STEP_MS = 420;

interface ItemView {
  txt: Phaser.GameObjects.Container;
  x: number;
  y: number;
}

interface DigitPad {
  value: number;
  x: number;
  y: number;
  root: Phaser.GameObjects.Container;
  setValue(n: number): void;
  wobble(): void;
}

/**
 * Детская игра «Счёт»: посчитать предметы и нажать нужную цифру.
 * Проиграть нельзя — нет таймера и штрафов; ошибка запускает наглядный пересчёт.
 */
export class Game extends Scene {
  private locale: Locale = 'ru';
  private session?: Session;
  private core!: CountingGame;
  private timer?: RoundTimer;

  private items: ItemView[] = [];
  private itemLayer!: Phaser.GameObjects.Container;
  /** Круги подсветки при пересчёте — ПОД предметами, иначе эмодзи не видно. */
  private ringLayer!: Phaser.GameObjects.Container;
  /** Всплывающие цифры 1, 2, 3… при пересчёте — над предметами. */
  private helpLayer!: Phaser.GameObjects.Container;
  private pads: DigitPad[] = [];
  private progressText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;

  private cellSize = 0;
  private locked = false;          // на время похвалы/подсказки
  private finished = false;
  private tutorialActive = false;
  /** Идёт пересчёт-подсказка (используется обучением и смоук-тестами). */
  private helping = false;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем изменяемое состояние.
    this.items = [];
    this.pads = [];
    this.cellSize = 0;
    this.locked = false;
    this.finished = false;
    this.tutorialActive = false;
    this.helping = false;
    this.timer = undefined;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session | undefined;

    this.buildHud();
    this.buildBoard();
    this.buildPads();

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.core = this.newCore();
    this.renderQuestion();

    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      else if (e.type === 'RESUME') this.timer?.resume();
    });
    if (off) this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  /** Новая партия. `minCount` — минимум предметов в первом вопросе (для наглядного обучения). */
  private newCore(minCount = 0): CountingGame {
    const seed = () => Math.floor(Math.random() * 2 ** 31);
    for (let i = 0; i < 30; i++) {
      const g = createCountingGame(mulberry32(seed()));
      if (g.question.count >= minCount) return g;
    }
    return createCountingGame(mulberry32(seed()));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящее поле + обучение, по концу — назад в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.core = this.newCore(3);
    this.renderQuestion();
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз. Тапы заблокированы, время на паузе. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.timer?.pause();
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.clearHelp();
        this.tutorialActive = false;
        this.timer?.resume();
      });
    });
  }

  /**
   * Три шага на РЕАЛЬНОМ поле: предметы → кнопки-цифры → настоящий пересчёт
   * (та же анимация, что и после ошибки).
   */
  private tutorialSteps(): OnboardingStep[] {
    return [
      { textKey: 'onboarding.count', target: () => this.boardRect(), pad: 8, radius: 20 },
      { textKey: 'onboarding.tap', target: () => this.padsRect(), pad: 10, radius: 22 },
      {
        textKey: 'onboarding.help',
        target: () => this.boardRect(),
        pad: 8,
        radius: 20,
        prepare: () => this.runCountHelp(),
      },
    ];
  }

  private boardRect(): Rect {
    return { x: BOARD.x, y: BOARD.y, w: BOARD.w, h: BOARD.h };
  }

  private padsRect(): Rect {
    const half = PAD_SIZE / 2;
    const xs = this.pads.map((p) => p.x);
    const left = Math.min(...xs) - half;
    return { x: left, y: PAD_Y - half, w: Math.max(...xs) + half - left, h: PAD_SIZE + PAD_LIP };
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.progressText = this.add
      .text(W - 20, 34, '', { fontFamily: FONT, fontSize: 16, color: COLORS.headMuted })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    this.add
      .text(W / 2, 92, t(this.locale, 'game.question'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    this.feedbackText = this.add
      .text(W / 2, FEEDBACK_Y, '', {
        fontFamily: FONT, fontSize: 24, color: COLORS.praise, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setAlpha(0);
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Поле с предметами ────────────────────────────────────────────────────────

  private buildBoard() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.05).fillRoundedRect(BOARD.x, BOARD.y + 4, BOARD.w, BOARD.h, 26);
    g.fillStyle(COLORS.board, 1).fillRoundedRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 26);
    g.lineStyle(2, COLORS.boardBorder, 1).strokeRoundedRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 26);
    this.ringLayer = this.add.container(0, 0).setDepth(3);
    this.itemLayer = this.add.container(0, 0).setDepth(4);
    this.helpLayer = this.add.container(0, 0).setDepth(6);
  }

  /** Раскладывает предметы текущего вопроса аккуратной сеткой, не наезжая друг на друга. */
  private renderItems(count: number, symbol: GlyphName) {
    this.itemLayer.removeAll(true);
    this.items = [];

    const [cols, rows] = LAYOUT[count - 1];
    const cell = Math.min((BOARD.w - 36) / cols, (BOARD.h - 36) / rows, 118);
    this.cellSize = cell;
    const top = BOARD.y + (BOARD.h - rows * cell) / 2 + cell / 2;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, count - row * cols);
      const col = i - row * cols;
      const left = BOARD.x + (BOARD.w - inRow * cell) / 2 + cell / 2;
      const x = left + col * cell;
      const y = top + row * cell;
      const txt = makeGlyph(this, x, y, symbol, Math.round(cell * 0.62))
        .setScale(0.4)
        .setAlpha(0);
      this.itemLayer.add(txt);
      this.items.push({ txt, x, y });
      // Предметы появляются по очереди — это уже маленький «пересчёт».
      this.tweens.add({
        targets: txt, scale: 1, alpha: 1, duration: 260, delay: i * 70, ease: 'Back.easeOut',
      });
    }
  }

  /** Рисует текущий вопрос: предметы, варианты на кнопках, прогресс. */
  private renderQuestion() {
    const q = this.core.question;
    this.renderItems(q.count, ITEMS[q.itemIndex]);
    q.options.forEach((n, i) => this.pads[i].setValue(n));
    this.progressText.setText(
      t(this.locale, 'game.progress', { n: this.core.asked, total: this.core.total }),
    );
  }

  // ── Кнопки-цифры ─────────────────────────────────────────────────────────────

  private buildPads() {
    const total = 4 * PAD_SIZE + 3 * PAD_GAP;
    const left = (W - total) / 2 + PAD_SIZE / 2;
    for (let i = 0; i < 4; i++) {
      this.pads.push(this.makePad(left + i * (PAD_SIZE + PAD_GAP), PAD_Y));
    }
  }

  private makePad(x: number, y: number): DigitPad {
    const s = PAD_SIZE, r = 20;
    const root = this.add.container(x, y);
    const base = this.add.graphics();
    base.fillStyle(darken(COLORS.padFace, 0.16), 1).fillRoundedRect(-s / 2, -s / 2, s, s, r);

    const faceC = this.add.container(0, -PAD_LIP);
    const face = this.add.graphics();
    face.fillStyle(COLORS.padFace, 1).fillRoundedRect(-s / 2, -s / 2, s, s, r);
    face.lineStyle(2, COLORS.panelBorder, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
    const label = this.add
      .text(0, 0, '', {
        fontFamily: FONT, fontSize: 44, color: COLORS.padText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    faceC.add([face, label]);

    const hit = this.add.rectangle(0, -PAD_LIP / 2, s, s + PAD_LIP, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    root.add([base, faceC, hit]);

    const pad: DigitPad = {
      value: 0,
      x, y, root,
      setValue: (n: number) => { pad.value = n; label.setText(String(n)); },
      wobble: () => {
        this.tweens.add({
          targets: root, angle: { from: -7, to: 7 }, duration: 80,
          yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
          onComplete: () => root.setAngle(0),
        });
      },
    };

    let pressed = false;
    const press = (down: boolean) => { faceC.y = down ? -1 : -PAD_LIP; };
    hit.on('pointerdown', () => { pressed = true; press(true); });
    hit.on('pointerup', () => {
      if (!pressed) return;
      pressed = false;
      press(false);
      this.onPick(pad);
    });
    hit.on('pointerout', () => { if (pressed) { pressed = false; press(false); } });

    return pad;
  }

  // ── Ответ ────────────────────────────────────────────────────────────────────

  private onPick(pad: DigitPad) {
    if (this.finished || this.locked || this.tutorialActive || this.helping) return;
    const res = this.core.answer(pad.value);
    this.locked = true;

    if (res.correct) {
      this.celebrate();
      this.progressText.setText(
        t(this.locale, 'game.progress', { n: this.core.asked, total: this.core.total }),
      );
      if (res.done) {
        this.time.delayedCall(1000, () => this.endGame());
      } else {
        this.time.delayedCall(950, () => {
          this.hideFeedback();
          this.renderQuestion();
          this.locked = false;
        });
      }
      return;
    }

    // Ошибка — не наказание: кнопка мягко качается и запускается наглядный пересчёт.
    pad.wobble();
    this.showFeedback(t(this.locale, 'game.help'), COLORS.helpText);
    this.runCountHelp(() => {
      this.hideFeedback();
      this.locked = false;
    });
  }

  /** Верный ответ: предметы подпрыгивают, летят искорки, конфетти и похвала. */
  private celebrate() {
    this.items.forEach((it, i) => {
      this.tweens.add({
        targets: it.txt, y: it.y - 18, scale: 1.18, duration: 200,
        delay: i * 60, yoyo: true, ease: 'Quad.easeOut',
      });
      this.time.delayedCall(i * 60, () => this.sparkle(it.x, it.y));
    });
    this.showFeedback(t(this.locale, 'game.praise'), COLORS.praise);
    confetti({
      disableForReducedMotion: true, particleCount: 28, spread: 60,
      startVelocity: 26, scalar: 0.8, ticks: 90, origin: { y: 0.42 },
    });
  }

  /** Маленькая искорка вокруг предмета. */
  private sparkle(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const dot = this.add.circle(x, y, 4, COLORS.sparkle, 1).setDepth(7);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * 34,
        y: y + Math.sin(a) * 34,
        alpha: 0, scale: 0.4, duration: 420, ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /**
   * Пересчёт-подсказка: предметы по очереди подсвечиваются, над ними всплывают
   * цифры 1, 2, 3… — ребёнок видит, КАК считать. Ошибок не прибавляет.
   */
  private runCountHelp(onDone?: () => void) {
    this.helping = true;
    this.helpLayer.removeAll(true);
    this.ringLayer.removeAll(true);
    const size = this.cellSize;

    this.items.forEach((it, i) => {
      this.time.delayedCall(i * COUNT_STEP_MS, () => {
        // Круг — под предметом (свой слой), чтобы эмодзи оставался ярким.
        const ring = this.add.circle(it.x, it.y, size * 0.46, COLORS.countGlow, 1).setScale(0.5);
        this.ringLayer.add(ring);
        this.tweens.add({ targets: ring, scale: 1, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({
          targets: it.txt, scale: 1.24, duration: 180, yoyo: true, ease: 'Quad.easeOut',
        });
        const num = this.add
          .text(it.x, it.y - size * 0.40, String(i + 1), {
            fontFamily: FONT, fontSize: Math.round(size * 0.38),
            color: COLORS.countNumber, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR)
          .setScale(0);
        this.helpLayer.add(num);
        this.tweens.add({ targets: num, scale: 1, duration: 260, ease: 'Back.easeOut' });
      });
    });

    // Последняя цифра задерживается на экране — это и есть ответ.
    this.time.delayedCall(this.items.length * COUNT_STEP_MS + 900, () => {
      this.clearHelp();
      onDone?.();
    });
  }

  /** Убирает подсветку пересчёта (цифры и круги). */
  private clearHelp() {
    this.helping = false;
    const list = [...this.helpLayer.list, ...this.ringLayer.list];
    if (!list.length) return;
    this.tweens.add({
      targets: list, alpha: 0, duration: 280, ease: 'Quad.easeIn',
      onComplete: () => { this.helpLayer.removeAll(true); this.ringLayer.removeAll(true); },
    });
  }

  private showFeedback(text: string, color: string) {
    this.feedbackText.setText(text).setColor(color).setAlpha(0).setScale(0.7);
    this.tweens.add({
      targets: this.feedbackText, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut',
    });
  }

  private hideFeedback() {
    this.tweens.killTweensOf(this.feedbackText);
    this.feedbackText.setAlpha(0);
  }

  // ── Финал ────────────────────────────────────────────────────────────────────

  private endGame() {
    if (this.finished) return;
    this.finished = true;
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { correct, mistakes } = this.core;

    void this.session
      ?.finish({ correct, mistakes, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', { locale: this.locale, correct, mistakes, durationMs });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
