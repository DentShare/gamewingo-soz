import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createCountingGame, ITEMS, type CountingGame,
} from '../../core/counting';
import { mulberry32 } from '../../core/rng';
import { levelAt } from '../../core/levels';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, makeGlyph, type GlyphName, makeKeyCap, playSound,
  makeGameHeader, openPauseSheet, setBackHandler, type GameHeader, type PauseSheet,
  runFirstMoveTutorial, showRuleOnce, type FirstMoveTutorial, type Rect,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import confetti from 'canvas-confetti';

const W = 400;
/** Белое поле с предметами. */
const BOARD = { x: 16, y: 124, w: 368, h: 340 };
const FEEDBACK_Y = 500;
/** Ряд крупных кнопок-цифр. */
const PAD_Y = 592;
const PAD_SIZE = 82;
const PAD_GAP = 14;

/** Сколько предметов в ряду при заданном количестве (1..20) — аккуратные раскладки. */
const LAYOUT: Array<[cols: number, rows: number]> = [
  [1, 1], [2, 1], [3, 1], [2, 2], [3, 2], [3, 2], [4, 2], [4, 2], [3, 3], [5, 2],
  [4, 3], [4, 3], [5, 3], [5, 3], [5, 3], [4, 4], [5, 4], [5, 4], [5, 4], [5, 4],
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
  private level = 1;
  /** Уровень дня: параметры уровня лестницы, но вопросы по зерну от даты — одни на всех. */
  private daily = false;
  /** Сторона кнопки-цифры: зависит от того, сколько вариантов у уровня. */
  private padSize = PAD_SIZE;
  private timer?: RoundTimer;

  private items: ItemView[] = [];
  private itemLayer!: Phaser.GameObjects.Container;
  /** Круги подсветки при пересчёте — ПОД предметами, иначе эмодзи не видно. */
  private ringLayer!: Phaser.GameObjects.Container;
  /** Всплывающие цифры 1, 2, 3… при пересчёте — над предметами. */
  private helpLayer!: Phaser.GameObjects.Container;
  private pads: DigitPad[] = [];
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private feedbackText!: Phaser.GameObjects.Text;

  private cellSize = 0;
  private locked = false;          // на время похвалы/подсказки
  private finished = false;
  /** Обучение в один шаг: первый верный ответ — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;
  /** Идёт пересчёт-подсказка (используется смоук-тестами). */
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
    this.tutorial = null;
    this.helping = false;
    this.timer = undefined;
    this.header = undefined;
    this.pause = null;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session | undefined;
    this.level = (this.registry.get('level') as number) ?? 1;
    this.daily = this.registry.get('mode') === 'dailyLevel';

    this.buildHud();
    this.buildBoard();
    this.buildPads();

    this.core = this.newCore();
    this.renderQuestion();

    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      // Наша пауза открыта или идёт обучение — часы стоят до «Продолжить» / первого ответа.
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer?.resume();
    });
    if (off) this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
  }

  /** Новая партия. Уровень дня — одно зерно на всех, поэтому и вопросы одинаковые. */
  private newCore(): CountingGame {
    const { questions, maxCount, options } = levelAt(this.level).params;
    const opts = { questions, maxCount, options };
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    return createCountingGame(mulberry32(seed), opts);
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: поле видно, обведена одна кнопка — верное число.
   * Тап по ней — настоящий ответ; прогресс в шапке и часы включаются после него.
   * Ошибка объясняется в момент ошибки (пересчёт + строка правила).
   */
  private startTutorial() {
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove', { n: this.core.question.count }),
      // Во время пересчёта-подсказки приоткрываем и поле: ребёнок должен видеть цифры над предметами.
      targets: () => (this.helping ? [this.boardRect(), this.answerPadRect()] : [this.answerPadRect()]),
      pad: 6,
      radius: 24,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer?.resume();
      },
    });
  }

  private boardRect(): Rect {
    return { x: BOARD.x, y: BOARD.y, w: BOARD.w, h: BOARD.h };
  }

  /** Кнопка с верным ответом на текущий вопрос. */
  private answerPadRect(): Rect {
    const pad = this.pads.find((p) => p.value === this.core.question.count) ?? this.pads[0];
    const half = this.padSize / 2;
    return { x: pad.x - half, y: pad.y - half, w: this.padSize, h: this.padSize };
  }

  // ── Шапка партии, вопрос, похвала ───────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» / «Уровень дня» и чип
   * прогресса «3 из 5». Таймера и проигрыша у «Счёта» нет — других чипов не нужно.
   */
  private buildHud() {
    const total = levelAt(this.level).params.questions;
    this.header = makeGameHeader(this, {
      // Детская игра: в шапке название, а не «Уровень N» — номер ребёнку ничего не говорит.
      title: t(this.locale, 'app.title'),
      chips: [
        {
          id: 'progress',
          text: t(this.locale, 'game.progress', { n: 1, total }),
          widest: t(this.locale, 'game.progress', { n: total, total }),
        },
      ],
      onBack: () => this.openPause(),
    });

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

  /** Прогресс партии в чипе: «3 из 5». */
  private updateProgress() {
    this.header?.setChip(
      'progress',
      t(this.locale, 'game.progress', { n: this.core.asked, total: this.core.total }),
    );
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении часы стоят до первого верного ответа — «Продолжить» их не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer?.resume(); },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «вопрос 3 из 5 · ошибок: 1» — таймера нет, поэтому про него ни слова. */
  private pauseSummary(): string {
    return [
      t(this.locale, 'pause.progress', { n: this.core.asked, total: this.core.total }),
      t(this.locale, 'pause.mistakes', { n: this.core.mistakes }),
    ].join(' · ');
  }

  /** Системный «назад»: из паузы — в меню, иначе — открыть паузу. */
  private onSystemBack() {
    if (this.pause?.open) {
      this.pause.close();
      this.exitToMenu();
      return;
    }
    this.openPause();
  }

  private exitToMenu() {
    if (this.finished) return;
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
    this.updateProgress();
  }

  // ── Кнопки-цифры ─────────────────────────────────────────────────────────────

  private buildPads() {
    const count = levelAt(this.level).params.options;
    // Кнопки ужимаются под их число, но не мельче 56 px — иначе тяжело попасть пальцем.
    const size = Math.max(56, Math.min(PAD_SIZE, Math.floor((W - 32 - (count - 1) * PAD_GAP) / count)));
    this.padSize = size;
    // Шесть кнопок по 56 px со штатным зазором шире экрана (406 > 400) — крайние
    // обрезались. Зазор ужимаем так, чтобы ряд оставлял по 8 px с краёв.
    const gap = Math.min(PAD_GAP, Math.floor((W - 16 - count * size) / Math.max(1, count - 1)));
    const total = count * size + (count - 1) * gap;
    const left = (W - total) / 2 + size / 2;
    for (let i = 0; i < count; i++) {
      this.pads.push(this.makePad(left + i * (size + gap), PAD_Y, size));
    }
  }

  private makePad(x: number, y: number, s: number): DigitPad {
    const root = this.add.container(x, y);
    const cap = makeKeyCap(this, 0, 0, s, s, '', () => this.onPick(pad), {
      fontSize: 44, radius: 20,
    });
    root.add(cap.root);

    const pad: DigitPad = {
      value: 0,
      x, y, root,
      setValue: (n: number) => { pad.value = n; cap.setLabel(String(n)); },
      wobble: () => {
        this.tweens.add({
          targets: root, angle: { from: -7, to: 7 }, duration: 80,
          yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
          onComplete: () => root.setAngle(0),
        });
      },
    };
    return pad;
  }


  // ── Ответ ────────────────────────────────────────────────────────────────────

  private onPick(pad: DigitPad) {
    if (this.finished || this.locked || this.helping) return;
    const res = this.core.answer(pad.value);
    this.locked = true;
    playSound(res.correct ? 'ok' : 'wrong');

    if (res.correct) {
      // Первый верный ответ закрывает обучение: дальше обычная партия.
      this.tutorial?.done();
      this.celebrate();
      this.updateProgress();
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
    // Правило про ошибку — в момент первой ошибки, а не карточкой заранее.
    showRuleOnce(this, 'counting:mistake', t(this.locale, 'rule.mistake'));
    this.showFeedback(t(this.locale, 'game.help'), COLORS.helpText);
    this.runCountHelp(() => {
      this.hideFeedback();
      this.locked = false;
      this.tutorial?.refresh();
    });
    this.tutorial?.refresh();
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
      ?.finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', correct, mistakes, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, locale: this.locale, correct, mistakes, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
