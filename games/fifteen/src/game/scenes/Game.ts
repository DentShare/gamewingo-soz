import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createBoard, tilesInPlace, type Board } from '../../core/board';
import { levelAt, type FifteenParams } from '../../core/levels';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, darken, setupCamera, toast, shakeCamera, playSound,
  makeGameHeader, openPauseSheet, setBackHandler, uiText, TOP_BAR_H,
  type GameHeader, type PauseSheet,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';

const W = 400;
const GRID_TOP = TOP_BAR_H + 16; // поле сразу под шапкой партии
const GRID_BOTTOM = 620;
const GAP = 8;
const SLIDE_MS = 90;

interface TileView {
  root: Phaser.GameObjects.Container;
  value: number;
  cell: number;
  animating: boolean;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private daily = false;
  private params!: FifteenParams;
  private session!: Session;
  private board!: Board;
  /** Вью плитки по индексу клетки (null — пустая клетка). */
  private views: (TileView | null)[] = [];
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private timer!: RoundTimer;
  private finished = false;
  private cellSize = 0;
  private gridLeft = 0;   // центр первой клетки по X
  private gridTop = 0;    // центр первой клетки по Y
  /** Идёт обучение: игровой ввод (тапы и стрелки) не принимаем. */
  private tutorialActive = false;
  /** Клетка, из которой нужно вернуть плитку после обучающего показа (−1 — нечего). */
  private demoUndoCell = -1;
  private boardBounds: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.views = [];
    this.finished = false;
    this.tutorialActive = false;
    this.demoUndoCell = -1;
    this.header = undefined;
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
    this.params = levelAt(this.level).params;
    this.session = this.registry.get('session') as Session;

    // Режим «Как играть» из меню: обучение на настоящем поле, партия не начинается.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.board = this.newBoard();

    this.buildHud();
    this.buildGrid();
    this.bindKeyboard();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      // Приложение вернулось на передний план, а наша пауза открыта — часы стоят до «Продолжить».
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorialActive) this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  /** Свежий решаемый расклад текущего уровня. */
  private newBoard(): Board {
    const { size, walk } = this.params;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    return createBoard(size, mulberry32(seed), walk);
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: строим настоящее поле, но без сессии и таймера; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;

    this.board = this.newBoard();
    this.buildHud();
    this.buildGrid();
    this.bindKeyboard();
    // Таймер нужен только чтобы update() было что показывать: не стартуем — стоит на 00:00.
    this.timer = createRoundTimer(() => performance.now());

    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз. Таймер на паузе, ввод заблокирован. */
  private maybeShowOnboarding() {
    if (this.finished || hasOnboarded()) return;
    this.tutorialActive = true;
    this.timer.pause();
    // Даём кадру отрисоваться (и завершиться fade-in камеры), затем открываем оверлей.
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.undoDemoMove();
        this.tutorialActive = false;
        this.timer.resume();
      });
    });
  }

  /**
   * Четыре шага на живом поле: всё поле → конкретная подвижная плитка → настоящий
   * ход этой плиткой → чипы шапки (ходы и время).
   */
  private tutorialSteps(): OnboardingStep[] {
    const from = this.movableCell();
    let to = from;
    return [
      { rect: () => this.boardBounds, textKey: 'onboarding.board', pad: 10, radius: 20, gap: 12 },
      { rect: () => this.tileRect(from), textKey: 'onboarding.tile', pad: 6, radius: 16 },
      {
        rect: () => this.tileRect(to),
        textKey: 'onboarding.move',
        pad: 6,
        radius: 16,
        before: (done) => {
          to = this.board.tiles.indexOf(0); // пустая клетка = куда приедет плитка
          this.performMove(from);
          this.demoUndoCell = to;           // вернём плитку на место после обучения
          this.time.delayedCall(SLIDE_MS + 180, done);
        },
      },
      { rect: () => this.chipsRect(), textKey: 'onboarding.goal', pad: 8, radius: 16, gap: 40 },
    ];
  }

  /** Любая плитка, соседняя с пустой клеткой (по горизонтали — нагляднее). */
  private movableCell(): number {
    const n = this.board.size;
    const e = this.board.tiles.indexOf(0);
    const row = Math.floor(e / n);
    const col = e % n;
    if (col > 0) return e - 1;
    if (col < n - 1) return e + 1;
    return row > 0 ? e - n : e + n;
  }

  private tileRect(cell: number): Rect {
    const { x, y } = this.cellXY(cell);
    const s = this.cellSize;
    return { x: x - s / 2, y: y - s / 2, w: s, h: s };
  }

  /** Возврат плитки после обучающего показа: расклад и счётчик как до обучения. */
  private undoDemoMove() {
    if (this.demoUndoCell < 0) return;
    this.performMove(this.demoUndoCell);
    this.demoUndoCell = -1;
    this.board.resetMoves();
    this.header?.setChip('moves', this.movesLabel());
  }

  /** Ходы в чипе: с лимитом «сделано / всего», без лимита — просто счётчик. */
  private movesLabel(): string {
    const n = this.board?.moves ?? 0;
    return this.params.moveLimit ? `${n} / ${this.params.moveLimit}` : String(n);
  }

  /** Общая рамка чипов «ходы + время» — её подсвечивает последний шаг обучения. */
  private chipsRect(): Rect {
    const a = this.header?.chipRect('moves');
    const b = this.header?.chipRect('time');
    if (!a || !b) return this.boardBounds;
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
  }

  update() {
    if (!this.header || !this.timer || this.finished) return;
    const sec = this.clockSec();
    const limit = this.params.timeLimitSec;
    // С лимитом идёт обратный отсчёт: последние десять секунд — белый чип с красным текстом.
    this.header.setChip('time', formatClock(sec), Boolean(limit) && sec <= 10);
    if (limit && sec <= 0) this.failRound('time');
  }

  /** Секунды на часах: с лимитом — сколько осталось, без лимита — сколько прошло. */
  private clockSec(): number {
    const elapsed = Math.floor((this.timer?.elapsedMs() ?? 0) / 1000);
    const limit = this.params.timeLimitSec;
    return limit ? Math.max(0, limit - elapsed) : elapsed;
  }

  /** Уровень не пройден: кончились ходы или время. */
  private failRound(cause: 'moves' | 'time') {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.timer.pause();
    toast(this, 200, 620, t(this.locale, `game.fail.${cause}`));
    shakeCamera(this, 260, 0.012);
    this.time.delayedCall(1100, () => this.endGame(false));
  }

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» и чипы ходов и таймера.
   * Раньше здесь были белая пилюля «Назад» и текстовый HUD, а тап по «Назад»
   * посреди уровня с лимитом сразу терял партию.
   */
  private buildHud() {
    const limit = this.params.moveLimit;
    this.header = makeGameHeader(this, {
      title: this.daily ? t(this.locale, 'game.dailyLevel') : t(this.locale, 'game.level', { n: this.level }),
      chips: [
        { id: 'moves', text: this.movesLabel(), widest: limit ? `${limit} / ${limit}` : '888' },
        { id: 'time', text: formatClock(this.params.timeLimitSec), widest: '88:88' },
      ],
      onBack: () => this.openPause(),
    });
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    // В обучении ставить на паузу нечего — стрелка просто возвращает в меню.
    if (this.tutorialActive) {
      this.exitToMenu();
      return;
    }
    this.timer.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => { this.pause = null; this.timer.resume(); },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «Таймер остановлен · ходы 11 / 20 · осталось 0:09». */
  private pauseSummary(): string {
    const parts: string[] = [];
    if (this.params.timeLimitSec) parts.push(uiText(this.locale, 'pause.timerStopped'));
    parts.push(t(this.locale, 'pause.moves', { moves: this.movesLabel() }));
    if (this.params.timeLimitSec) parts.push(uiText(this.locale, 'pause.left', { t: formatClock(this.clockSec()) }));
    return parts.join(' · ');
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

  // ── Поле и плитки ────────────────────────────────────────────────────────────

  private cellXY(cell: number): { x: number; y: number } {
    const size = this.board.size;
    return {
      x: this.gridLeft + (cell % size) * (this.cellSize + GAP),
      y: this.gridTop + Math.floor(cell / size) * (this.cellSize + GAP),
    };
  }

  private buildGrid() {
    const n = this.board.size;
    this.cellSize = Math.floor(Math.min(
      (W - 24 - (n - 1) * GAP) / n,
      (GRID_BOTTOM - GRID_TOP - (n - 1) * GAP) / n,
    ));
    const gridW = n * this.cellSize + (n - 1) * GAP;
    const gridH = n * this.cellSize + (n - 1) * GAP;
    this.gridLeft = (W - gridW) / 2 + this.cellSize / 2;
    this.gridTop = GRID_TOP + (GRID_BOTTOM - GRID_TOP - gridH) / 2 + this.cellSize / 2;
    this.boardBounds = {
      x: this.gridLeft - this.cellSize / 2,
      y: this.gridTop - this.cellSize / 2,
      w: gridW,
      h: gridH,
    };

    // «Лунка» поля — мягкая подложка под плитками.
    const pad = 10;
    const well = this.add.graphics().setDepth(0);
    well.fillStyle(COLORS.boardWell, 1).fillRoundedRect(
      this.gridLeft - this.cellSize / 2 - pad,
      this.gridTop - this.cellSize / 2 - pad,
      gridW + pad * 2,
      gridH + pad * 2,
      18,
    );

    for (let cell = 0; cell < n * n; cell++) {
      const value = this.board.tiles[cell];
      if (value === 0) {
        this.views.push(null);
        continue;
      }
      this.views.push(this.buildTile(cell, value));
    }
  }

  /** Плитка: оранжевый скруглённый квадрат, тёмный нижний бортик 3px, белая цифра. */
  private buildTile(cell: number, value: number): TileView {
    const s = this.cellSize;
    const { x, y } = this.cellXY(cell);
    const r = Math.max(10, Math.round(s * 0.14));
    const root = this.add.container(x, y).setDepth(1);

    const g = this.add.graphics();
    g.fillStyle(darken(COLORS.tile, 0.3), 1).fillRoundedRect(-s / 2, -s / 2 + 3, s, s, r);
    g.fillStyle(COLORS.tile, 1).fillRoundedRect(-s / 2, -s / 2, s, s, r);
    const num = this.add
      .text(0, 0, String(value), {
        fontFamily: FONT, fontSize: Math.round(s * 0.4), color: COLORS.tileText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const hit = this.add.rectangle(0, 0, s, s, 0x000000, 0).setInteractive({ useHandCursor: true });
    root.add([g, num, hit]);

    const view: TileView = { root, value, cell, animating: false };
    hit.on('pointerup', () => this.tryMoveCell(view.cell));
    return view;
  }

  // ── Ходы ─────────────────────────────────────────────────────────────────────

  /** Стрелки: плитка едет В пустую клетку с противоположной стороны (ArrowUp — плитка ПОД пустой). */
  private bindKeyboard() {
    const kb = this.input.keyboard;
    if (!kb) return;
    const n = this.board.size;
    const fromEmpty = (dr: number, dc: number) => {
      if (this.finished) return;
      const e = this.board.tiles.indexOf(0);
      const row = Math.floor(e / n) + dr;
      const col = (e % n) + dc;
      if (row < 0 || row >= n || col < 0 || col >= n) return;
      this.tryMoveCell(row * n + col);
    };
    kb.on('keydown-UP', () => fromEmpty(1, 0));      // плитка под пустой уезжает вверх
    kb.on('keydown-DOWN', () => fromEmpty(-1, 0));
    kb.on('keydown-LEFT', () => fromEmpty(0, 1));
    kb.on('keydown-RIGHT', () => fromEmpty(0, -1));
  }

  /** Ход по воле игрока (тап или стрелка). Во время обучения ввод игнорируем. */
  private tryMoveCell(cell: number) {
    // Под паузой поле не нажать (затемнение глотает тапы), но стрелки клавиатуры — дошли бы.
    if (this.tutorialActive || this.pause?.open) return;
    this.performMove(cell);
  }

  /** Сам ход. Этим же путём ходит обучающий показ — мимо блокировки ввода. */
  private performMove(cell: number) {
    if (this.finished) return;
    const view = this.views[cell];
    if (!view || view.animating) return;
    if (!this.board.canMove(cell)) return;

    const target = this.board.tiles.indexOf(0);   // пустая клетка до хода
    if (!this.board.move(cell)) return;
    playSound('swipe');

    this.views[target] = view;
    this.views[cell] = null;
    view.cell = target;
    view.animating = true;
    const { x, y } = this.cellXY(target);
    this.tweens.add({
      targets: view.root, x, y, duration: SLIDE_MS, ease: 'Quad.easeOut',
      onComplete: () => { view.animating = false; },
    });

    this.header?.setChip('moves', this.movesLabel());

    if (this.board.isSolved()) {
      this.finished = true;
      this.time.delayedCall(SLIDE_MS + 40, () => this.winWave());
    } else if (this.params.moveLimit && this.board.moves >= this.params.moveLimit) {
      // Ходы кончились — даём плитке доехать, чтобы игрок увидел последний ход.
      this.time.delayedCall(SLIDE_MS + 40, () => this.failRound('moves'));
    }
  }

  /** Победа: волна подпрыгиваний плиток по порядку номеров, затем финиш. */
  private winWave() {
    const tiles = this.views.filter((v): v is TileView => v !== null);
    for (const v of tiles) {
      this.tweens.add({
        targets: v.root,
        y: v.root.y - 14,
        duration: 150,
        delay: (v.value - 1) * 40,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
    const total = (tiles.length - 1) * 40 + 300 + 250;
    this.time.delayedCall(total, () => this.endGame(true));
  }

  private endGame(cleared: boolean) {
    const durationMs = Math.round(this.timer.elapsedMs());
    const moves = this.board.moves;

    void this.session
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', moves, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, locale: this.locale, moves, durationMs, cleared,
      // Для провала — докуда дошли: «На месте плиток: 11 из 15».
      inPlace: tilesInPlace(this.board.tiles), tiles: this.board.size * this.board.size - 1,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}

/** «0:09», «1:50» — часы в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
