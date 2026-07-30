import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { levelAt, type Grid2048Params } from '../../core/levels';
import { createGrid2048, applyMove, SIZE, type Grid2048, type Dir } from '../../core/grid';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT, tileColor, tileTextColor, tileFontSize } from '../palette';
import { applyTheme, darken, toast, setupCamera, makeBackButton } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
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
const BOARD_TOP = 140;
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
  private level = 1;
  private params: Grid2048Params = levelAt(1).params;
  private session!: Session;
  private core!: Grid2048;
  private tileLayer!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private best = 0;
  private timer!: RoundTimer;
  private finished = false;
  private wonShown = false;
  /** Идёт обучение: игровой ввод (свайпы и стрелки) заблокирован. */
  private tutorialActive = false;
  private swipeFrom: { x: number; y: number } | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.finished = false;
    this.wonShown = false;
    this.tutorialActive = false;
    this.swipeFrom = null;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    this.params = levelAt(this.level).params;
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
      this.core = createGrid2048(this.freshRng(), undefined, { startClutter: this.params.startClutter });
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
      else if (e.type === 'RESUME') this.timer.resume();
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

  /** Зона счёта и рекорда в шапке — для подсветки на третьем шаге обучения. */
  private hudRect(): Rect {
    const a = this.scoreText.getBounds();
    const b = this.bestText.getBounds();
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.right, b.right) - x, h: Math.max(a.bottom, b.bottom) - y };
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

  // ── HUD: кнопка назад + счёт + рекорд ────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.scoreText = this.add
      .text(W - 20, 24, t(this.locale, 'game.score', { n: this.core.score }), {
        fontFamily: FONT, fontSize: 16, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
    this.bestText = this.add
      .text(W - 20, 46, t(this.locale, 'game.best', { n: this.best }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
  }

  /** Обновляет счёт и, при необходимости, рекорд в шапке по состоянию ядра. */
  private refreshScore() {
    this.scoreText.setText(t(this.locale, 'game.score', { n: this.core.score }));
    // Показательный ход обучения — не игровой: рекорд он двигать не должен.
    if (this.tutorialActive) return;
    if (this.core.score > this.best) {
      this.best = this.core.score;
      this.bestText.setText(t(this.locale, 'game.best', { n: this.best }));
    }
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

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeFrom = this.pointerXY(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeFrom) return;
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
    if (this.finished || this.tutorialActive) return;
    const before = this.core.cells.map((row) => [...row]);
    const res = this.core.move(dir);
    if (!res.moved) return;

    // Спавн и слитые клетки для подскока: сравниваем с чистым ходом без спавна.
    const expected = applyMove(before, dir);
    this.redraw({ spawn: this.findSpawn(expected.cells), merged: expected.merges.map((m) => [m.row, m.col]) });
    this.refreshScore();

    // Уровень пройден, как только собрана плитка-цель: партия не тянется без нужды.
    if (!this.wonShown && this.core.maxTile() >= this.params.targetTile) {
      this.wonShown = true;
      toast(this, W / 2, 580, t(this.locale, 'game.reached', { tile: this.params.targetTile }));
      this.finished = true;
      clearSave();
      this.time.delayedCall(900, () => this.endGame());
      return;
    }

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

    this.registry.set('lastGame', {
      locale: this.locale, level: this.level, score, maxTile, moves, durationMs,
      cleared: maxTile >= this.params.targetTile,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
