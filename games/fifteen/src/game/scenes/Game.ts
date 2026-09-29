import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createBoard, tilesInPlace, type Board } from '../../core/board';
import { levelAt, type FifteenParams } from '../../core/levels';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, darken, setupCamera, toast, shakeCamera, playSound,
  makeGameHeader, openPauseSheet, setBackHandler, uiText, TOP_BAR_H,
  runFirstMoveTutorial, showRuleOnce, type FirstMoveTutorial, type Rect,
  type GameHeader, type PauseSheet,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

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
  /** Обучение в один шаг: первый сдвиг плитки — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.views = [];
    this.finished = false;
    this.tutorial = null;
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
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer.resume();
    });
    this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
    else this.announceLimits();
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

  /**
   * Обучение в один шаг: поле видно, плитка рядом с пустой клеткой обведена и
   * пульсирует, внизу одна фраза. Тап по ней (или по любой подвижной, или
   * стрелка) — настоящий ход; ходы и таймер включаются после него. Цель
   * «собери по порядку» и лимиты — строкой уже после первого хода.
   */
  private startTutorial() {
    this.timer.pause();
    this.header?.setChipsVisible(false);
    const cell = this.movableCell();
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      note: t(this.locale, 'tutorial.note'),
      targets: () => [this.tileRect(cell)],
      pad: 6,
      radius: 16,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open && !this.finished) this.timer.resume();
        // Цель — сразу после первого хода, за ней лимиты уровня.
        this.showRules(['goal', ...this.limitRules()]);
      },
    });
  }

  /** Лимиты уровня — строкой в начале первого уровня, где они появились. */
  private announceLimits() {
    this.showRules(this.limitRules());
  }

  private limitRules(): string[] {
    const out: string[] = [];
    if (this.params.moveLimit) out.push('moveLimit');
    if (this.params.timeLimitSec) out.push('timer');
    return out;
  }

  /** Правила по одному: следующий тост — когда предыдущий погас (2 с + затухание), чтобы не слиплись. */
  private showRules(ids: string[]) {
    if (this.finished || ids.length === 0) return;
    const [id, ...rest] = ids;
    const shown = showRuleOnce(this, `fifteen:${id}`, t(this.locale, `rule.${id}`));
    if (shown) this.time.delayedCall(2500, () => this.showRules(rest));
    else this.showRules(rest);
  }

  /**
   * Плитка для первого хода: соседняя с пустой клеткой, и лучше та, что едет
   * ближе к своему месту — первый ход обучения не должен запутывать поле.
   */
  private movableCell(): number {
    const n = this.board.size;
    const e = this.board.tiles.indexOf(0);
    const er = Math.floor(e / n);
    const ec = e % n;
    const cand: number[] = [];
    // Горизонтальные соседи первыми — такой сдвиг нагляднее.
    if (ec > 0) cand.push(e - 1);
    if (ec < n - 1) cand.push(e + 1);
    if (er > 0) cand.push(e - n);
    if (er < n - 1) cand.push(e + n);
    const home = (v: number) => v - 1;
    const dist = (v: number, at: number) =>
      Math.abs(Math.floor(home(v) / n) - Math.floor(at / n)) + Math.abs((home(v) % n) - (at % n));
    const gain = (c: number) => dist(this.board.tiles[c], c) - dist(this.board.tiles[c], e);
    return cand.reduce((best, c) => (gain(c) > gain(best) ? c : best), cand[0]);
  }

  private tileRect(cell: number): Rect {
    const { x, y } = this.cellXY(cell);
    const s = this.cellSize;
    return { x: x - s / 2, y: y - s / 2, w: s, h: s };
  }

  /** Ходы в чипе: с лимитом «сделано / всего», без лимита — просто счётчик. */
  private movesLabel(): string {
    const n = this.board?.moves ?? 0;
    return this.params.moveLimit ? `${n} / ${this.params.moveLimit}` : String(n);
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
    if (this.finished || this.tutorial?.active) return;
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
    this.timer.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении часы стоят до первого хода — «Продолжить» их не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer.resume(); },
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

  /** Ход по воле игрока (тап или стрелка). */
  private tryMoveCell(cell: number) {
    // Под паузой поле не нажать (затемнение глотает тапы), но стрелки клавиатуры — дошли бы.
    if (this.pause?.open) return;
    this.performMove(cell);
  }

  private performMove(cell: number) {
    if (this.finished) return;
    const view = this.views[cell];
    if (!view || view.animating) return;
    if (!this.board.canMove(cell)) {
      // Правило «ходит только соседка пустой» — в момент первой такой попытки, а не карточкой заранее.
      showRuleOnce(this, 'fifteen:stuck', t(this.locale, 'rule.stuck'));
      return;
    }

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
    // Первый сдвиг закрывает обучение: дальше обычная партия с таймером и ходами.
    this.tutorial?.done();

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
