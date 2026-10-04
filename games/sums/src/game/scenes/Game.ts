import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { generate, createSumsGame, surelyExtraCells, type Puzzle, type PuzzleOptions, type SumsGame } from '../../core/sums';
import { mulberry32 } from '../../core/rng';
import { levelAt } from '../../core/levels';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, makeButton, playSound, squash, sparkle, VIEW_BOTTOM,
  makeGameHeader, openPauseSheet, setBackHandler, TOP_BAR_H, type GameHeader, type PauseSheet,
  runFirstMoveTutorial, showRuleOnce, type FirstMoveTutorial, type Rect,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;
/**
 * Низ экрана считаем от реальной границы вида, а не от логических 720: на вытянутом
 * телефоне кнопка иначе висит посреди пустоты.
 */
const RESET_Y = Math.round(VIEW_BOTTOM - 64);
/** Подпись цели — сразу под шапкой партии. */
const GOAL_Y = TOP_BAR_H + 22;
/** Полоса, в которой живёт доска: под подписью цели и над кнопкой сброса. */
const BOARD_TOP = GOAL_Y + 22;
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
  /** Уровень дня: параметры уровня лестницы, расклад по зерну от даты. */
  private daily = false;
  private params!: PuzzleOptions;
  private session!: Session;

  // Партия.
  private puzzle!: Puzzle;
  private round!: SumsGame;
  private finished = false;
  /** Обучение в один шаг: первое вычёркивание точно лишнего числа — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;
  /** Клетки, лишние в любом решении: вычеркнуть любую из них — удачный первый ход. */
  private tutorialCells: number[] = [];
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
  private header?: GameHeader;
  /** «Заново» — прячем на время обучения: сбрасывать ещё нечего, а полоса подсказки легла бы поверх. */
  private resetBtn?: Phaser.GameObjects.Container;
  private pause: PauseSheet | null = null;
  private timer!: RoundTimer;

  // Геометрия доски.
  private cellSize = 0;
  private boardLeft = 0;
  private boardTop = 0;

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
    this.tutorial = null;
    this.tutorialCells = [];
    this.header = undefined;
    this.resetBtn = undefined;
    this.pause = null;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    // Уровень дня: параметры уровня лестницы, но расклад по зерну от даты — один на всех.
    this.daily = this.registry.get('mode') === 'dailyLevel';
    this.session = this.registry.get('session') as Session;

    this.buildPuzzle();
    this.buildScreen();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      // Приложение вернулось на передний план, а наша пауза открыта — время стоит до «Продолжить».
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer.resume();
    });
    this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
    else this.announceRules();
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  private buildPuzzle() {
    this.params = levelAt(this.level).params;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    this.puzzle = generate(this.params, mulberry32(seed));
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

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» и чип ходов. Таймера на экране
   * у «Сумм» нет (время идёт только в результат) — поэтому и чип один.
   */
  private buildHud() {
    this.header = makeGameHeader(this, {
      title: this.daily ? t(this.locale, 'game.dailyLevel') : t(this.locale, 'game.level', { n: this.level }),
      chips: [{ id: 'moves', text: this.movesLabel(), widest: '888' }],
      onBack: () => this.openPause(),
    });

    this.add
      .text(W / 2, GOAL_Y, t(this.locale, 'game.goal'), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Ходы в чипе — просто счётчик: лимита ходов в «Суммах» нет. */
  private movesLabel(): string {
    return String(this.round.moves);
  }

  /**
   * Стрелка в шапке: пауза вместо мгновенного выхода. Проигрыша в «Суммах» нет,
   * поэтому сводка короткая — только ходы.
   */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.timer.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: t(this.locale, 'pause.moves', { moves: this.movesLabel() }),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении время стоит до первого удачного хода — «Продолжить» его не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer.resume(); },
      // «Начать уровень заново» — новая партия (сессия, время, для лестницы — новый расклад);
      // кнопка «Заново» под доской — другое: снять вычёркивания на этой же доске.
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
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
    this.resetBtn = makeButton(this, W / 2, RESET_Y, t(this.locale, 'game.reset'), () => this.resetBoard(), { width: 200, height: 46 }).root;
  }

  // ── Взаимодействие ───────────────────────────────────────────────────────────

  private onCellTap(i: number) {
    if (this.finished) return;
    const result = this.round.toggle(i);
    // Вычеркнули — короткий щелчок, вернули — шорох: на слух видно, что действие обратимо.
    playSound(result === 'crossed' ? 'tap' : 'swipe');
    squash(this, this.cellRects[i]);
    this.header?.setChip('moves', this.movesLabel());
    this.refresh();
    // Вычеркнуто точно лишнее — обучение закончено, дальше обычная партия.
    if (result === 'crossed' && this.tutorialCells.includes(i)) this.tutorial?.done();
    if (this.round.solved) this.win();
  }

  /**
   * «Заново» возвращает доску к началу вместе со счётчиком ходов: это ровно то же,
   * что выйти и зайти в уровень заново, только без перезагрузки сцены. Оставлять
   * ходы накопленными было бы наказанием за честное «я запутался».
   */
  private resetBoard() {
    if (this.finished) return;
    this.startRound();
    this.header?.setChip('moves', this.movesLabel());
    this.refresh();
  }

  private exitToMenu() {
    if (this.finished) return;
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
    let anyOver = false;
    for (let r = 0; r < n; r++) {
      const state = this.lineState(this.round.rowSum(r), this.puzzle.rowTargets[r]);
      this.paintLine(this.rowPlates[r], this.rowLabels[r], state);
      if (state === 'over') anyOver = true;
      const done = state === 'done';
      if (done && !this.doneRows[r]) newlyDone = true;
      this.doneRows[r] = done;
    }
    for (let c = 0; c < n; c++) {
      const state = this.lineState(this.round.colSum(c), this.puzzle.colTargets[c]);
      this.paintLine(this.colPlates[c], this.colLabels[c], state);
      if (state === 'over') anyOver = true;
      const done = state === 'done';
      if (done && !this.doneCols[c]) newlyDone = true;
      this.doneCols[c] = done;
    }

    // Партию заканчивает win() со своим звуком — здесь бы вышел двойной сигнал.
    if (newlyDone && !this.round.solved) playSound('ok');
    // Что значит красная сумма и как отыграть — в момент первой ошибки, а не карточкой заранее.
    if (anyOver) showRuleOnce(this, 'sums:over', t(this.locale, 'rule.over'));
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
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', moves, undos, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', { level: this.level, daily: this.daily, locale: this.locale, moves, undos, durationMs });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: доска видна, одно точно лишнее число обведено и
   * пульсирует, внизу одна фраза, над ней — что значат суммы по краю. Тап по
   * числу — настоящее вычёркивание; ходы появляются после него. Красная сумма
   * объясняется в момент первой ошибки (`rule.over`).
   */
  private startTutorial() {
    this.timer.pause();
    this.header?.setChipsVisible(false);
    this.resetBtn?.setVisible(false);
    // Показываем на клетке, которая лишняя в ЛЮБОМ решении: обучение не врёт про доску.
    this.tutorialCells = surelyExtraCells(this.puzzle);
    if (this.tutorialCells.length === 0) this.tutorialCells = [Math.max(0, this.puzzle.solution.indexOf(false))];
    const cell = this.tutorialCells[0];
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      note: t(this.locale, 'tutorial.note'),
      targets: () => [this.cellRect(cell)],
      pad: 4,
      radius: 12,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        this.header?.setChip('moves', this.movesLabel());
        this.resetBtn?.setVisible(true);
        if (!this.pause?.open && !this.finished) this.timer.resume();
        this.announceRules();
      },
    });
  }

  /** Новое на уровне — одной строкой в начале первого уровня, где оно появилось. */
  private announceRules() {
    if (this.finished) return;
    if (this.params.negative) showRuleOnce(this, 'sums:negative', t(this.locale, 'rule.negative'));
  }

  private cellRect(i: number): Rect {
    const n = this.puzzle.size;
    const cell = this.cellSize;
    return { x: this.boardLeft + (i % n) * cell, y: this.boardTop + Math.floor(i / n) * cell, w: cell, h: cell };
  }
}
