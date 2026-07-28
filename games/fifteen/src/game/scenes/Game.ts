import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { LEVELS, createBoard, type Board, type LevelId } from '../../core/board';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';

const W = 400;
const GRID_TOP = 96;
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
  private level: LevelId = '3x3';
  private session!: Session;
  private board!: Board;
  /** Вью плитки по индексу клетки (null — пустая клетка). */
  private views: (TileView | null)[] = [];
  private movesText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
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
  private hudBounds: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.views = [];
    this.finished = false;
    this.tutorialActive = false;
    this.demoUndoCell = -1;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as LevelId) ?? '3x3';
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
      else if (e.type === 'RESUME') this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  /** Свежий решаемый расклад текущего уровня. */
  private newBoard(): Board {
    return createBoard(LEVELS[this.level].size, mulberry32(Math.floor(Math.random() * 2 ** 31)));
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
   * ход этой плиткой → HUD (ходы и время).
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
      { rect: () => this.hudBounds, textKey: 'onboarding.goal', pad: 10, radius: 12, gap: 40 },
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
    this.movesText.setText(t(this.locale, 'game.moves', { n: 0 }));
  }

  update() {
    if (this.timeText && !this.finished) {
      const sec = Math.floor(this.timer.elapsedMs() / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      this.timeText.setText(`${mm}:${ss}`);
    }
  }

  // ── HUD: кнопка назад + ходы + таймер ────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.movesText = this.add
      .text(W / 2 + 40, 34, t(this.locale, 'game.moves', { n: 0 }), {
        fontFamily: FONT, fontSize: 16, color: COLORS.headText,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    this.timeText = this.add
      .text(W - 20, 34, '00:00', { fontFamily: FONT, fontSize: 16, color: COLORS.headMuted })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    // Общая рамка «ходы + время» — её подсвечивает последний шаг обучения.
    const a = this.movesText.getBounds();
    const b = this.timeText.getBounds();
    const top = Math.min(a.y, b.y);
    this.hudBounds = { x: a.x, y: top, w: b.x + b.width - a.x, h: Math.max(a.bottom, b.bottom) - top };
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    const w = 92, h = 40, lip = 4, r = 12;
    const container = this.add.container(14 + w / 2, 34).setDepth(30);
    const base = this.add.graphics();
    base.fillStyle(darken(COLORS.panel, 0.14), 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    const faceC = this.add.container(0, -lip);
    const face = this.add.graphics();
    face.fillStyle(COLORS.panel, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    face.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    const ax = -w / 2 + 18;
    face.lineStyle(2.5, COLORS.iconDark, 1);
    face.beginPath();
    face.moveTo(ax + 5, -6); face.lineTo(ax - 4, 0); face.lineTo(ax + 5, 6);
    face.strokePath();
    const label = this.add
      .text(ax + 12, 0, t(this.locale, 'menu.back'), { fontFamily: FONT, fontSize: 16, color: COLORS.headText })
      .setOrigin(0, 0.5)
      .setResolution(DPR);
    faceC.add([face, label]);
    const hit = this.add.rectangle(0, -lip / 2, w, h + lip, 0x000000, 0).setInteractive({ useHandCursor: true });
    container.add([base, faceC, hit]);
    let pressed = false;
    const press = (down: boolean) => { faceC.y = down ? -1 : -lip; };
    hit.on('pointerdown', () => { pressed = true; press(true); });
    hit.on('pointerup', () => { if (pressed) { pressed = false; press(false); this.goBack(); } });
    hit.on('pointerout', () => { if (pressed) { pressed = false; press(false); } });
  }

  private goBack() {
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
    if (this.tutorialActive) return;
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

    this.views[target] = view;
    this.views[cell] = null;
    view.cell = target;
    view.animating = true;
    const { x, y } = this.cellXY(target);
    this.tweens.add({
      targets: view.root, x, y, duration: SLIDE_MS, ease: 'Quad.easeOut',
      onComplete: () => { view.animating = false; },
    });

    this.movesText.setText(t(this.locale, 'game.moves', { n: this.board.moves }));

    if (this.board.isSolved()) {
      this.finished = true;
      this.time.delayedCall(SLIDE_MS + 40, () => this.winWave());
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
    this.time.delayedCall(total, () => this.endGame());
  }

  private endGame() {
    const durationMs = Math.round(this.timer.elapsedMs());
    const moves = this.board.moves;

    void this.session
      .finish({ level: this.level, moves, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, locale: this.locale, moves, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
