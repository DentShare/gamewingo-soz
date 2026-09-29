import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createGrid2048, applyMove, SIZE, type Grid2048, type Dir } from '../../core/grid';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT, tileColor, tileTextColor, tileFontSize } from '../palette';
import {
  applyTheme, darken, toast, setupCamera, playSound, makeGameHeader, openPauseSheet, setBackHandler,
  TOP_BAR_H, type GameHeader, type PauseSheet,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, type ChallengeDef } from '@gamewingo/game-progress';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import {
  loadBest, loadSave, saveGame, clearSave, hasOnboarded, setOnboarded,
} from '../../core/persistence';
import { startOnboarding, type Rect } from '../onboarding';

const W = 400;
const TILE = 80;
const GAP = 10;
const PAD = 12;
const BOARD = SIZE * TILE + (SIZE - 1) * GAP + 2 * PAD; // 374
const BOARD_LEFT = (W - BOARD) / 2;
/** Строка активного испытания — на поле, сразу под шапкой партии. */
const CHALLENGE_Y = TOP_BAR_H + 22;
/** Поле — под строкой испытания; под шапку не залезает. */
const BOARD_TOP = TOP_BAR_H + 48;
const SWIPE_MIN = 24; // порог свайпа, px

/**
 * Показательное поле для обучения: две «2» рядом в верхнем ряду сливаются ходом влево,
 * а плитки в нулевой колонке остаются на месте — слияние видно без лишнего движения.
 */
const TUTORIAL_CELLS: number[][] = [
  [2, 2, 0, 0],
  [4, 0, 0, 0],
  [8, 0, 0, 0],
  [0, 0, 0, 0],
];

export class Game extends Scene {
  private locale: Locale = 'ru';
  private session!: Session;
  /** Активное испытание — его прогресс висит строкой под шапкой партии. */
  private challenge: ChallengeDef | null = null;
  private challengeText?: Phaser.GameObjects.Text;
  /** Номиналы, уже отпразднованные тостом в этой партии. */
  private cheered = new Set<number>();
  /** Ход, на котором впервые собран номинал (для испытаний на скорость). */
  private tileMoves = new Map<number, number>();
  private core!: Grid2048;
  private tileLayer!: Phaser.GameObjects.Container;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private best = 0;
  private timer!: RoundTimer;
  private finished = false;
  /** Идёт обучение: игровой ввод (свайпы и стрелки) заблокирован. */
  private tutorialActive = false;
  private swipeFrom: { x: number; y: number } | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.finished = false;
    this.tutorialActive = false;
    this.swipeFrom = null;
    this.header = undefined;
    this.pause = null;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    // Активное испытание: его условие показывается в шапке и живёт всю партию.
    this.challenge = challengeStates('2048', CHALLENGES).find((c) => c.active) ?? null;
    this.cheered = new Set();
    this.tileMoves = new Map();
    this.session = this.registry.get('session') as Session;

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    // Продолжение сохранённой партии или новая игра.
    const resume = !!this.registry.get('resume');
    this.registry.set('resume', false);
    const saved = resume ? loadSave() : null;
    if (saved) {
      this.core = createGrid2048(this.freshRng(), saved);
    } else {
      clearSave(); // старая партия больше не нужна
      this.core = createGrid2048(this.freshRng());
    }
    this.best = loadBest();

    this.buildHud();
    this.buildBoard();
    this.tileLayer = this.add.container(0, 0);
    this.redraw();
    this.bindInput();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      // Приложение вернулось, а у игрока открыта пауза (или идёт обучение) — часы стоят дальше.
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorialActive) this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding(!!saved);
  }

  private freshRng(): () => number {
    return mulberry32(Math.floor(Math.random() * 2 ** 31));
  }

  // ── Обучение ────────────────────────────────────────────────────────────────

  /**
   * «Как играть» из меню: строим настоящее поле с показательной раскладкой,
   * НЕ стартуем сессию/таймер, НЕ трогаем сохранение партии и рекорд.
   * По завершении/пропуску — обратно в меню.
   */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.best = loadBest();
    this.core = createGrid2048(this.freshRng(), { cells: TUTORIAL_CELLS });

    this.buildHud();
    this.buildBoard();
    this.tileLayer = this.add.container(0, 0);
    this.redraw();
    this.bindInput(); // ввод связан, но tryMove заблокирован флагом обучения

    this.time.delayedCall(360, () => {
      this.launchOnboarding(() => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /**
   * Первая партия: показываем обучение один раз поверх настоящего поля.
   * На время обучения поле подменяется показательной раскладкой, таймер на паузе;
   * после — возвращается свежая партия игрока.
   */
  private maybeShowOnboarding(resumed: boolean) {
    if (resumed || hasOnboarded() || this.core.moves > 0) return;
    const realCore = this.core;
    this.tutorialActive = true;
    this.timer.pause();
    this.core = createGrid2048(this.freshRng(), { cells: TUTORIAL_CELLS });
    this.redraw();
    this.refreshScore();

    this.time.delayedCall(360, () => {
      this.launchOnboarding(() => {
        setOnboarded();
        this.core = realCore;
        this.redraw();
        this.refreshScore();
        this.tutorialActive = false;
        this.timer.resume();
      });
    });
  }

  private launchOnboarding(onDone: () => void) {
    let demoDone = false;
    startOnboarding(
      this,
      this.locale,
      { board: this.boardRect(), hud: this.hudRect() },
      {
        demoMerge: () => {
          if (demoDone) return null;
          demoDone = true;
          return this.tutorialMove('left');
        },
      },
      onDone,
    );
  }

  private boardRect(): Rect {
    return { x: BOARD_LEFT, y: BOARD_TOP, w: BOARD, h: BOARD };
  }

  /** Чипы счёта и рекорда в шапке — для подсветки на третьем шаге обучения. */
  private hudRect(): Rect {
    const a = this.header?.chipRect('score');
    const b = this.header?.chipRect('best');
    if (!a || !b) return this.boardRect();
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }

  /**
   * Настоящий ход в режиме обучения: ядро, анимации и счёт работают как в игре,
   * но сохранение партии и конец игры не трогаются.
   * Возвращает прямоугольник слитой плитки — обучение её подсвечивает.
   */
  private tutorialMove(dir: Dir): Rect | null {
    const before = this.core.cells.map((row) => [...row]);
    const expected = applyMove(before, dir);
    if (!expected.moved) return null;
    this.core.move(dir);
    this.redraw({ spawn: this.findSpawn(expected.cells), merged: expected.merges.map((m) => [m.row, m.col]) });
    this.refreshScore();
    const m = expected.merges[0];
    if (!m) return null;
    const { x, y } = this.cellXY(m.row, m.col);
    return { x: x - TILE / 2, y: y - TILE / 2, w: TILE, h: TILE };
  }

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «2048» и чипы счёта и рекорда.
   * Раньше здесь были белая пилюля «Назад» и текстовый HUD справа.
   * Активное испытание — строкой на поле под шапкой, а не в ней.
   */
  private buildHud() {
    // Ширина чипа — под шестизначное число: растущий счёт не наезжает на соседа.
    const widest = 888888;
    this.header = makeGameHeader(this, {
      title: t(this.locale, 'app.title'),
      chips: [
        { id: 'score', text: this.scoreLabel(), widest: t(this.locale, 'game.score', { n: widest }) },
        { id: 'best', text: this.bestLabel(), widest: t(this.locale, 'game.best', { n: widest }) },
      ],
      onBack: () => this.openPause(),
    });
    if (this.challenge) {
      this.challengeText = this.add
        .text(W / 2, CHALLENGE_Y, this.challengeLabel(), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    } else {
      this.challengeText = undefined;
    }
  }

  private scoreLabel(): string {
    return t(this.locale, 'game.score', { n: this.core.score });
  }

  private bestLabel(): string {
    return t(this.locale, 'game.best', { n: this.best });
  }

  /** Обновляет счёт и, при необходимости, рекорд в шапке по состоянию ядра. */
  private refreshScore() {
    this.header?.setChip('score', this.scoreLabel());
    // Показательный ход обучения — не игровой: рекорд он двигать не должен.
    if (this.tutorialActive) return;
    if (this.core.score > this.best) {
      this.best = this.core.score;
      this.header?.setChip('best', this.bestLabel());
    }
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    // В обучении ставить на паузу нечего — стрелка просто возвращает в меню.
    if (this.tutorialActive) {
      this.exitToMenu();
      return;
    }
    this.swipeFrom = null; // начатый до паузы свайп не должен доехать до поля
    this.timer.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      kind: 'run',
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => { this.pause = null; this.timer.resume(); },
      // Новая партия: create() без флага resume стирает сохранение и раздаёт поле заново.
      onRestart: () => {
        this.registry.set('resume', false);
        this.scene.restart();
      },
      // Сохранение не трогаем: в меню останется «Продолжить».
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «Счёт: 1240 · Рекорд: 3400». */
  private pauseSummary(): string {
    return `${this.scoreLabel()} · ${this.bestLabel()}`;
  }

  /** Системный «назад»: из паузы — в меню, иначе — открыть паузу. */
  private onSystemBack() {
    if (this.pause?.open) {
      this.pause.close();
      this.pause = null;
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

  // ── Поле ─────────────────────────────────────────────────────────────────────

  private cellXY(row: number, col: number): { x: number; y: number } {
    return {
      x: BOARD_LEFT + PAD + col * (TILE + GAP) + TILE / 2,
      y: BOARD_TOP + PAD + row * (TILE + GAP) + TILE / 2,
    };
  }

  private buildBoard() {
    const g = this.add.graphics();
    g.fillStyle(darken(COLORS.board, 0.16), 1).fillRoundedRect(BOARD_LEFT, BOARD_TOP + 4, BOARD, BOARD, 18);
    g.fillStyle(COLORS.board, 1).fillRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD, BOARD, 18);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const { x, y } = this.cellXY(r, c);
        g.fillStyle(COLORS.boardCell, 1).fillRoundedRect(x - TILE / 2, y - TILE / 2, TILE, TILE, 12);
      }
    }
  }

  /**
   * Полная перерисовка поля по состоянию ядра (канон: просто и надёжно).
   * `spawn`/`merged` — клетки для лёгкого tween-подскока.
   */
  private redraw(fx?: { spawn: [number, number] | null; merged: Array<[number, number]> }) {
    this.tileLayer.removeAll(true);
    const cells = this.core.cells;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = cells[r][c];
        if (v === 0) continue;
        const cont = this.buildTile(r, c, v);
        if (fx?.spawn && fx.spawn[0] === r && fx.spawn[1] === c) {
          cont.setScale(0);
          this.tweens.add({ targets: cont, scale: 1, duration: 160, ease: 'Back.easeOut' });
        } else if (fx?.merged.some(([mr, mc]) => mr === r && mc === c)) {
          this.tweens.add({ targets: cont, scale: 1.12, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        }
      }
    }
  }

  private buildTile(row: number, col: number, value: number): Phaser.GameObjects.Container {
    const { x, y } = this.cellXY(row, col);
    const cont = this.add.container(x, y);
    const color = tileColor(value);
    const g = this.add.graphics();
    g.fillStyle(darken(color, 0.18), 1).fillRoundedRect(-TILE / 2, -TILE / 2 + 3, TILE, TILE, 12);
    g.fillStyle(color, 1).fillRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 12);
    const txt = this.add
      .text(0, 0, String(value), {
        fontFamily: FONT, fontSize: tileFontSize(value), color: tileTextColor(value), fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    cont.add([g, txt]);
    this.tileLayer.add(cont);
    return cont;
  }

  // ── Управление: свайп + стрелки ──────────────────────────────────────────────

  private bindInput() {
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.tryMove('left'));
    kb?.on('keydown-RIGHT', () => this.tryMove('right'));
    kb?.on('keydown-UP', () => this.tryMove('up'));
    kb?.on('keydown-DOWN', () => this.tryMove('down'));

    // Слушатели на всю сцену: они слышат и тапы по затемнению паузы, поэтому
    // пока пауза открыта, свайп не начинается и не завершается.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeFrom = this.pause?.open ? null : this.pointerXY(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeFrom || this.pause?.open) {
        this.swipeFrom = null;
        return;
      }
      const to = this.pointerXY(p);
      const dx = to.x - this.swipeFrom.x;
      const dy = to.y - this.swipeFrom.y;
      this.swipeFrom = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      const dir: Dir = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      this.tryMove(dir);
    });
  }

  /**
   * Указатель в логических координатах сцены. Холст в DPR раз плотнее, камера зумится
   * обратно — без пересчёта порог свайпа сжался бы в DPR раз.
   */
  private pointerXY(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  /** Клетка, появившаяся после спавна: единственное отличие от чистого хода. */
  private findSpawn(expectedCells: number[][]): [number, number] | null {
    let spawn: [number, number] | null = null;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.core.cells[r][c] !== expectedCells[r][c]) spawn = [r, c];
      }
    }
    return spawn;
  }

  private tryMove(dir: Dir) {
    // Пауза блокирует и свайпы, и стрелки клавиатуры.
    if (this.finished || this.tutorialActive || this.pause?.open) return;
    const before = this.core.cells.map((row) => [...row]);
    const res = this.core.move(dir);
    if (!res.moved) return;
    playSound('swipe');

    // Спавн и слитые клетки для подскока: сравниваем с чистым ходом без спавна.
    const expected = applyMove(before, dir);
    this.redraw({ spawn: this.findSpawn(expected.cells), merged: expected.merges.map((m) => [m.row, m.col]) });
    this.refreshScore();

    // Партию больше ничего не обрывает: новый крупный номинал — только праздник.
    const mt = this.core.maxTile();
    if (mt >= 128 && !this.cheered.has(mt)) {
      this.cheered.add(mt);
      playSound('star');
      toast(this, W / 2, 580, t(this.locale, 'game.reached', { tile: mt }));
    }
    if (!this.tileMoves.has(mt)) this.tileMoves.set(mt, this.core.moves);
    this.updateChallengeLine();

    if (this.core.isOver()) {
      this.finished = true;
      clearSave(); // законченную партию продолжать нельзя
      this.time.delayedCall(450, () => this.endGame());
    } else {
      this.persist();
    }
  }

  /** Снимок партии после каждого результативного хода — чтобы можно было вернуться. */
  private persist() {
    saveGame({
      cells: this.core.cells.map((row) => [...row]),
      score: this.core.score,
      moves: this.core.moves,
      won: this.core.hasWon(),
    });
  }

  private endGame() {
    const durationMs = Math.round(this.timer.elapsedMs());
    const score = this.core.score;
    const maxTile = this.core.maxTile();
    const moves = this.core.moves;

    void this.session
      .finish({ score, maxTile, moves, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    // Скоростные испытания: номинал собран не позднее заданного хода.
    const fast = (tile: number, byMove: number): number => {
      const at = this.tileMoves.get(tile);
      return at !== undefined && at <= byMove ? 1 : 0;
    };
    this.registry.set('lastGame', {
      locale: this.locale, score, maxTile, moves, durationMs,
      tile256in220: fast(256, 220), tile512in400: fast(512, 400), tile1024in800: fast(1024, 800),
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  /** «Собери плитку 256 · 128/256» — активное испытание с прогрессом. */
  private challengeLabel(): string {
    const ch = this.challenge;
    if (!ch) return '';
    return t(this.locale, 'game.challenge', {
      text: t(this.locale, `challenge.${ch.id}`),
      v: Math.min(ch.target, this.metricValue(ch.metric)),
      n: ch.target,
    });
  }

  /** Текущее значение метрики партии — для живого прогресса испытания. */
  private metricValue(metric: string): number {
    switch (metric) {
      case 'score': return this.core.score;
      case 'maxTile': return this.core.maxTile();
      default: return 0; // скоростные испытания судятся по итогу партии
    }
  }

  private updateChallengeLine() {
    this.challengeText?.setText(this.challengeLabel());
  }
}
