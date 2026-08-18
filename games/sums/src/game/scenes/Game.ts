import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { generate, createSumsGame, type Puzzle, type PuzzleOptions, type SumsGame } from '../../core/sums';
import { mulberry32 } from '../../core/rng';
import { levelAt } from '../../core/levels';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, makeButton, makeBackButton, playSound, squash, sparkle, VIEW_BOTTOM,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { startOnboarding, type OnboardingTargets, type Rect } from '../onboarding';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;
/**
 * Низ экрана считаем от реальной границы вида, а не от логических 720: на вытянутом
 * телефоне кнопка иначе висит посреди пустоты.
 */
const RESET_Y = Math.round(VIEW_BOTTOM - 64);
/** Полоса, в которой живёт доска: под подписью цели и над кнопкой сброса. */
const BOARD_TOP = 100;
const BOARD_BOTTOM = RESET_Y - 52;
/** Потолок размера клетки: на 3×3 плитки во весь экран выглядят как ошибка вёрстки. */
const MAX_CELL = 76;
/** Зазор между сеткой чисел и полосой сумм — иначе сумма читается как ещё одно число. */
const STRIP_GAP = 8;

/** Состояние линии: сумма сошлась, вычеркнуто лишнее, ещё в работе. */
type LineState = 'done' | 'over' | 'open';

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private params!: PuzzleOptions;
  private session!: Session;

  // Партия.
  private puzzle!: Puzzle;
  private round!: SumsGame;
  private finished = false;
  /** Идёт обучение: игровой ввод и выход заблокированы. */
  private tutorialActive = false;
  /** Какие линии уже сошлись — чтобы звук «ок» играл на новую, а не на каждый тап. */
  private doneRows: boolean[] = [];
  private doneCols: boolean[] = [];

  // Вью.
  private cellRects: Phaser.GameObjects.Rectangle[] = [];
  private cellTexts: Phaser.GameObjects.Text[] = [];
  private strikes: Phaser.GameObjects.Rectangle[] = [];
  private rowPlates: Phaser.GameObjects.Rectangle[] = [];
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private colPlates: Phaser.GameObjects.Rectangle[] = [];
  private colLabels: Phaser.GameObjects.Text[] = [];
  private movesText!: Phaser.GameObjects.Text;
  private timer!: RoundTimer;

  // Геометрия доски.
  private cellSize = 0;
  private boardLeft = 0;
  private boardTop = 0;
  private resetRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.cellRects = [];
    this.cellTexts = [];
    this.strikes = [];
    this.rowPlates = [];
    this.rowLabels = [];
    this.colPlates = [];
    this.colLabels = [];
    this.finished = false;
    this.tutorialActive = false;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    this.session = this.registry.get('session') as Session;

    // «Как играть» из меню: обучение на настоящей доске, без сессии и без партии.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.buildPuzzle();
    this.buildScreen();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      else if (e.type === 'RESUME') this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  private buildPuzzle() {
    this.params = levelAt(this.level).params;
    this.puzzle = generate(this.params, mulberry32(Math.floor(Math.random() * 2 ** 31)));
    this.startRound();
  }

  /** Чистая доска по той же задаче: и старт партии, и «Заново», и откат демонстрации. */
  private startRound() {
    this.round = createSumsGame(this.puzzle);
    this.doneRows = new Array<boolean>(this.puzzle.size).fill(false);
    this.doneCols = new Array<boolean>(this.puzzle.size).fill(false);
  }

  private buildScreen() {
    this.buildHud();
    this.buildBoard();
    this.buildResetButton();
    this.refresh();
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  private buildHud() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());

    this.add
      .text(W - 20, 22, t(this.locale, 'game.level', { n: this.level }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    this.movesText = this.add
      .text(W - 20, 44, this.movesLabel(), { fontFamily: FONT, fontSize: 16, color: COLORS.headText })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    this.add
      .text(W / 2, 78, t(this.locale, 'game.goal'), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  private movesLabel(): string {
    return t(this.locale, 'game.moves', { n: this.round.moves });
  }

  // ── Доска ────────────────────────────────────────────────────────────────────

  /**
   * Доска — квадрат (N+1)×(N+1): сами числа плюс полоса целевых сумм справа и снизу.
   * Размер клетки подбирается под ширину экрана, поэтому 9×9 помещается без прокрутки.
   */
  private buildBoard() {
    const n = this.puzzle.size;
    const span = n + 1;
    this.cellSize = Math.min(MAX_CELL, Math.floor((W - 36 - STRIP_GAP) / span));
    const board = this.cellSize * span + STRIP_GAP;
    this.boardLeft = Math.round((W - board) / 2);
    // Смещаем доску вверх от центра полосы: под ней кнопка, над ней только подпись.
    this.boardTop = Math.round(BOARD_TOP + (BOARD_BOTTOM - BOARD_TOP - board) * 0.38);

    const cell = this.cellSize;
    const inner = cell - 4;
    const fs = Math.max(13, Math.round(cell * 0.42));

    for (let i = 0; i < n * n; i++) {
      const cx = this.cellX(i % n);
      const cy = this.cellY(Math.floor(i / n));
      const rect = this.add
        .rectangle(cx, cy, inner, inner, COLORS.cellBg)
        .setStrokeStyle(1, COLORS.gridLine)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerup', () => this.onCellTap(i));
      this.cellRects.push(rect);

      this.cellTexts.push(
        this.add
          .text(cx, cy, String(this.puzzle.cells[i]), {
            fontFamily: FONT, fontSize: fs, color: COLORS.cellText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
      );

      // Линия перечёркивания создаётся последней — она должна лежать поверх числа.
      this.strikes.push(
        this.add.rectangle(cx, cy, inner * 0.68, 2, COLORS.strike).setAngle(-18).setVisible(false),
      );
    }

    // Полоса целевых сумм: справа — по строкам, снизу — по столбцам.
    for (let r = 0; r < n; r++) {
      const cx = this.cellX(n);
      const cy = this.cellY(r);
      this.rowPlates.push(this.add.rectangle(cx, cy, inner, inner, COLORS.targetBg));
      this.rowLabels.push(this.targetLabel(cx, cy, this.puzzle.rowTargets[r], fs));
    }
    for (let c = 0; c < n; c++) {
      const cx = this.cellX(c);
      const cy = this.cellY(n);
      this.colPlates.push(this.add.rectangle(cx, cy, inner, inner, COLORS.targetBg));
      this.colLabels.push(this.targetLabel(cx, cy, this.puzzle.colTargets[c], fs));
    }
  }

  private targetLabel(x: number, y: number, value: number, fs: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, String(value), {
        fontFamily: FONT, fontSize: fs, color: COLORS.targetText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Центр колонки. Полоса сумм (col === size) отодвинута на зазор. */
  private cellX(col: number): number {
    const gap = col === this.puzzle.size ? STRIP_GAP : 0;
    return this.boardLeft + col * this.cellSize + this.cellSize / 2 + gap;
  }

  private cellY(row: number): number {
    const gap = row === this.puzzle.size ? STRIP_GAP : 0;
    return this.boardTop + row * this.cellSize + this.cellSize / 2 + gap;
  }

  private buildResetButton() {
    const w = 200, h = 46, lip = 6;
    makeButton(this, W / 2, RESET_Y, t(this.locale, 'game.reset'), () => this.resetBoard(), { width: w, height: h });
    this.resetRect = { x: (W - w) / 2, y: RESET_Y - h / 2 - lip, w, h: h + lip };
  }

  // ── Взаимодействие ───────────────────────────────────────────────────────────

  private onCellTap(i: number) {
    if (this.finished || this.tutorialActive) return;
    const result = this.round.toggle(i);
    // Вычеркнули — короткий щелчок, вернули — шорох: на слух видно, что действие обратимо.
    playSound(result === 'crossed' ? 'tap' : 'swipe');
    squash(this, this.cellRects[i]);
    this.movesText.setText(this.movesLabel());
    this.refresh();
    if (this.round.solved) this.win();
  }

  /**
   * «Заново» возвращает доску к началу вместе со счётчиком ходов: это ровно то же,
   * что выйти и зайти в уровень заново, только без перезагрузки сцены. Оставлять
   * ходы накопленными было бы наказанием за честное «я запутался».
   */
  private resetBoard() {
    if (this.finished || this.tutorialActive) return;
    this.startRound();
    this.movesText.setText(this.movesLabel());
    this.refresh();
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Отрисовка состояния ──────────────────────────────────────────────────────

  private refresh() {
    const n = this.puzzle.size;

    for (let i = 0; i < n * n; i++) {
      const crossed = this.round.crossed[i];
      this.cellRects[i].setFillStyle(crossed ? COLORS.crossedBg : COLORS.cellBg);
      this.cellTexts[i].setColor(crossed ? COLORS.crossedText : COLORS.cellText);
      this.strikes[i].setVisible(crossed);
    }

    let newlyDone = false;
    for (let r = 0; r < n; r++) {
      const state = this.lineState(this.round.rowSum(r), this.puzzle.rowTargets[r]);
      this.paintLine(this.rowPlates[r], this.rowLabels[r], state);
      const done = state === 'done';
      if (done && !this.doneRows[r]) newlyDone = true;
      this.doneRows[r] = done;
    }
    for (let c = 0; c < n; c++) {
      const state = this.lineState(this.round.colSum(c), this.puzzle.colTargets[c]);
      this.paintLine(this.colPlates[c], this.colLabels[c], state);
      const done = state === 'done';
      if (done && !this.doneCols[c]) newlyDone = true;
      this.doneCols[c] = done;
    }

    // Партию заканчивает win() со своим звуком — здесь бы вышел двойной сигнал.
    if (newlyDone && !this.round.solved) playSound('ok');
  }

  /**
   * Красная подсветка «вычеркнуто лишнее» честна только там, где все числа
   * положительные: тогда вычёркивание сумму только уменьшает, и сумма меньше цели —
   * это уже тупик. С отрицательными числами такого правила нет, и линия остаётся
   * нейтральной, пока не сойдётся.
   */
  private lineState(sum: number, target: number): LineState {
    if (sum === target) return 'done';
    if (!this.params.negative && sum < target) return 'over';
    return 'open';
  }

  private paintLine(plate: Phaser.GameObjects.Rectangle, label: Phaser.GameObjects.Text, state: LineState) {
    if (state === 'done') {
      plate.setFillStyle(COLORS.targetDoneBg);
      label.setColor(COLORS.targetDoneText);
    } else if (state === 'over') {
      plate.setFillStyle(COLORS.targetOverBg);
      label.setColor(COLORS.targetOverText);
    } else {
      plate.setFillStyle(COLORS.targetBg);
      label.setColor(COLORS.targetText);
    }
  }

  // ── Победа ───────────────────────────────────────────────────────────────────

  private win() {
    this.finished = true;
    const n = this.puzzle.size;
    // Волна по клеткам от левого верхнего угла — доска «выдыхает».
    for (let i = 0; i < this.cellTexts.length; i++) {
      this.tweens.add({
        targets: [this.cellTexts[i], this.cellRects[i]],
        scale: 1.12, duration: 140, yoyo: true,
        delay: (Math.floor(i / n) + (i % n)) * 26, ease: 'Quad.easeOut',
      });
    }
    const board = this.cellSize * (n + 1) + STRIP_GAP;
    sparkle(this, W / 2, this.boardTop + board / 2, { count: 20, depth: 900 });
    this.time.delayedCall(760, () => this.endGame());
  }

  private endGame() {
    const durationMs = Math.round(this.timer.elapsedMs());
    const { moves, undos } = this.round;

    void this.session
      .finish({ level: this.level, moves, undos, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', { level: this.level, locale: this.locale, moves, undos, durationMs });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящая доска 3×3, но без партии; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    // На тройке правило видно целиком, поэтому обучение всегда идёт на первом уровне.
    this.level = 1;
    this.buildPuzzle();
    this.buildScreen();
    this.timer = createRoundTimer(() => performance.now()); // не стартует: партии нет
    this.time.delayedCall(360, () =>
      this.launchOnboarding(() => {
        setOnboarded();
        this.scene.start('MainMenu');
      }),
    );
  }

  /** Первая партия — показываем обучение один раз: время на паузе, ввод заблокирован. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.timer.pause();
    // Даём кадру отрисоваться (и завершиться fade-in камеры), затем открываем оверлей.
    this.time.delayedCall(360, () =>
      this.launchOnboarding(() => {
        setOnboarded();
        this.tutorialActive = false;
        this.timer.resume();
      }),
    );
  }

  private launchOnboarding(onDone: () => void) {
    // Показываем на клетке, которая и правда лишняя: обучение не врёт про доску.
    const demoCell = Math.max(0, this.puzzle.solution.indexOf(false));
    startOnboarding(this, this.locale, this.onboardingTargets(demoCell), {
      cross: () => {
        this.round.toggle(demoCell);
        squash(this, this.cellRects[demoCell]);
        this.refresh();
      },
      reset: () => {
        // Доску возвращаем как была, вместе со счётчиком ходов: обучение не даёт форы.
        this.startRound();
        this.refresh();
        this.movesText.setText(this.movesLabel());
      },
    }, onDone);
  }

  /** Настоящие зоны экрана для подсветки: доска, строка с её суммой, клетка, «Заново». */
  private onboardingTargets(demoCell: number): OnboardingTargets {
    const n = this.puzzle.size;
    const cell = this.cellSize;
    const board = (n + 1) * cell + STRIP_GAP;
    const row = Math.floor(demoCell / n);
    return {
      board: { x: this.boardLeft, y: this.boardTop, w: board, h: board },
      // Строка вместе с плашкой суммы: правило читается только парой «числа → сумма».
      row: { x: this.boardLeft, y: this.boardTop + row * cell, w: board, h: cell },
      cell: {
        x: this.boardLeft + (demoCell % n) * cell,
        y: this.boardTop + row * cell,
        w: cell,
        h: cell,
      },
      reset: this.resetRect,
    };
  }
}
