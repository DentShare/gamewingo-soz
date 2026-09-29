import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  blockDims, makePuzzle, conflicts, isComplete, type Grid,
} from '../../core/sudoku';
import { mulberry32 } from '../../core/rng';
import { levelAt, type SudokuParams } from '../../core/levels';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, type Button, makeButton, makeKeyCap, toast, shakeCamera,
  playSound, makeGameHeader, openPauseSheet, setBackHandler, uiText, TOP_BAR_H,
  type GameHeader, type PauseSheet,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { startOnboarding, type OnboardingTargets, type Rect } from '../onboarding';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;
const GRID_TOP = TOP_BAR_H + 16; // поле сразу под шапкой партии
const PAD_TOP = 470;   // верх цифровой панели
const KEY_H = 54;
const KEY_GAP = 8;
const HINT_Y = 596;    // центр кнопки-подсказки
const MAX_HINTS = 3;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private daily = false;
  private params!: SudokuParams;
  /** Ошибочных вводов за партию: считается лимитом уровня, а не подсказками. */
  private mistakes = 0;
  private session!: Session;

  // Состояние партии (плоские сетки size×size).
  private grid: Grid = [];
  private solution: Grid = [];
  private given: boolean[] = [];
  private size = 4;
  private selected: number | null = null;
  private hintsLeft = MAX_HINTS;
  private finished = false;
  /** Идёт обучение: игровой ввод и выход заблокированы. */
  private tutorialActive = false;

  // Вью.
  private cellRects: Phaser.GameObjects.Rectangle[] = [];
  private cellTexts: Phaser.GameObjects.Text[] = [];
  private selectionRing!: Phaser.GameObjects.Rectangle;
  private hintButton!: Button;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private timer!: RoundTimer;

  // Геометрия доски (нужна и смоук-тесту через __sudoku).
  private boardLeft = 0;
  private boardTop = 0;
  private cellSize = 0;
  private keyCenters: { v: number; x: number; y: number }[] = []; // v=0 — ластик
  private keypadRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.cellRects = [];
    this.cellTexts = [];
    this.keyCenters = [];
    this.selected = null;
    this.hintsLeft = MAX_HINTS;
    this.finished = false;
    this.tutorialActive = false;
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
    this.mistakes = 0;
    this.session = this.registry.get('session') as Session;

    // «Как играть» из паузы: обучение на настоящей сетке, без сессии, таймера и ввода.
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
      // Приложение вернулось, но шит паузы открыт — таймер ждёт «Продолжить».
      else if (e.type === 'RESUME' && !this.pause?.open) this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
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

  /** Уровень не пройден: набрали лимит ошибок или кончилось время. */
  private failRound(cause: 'mistakes' | 'time') {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.timer?.pause();
    toast(this, 200, 640, t(this.locale, `game.fail.${cause}`));
    shakeCamera(this, 260, 0.012);
    this.time.delayedCall(1100, () => this.endGame(false));
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  /** Генерирует паззл текущего уровня. */
  private buildPuzzle() {
    const spec = this.params;
    this.size = spec.size;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    const { puzzle, solution } = makePuzzle(spec.size, spec.clues, mulberry32(seed));
    this.grid = puzzle.slice();
    this.solution = solution;
    this.given = puzzle.map((v) => v !== 0);
  }

  /** Собирает весь экран партии: HUD, доска, цифровая панель, подсказка. */
  private buildScreen() {
    this.buildHud();
    this.buildBoard();
    this.buildKeypad();
    this.buildHintButton();
    this.refresh();
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из паузы: настоящая сетка 4×4 с данными, но без партии; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    // На 4×4 правила нагляднее — обучение всегда идёт на первом уровне лестницы.
    this.level = 1;
    this.daily = false;
    this.params = levelAt(1).params;
    this.buildPuzzle();
    this.buildScreen();
    this.timer = createRoundTimer(() => performance.now()); // не стартует: на экране 00:00
    this.time.delayedCall(360, () =>
      this.launchOnboarding(() => {
        setOnboarded();
        this.scene.start('MainMenu');
      }),
    );
  }

  /** Первая партия — показываем обучение один раз: таймер на паузе, ввод заблокирован. */
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
    const demoCell = this.grid.indexOf(0); // верхняя-левая пустая клетка
    const prevValue = demoCell >= 0 ? this.grid[demoCell] : 0;
    const prevSelected = this.selected;
    startOnboarding(this, this.locale, this.onboardingTargets(demoCell), {
      select: () => {
        if (demoCell < 0) return;
        this.selected = demoCell;
        this.refresh();
      },
      fill: () => {
        if (demoCell < 0) return;
        this.grid[demoCell] = this.solution[demoCell];
        this.refresh();
        this.pulseCell(demoCell);
      },
      reset: () => {
        // Сетку игрока возвращаем как была: обучение не даёт форы.
        if (demoCell >= 0) this.grid[demoCell] = prevValue;
        this.selected = prevSelected;
        this.refresh();
      },
    }, onDone);
  }

  /** Настоящие зоны экрана для подсветки: доска, строка, блок, клетка, панель, подсказка. */
  private onboardingTargets(demoCell: number): OnboardingTargets {
    const n = this.size;
    const cell = this.cellSize;
    const board: Rect = { x: this.boardLeft, y: this.boardTop, w: n * cell, h: n * cell };

    // Строка и блок с наибольшим числом данных — на них правило видно лучше всего.
    const { rows: bRows, cols: bCols } = blockDims(n);
    const rowScore = (r: number) => this.given.slice(r * n, r * n + n).filter(Boolean).length;
    let bestRow = 0;
    for (let r = 1; r < n; r++) if (rowScore(r) > rowScore(bestRow)) bestRow = r;

    let bestBlock = { r0: 0, c0: 0, score: -1 };
    for (let r0 = 0; r0 < n; r0 += bRows) {
      for (let c0 = 0; c0 < n; c0 += bCols) {
        let score = 0;
        for (let r = r0; r < r0 + bRows; r++) {
          for (let c = c0; c < c0 + bCols; c++) if (this.given[r * n + c]) score++;
        }
        if (score > bestBlock.score) bestBlock = { r0, c0, score };
      }
    }

    const idx = demoCell >= 0 ? demoCell : 0;
    return {
      board,
      row: { x: this.boardLeft, y: this.boardTop + bestRow * cell, w: n * cell, h: cell },
      block: {
        x: this.boardLeft + bestBlock.c0 * cell,
        y: this.boardTop + bestBlock.r0 * cell,
        w: bCols * cell,
        h: bRows * cell,
      },
      cell: {
        x: this.boardLeft + (idx % n) * cell,
        y: this.boardTop + Math.floor(idx / n) * cell,
        w: cell,
        h: cell,
      },
      keypad: this.keypadRect,
      hint: this.hintRect,
    };
  }

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» и чипы ошибок (если у уровня
   * лимит) и таймера. Раньше здесь были белая пилюля «Назад» и текстовый HUD,
   * а тап по «Назад» посреди уровня на время сразу терял партию.
   * «Подсказки: N» — кнопка под цифровой панелью, в шапку не переезжает.
   */
  private buildHud() {
    const limit = this.params.mistakeLimit;
    this.header = makeGameHeader(this, {
      title: this.daily ? t(this.locale, 'game.dailyLevel') : t(this.locale, 'game.level', { n: this.level }),
      chips: [
        ...(limit ? [{ id: 'mistakes', text: this.mistakesLabel(), widest: `× ${limit} / ${limit}` }] : []),
        { id: 'time', text: formatClock(this.params.timeLimitSec), widest: '88:88' },
      ],
      onBack: () => this.openPause(),
    });
  }

  /** Ошибки в чипе: «сделано / лимит». */
  private mistakesLabel(): string {
    // «×» — что это ошибки, видно без подписи: как чип ошибок в «Викторине».
    return `× ${this.mistakes} / ${this.params.mistakeLimit}`;
  }

  /** Стрелка в шапке: пауза с выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    // В обучении ставить на паузу нечего — стрелка просто возвращает в меню.
    if (this.tutorialActive) {
      this.exitToMenu();
      return;
    }
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => { this.pause = null; this.timer?.resume(); },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /**
   * «Таймер остановлен · ошибки 1 / 3 · осталось 0:09». Таймер стоит на любом
   * уровне: время решает звёзды, даже когда лимита нет.
   */
  private pauseSummary(): string {
    const limit = this.params.timeLimitSec;
    const parts = [uiText(this.locale, 'pause.timerStopped')];
    if (this.params.mistakeLimit) parts.push(t(this.locale, 'pause.mistakes', { mistakes: this.mistakesLabel() }));
    parts.push(limit
      ? uiText(this.locale, 'pause.left', { t: formatClock(this.clockSec()) })
      : t(this.locale, 'pause.time', { t: formatClock(this.clockSec()) }));
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

  // ── Доска ────────────────────────────────────────────────────────────────────

  private buildBoard() {
    const n = this.size;
    // ≥52px на 4×4, ≥44px на 6×6.
    this.cellSize = n === 4 ? 72 : 56;
    const board = n * this.cellSize;
    this.boardLeft = (W - board) / 2;
    // Центр зоны GRID_TOP..PAD_TOP-24.
    this.boardTop = GRID_TOP + (PAD_TOP - 24 - GRID_TOP - board) / 2;

    // Клетки (фон + текст).
    for (let i = 0; i < n * n; i++) {
      const cx = this.boardLeft + (i % n) * this.cellSize + this.cellSize / 2;
      const cy = this.boardTop + Math.floor(i / n) * this.cellSize + this.cellSize / 2;
      const rect = this.add
        .rectangle(cx, cy, this.cellSize, this.cellSize, COLORS.panel)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerup', () => this.onCellTap(i));
      this.cellRects.push(rect);
      const text = this.add
        .text(cx, cy, '', { fontFamily: FONT, fontSize: Math.round(this.cellSize * 0.5), color: COLORS.headText })
        .setOrigin(0.5)
        .setResolution(DPR);
      this.cellTexts.push(text);
    }

    // Линии: тонкие между клетками, жирные — границы блоков 2×2 / 2(строки)×3(столбца).
    const bRows = 2;
    const bCols = n === 4 ? 2 : 3;
    const g = this.add.graphics();
    g.lineStyle(1, COLORS.gridLine, 1);
    for (let i = 1; i < n; i++) {
      g.lineBetween(this.boardLeft + i * this.cellSize, this.boardTop, this.boardLeft + i * this.cellSize, this.boardTop + board);
      g.lineBetween(this.boardLeft, this.boardTop + i * this.cellSize, this.boardLeft + board, this.boardTop + i * this.cellSize);
    }
    g.lineStyle(3, COLORS.blockLine, 1);
    for (let i = 0; i <= n; i += bCols) {
      g.lineBetween(this.boardLeft + i * this.cellSize, this.boardTop, this.boardLeft + i * this.cellSize, this.boardTop + board);
    }
    for (let i = 0; i <= n; i += bRows) {
      g.lineBetween(this.boardLeft, this.boardTop + i * this.cellSize, this.boardLeft + board, this.boardTop + i * this.cellSize);
    }

    // Кольцо выделения — поверх линий.
    this.selectionRing = this.add
      .rectangle(0, 0, this.cellSize, this.cellSize)
      .setStrokeStyle(3, COLORS.primary)
      .setVisible(false)
      .setDepth(10);
  }

  // ── Цифровая панель (стиль клавиш soz) + ластик ──────────────────────────────

  private buildKeypad() {
    const n = this.size;
    const count = n + 1; // цифры 1..N + ластик
    const avail = W - 28;
    const kw = Math.floor((avail - (count - 1) * KEY_GAP) / count);
    const totalW = kw * count + KEY_GAP * (count - 1);
    let x = (W - totalW) / 2;
    const cy = PAD_TOP + KEY_H / 2;
    this.keypadRect = { x, y: PAD_TOP, w: totalW, h: KEY_H };
    for (let v = 1; v <= count; v++) {
      const digit = v <= n ? v : 0; // последняя клавиша — ластик
      const cx = x + kw / 2;
      makeKeyCap(this, cx, cy, kw, KEY_H, digit === 0 ? '' : String(digit),
        () => (digit === 0 ? this.onErase() : this.onDigit(digit)), { fontSize: 22, radius: 10 });
      if (digit === 0) this.drawEraserIcon(cx, cy);
      this.keyCenters.push({ v: digit, x: cx, y: cy });
      x += kw + KEY_GAP;
    }
  }

  /** Векторная иконка ластика (backspace-стрелка) — символ ⌫ не входит в сабсет шрифта. */
  private drawEraserIcon(cx: number, cy: number) {
    const g = this.add.graphics();
    g.lineStyle(2.5, COLORS.iconDark, 1);
    g.beginPath();
    g.moveTo(cx + 9, cy);
    g.lineTo(cx - 7, cy);
    g.moveTo(cx - 7, cy);
    g.lineTo(cx - 1, cy - 6);
    g.moveTo(cx - 7, cy);
    g.lineTo(cx - 1, cy + 6);
    g.strokePath();
  }

  private buildHintButton() {
    const w = 232, h = 48, lip = 6;
    this.hintButton = makeButton(this, W / 2, HINT_Y, this.hintLabel(), () => this.useHint(), { width: w, height: h });
    this.hintRect = { x: (W - w) / 2, y: HINT_Y - h / 2 - lip, w, h: h + lip };
  }

  private hintLabel(): string {
    return t(this.locale, 'game.hints', { n: this.hintsLeft });
  }

  // ── Взаимодействие ───────────────────────────────────────────────────────────

  private onCellTap(i: number) {
    if (this.finished || this.tutorialActive || this.given[i]) return; // данные не выделяем
    this.selected = i;
    this.refresh();
  }

  private onDigit(v: number) {
    if (this.finished || this.tutorialActive || this.selected === null || this.given[this.selected]) return;
    const cell = this.selected;
    const wrong = v !== this.solution[cell];
    playSound(wrong ? 'wrong' : 'ok');
    this.grid[cell] = v;
    this.refresh();

    if (wrong && this.params.mistakeLimit) {
      this.mistakes++;
      this.header?.setChip('mistakes', this.mistakesLabel());
      if (this.mistakes >= this.params.mistakeLimit) {
        this.failRound('mistakes');
        return;
      }
    }
    this.checkWin();
  }

  private onErase() {
    if (this.finished || this.tutorialActive || this.selected === null || this.given[this.selected]) return;
    this.grid[this.selected] = 0;
    this.refresh();
  }

  /** Подсказка: правильная цифра в выделенную клетку (или случайную пустую). Максимум 3. */
  private useHint() {
    if (this.finished || this.tutorialActive || this.hintsLeft <= 0) return;
    let target = this.selected !== null && !this.given[this.selected] ? this.selected : -1;
    if (target === -1) {
      const empty = this.grid.map((v, i) => (v === 0 ? i : -1)).filter((i) => i !== -1);
      if (!empty.length) return;
      target = empty[Math.floor(Math.random() * empty.length)];
    }
    if (this.grid[target] === this.solution[target]) return; // уже верно — не жжём подсказку
    this.hintsLeft--;
    this.grid[target] = this.solution[target];
    this.selected = target;
    this.hintButton.setLabel(this.hintLabel());
    if (this.hintsLeft === 0) this.hintButton.root.setAlpha(0.55);
    this.pulseCell(target);
    this.refresh();
    this.checkWin();
  }

  /** Мягкий пульс клетки (подсказка вписала цифру). */
  private pulseCell(i: number) {
    this.tweens.add({ targets: this.cellTexts[i], scale: { from: 1.35, to: 1 }, duration: 240, ease: 'Quad.easeOut' });
  }

  // ── Отрисовка состояния ──────────────────────────────────────────────────────

  private refresh() {
    const n = this.size;
    const bad = new Set(conflicts(this.grid));
    const selRow = this.selected === null ? -1 : Math.floor(this.selected / n);
    const selCol = this.selected === null ? -1 : this.selected % n;

    for (let i = 0; i < n * n; i++) {
      const row = Math.floor(i / n);
      const col = i % n;
      let bg = this.given[i] ? COLORS.givenBg : COLORS.panel;
      if (this.selected !== null && (row === selRow || col === selCol)) bg = COLORS.lineHintBg;
      if (i === this.selected) bg = COLORS.selectedBg;
      if (bad.has(i)) bg = COLORS.conflictBg; // конфликт — мягкий красный, поверх остального
      this.cellRects[i].setFillStyle(bg);

      const v = this.grid[i];
      const text = this.cellTexts[i];
      text.setText(v === 0 ? '' : String(v));
      if (this.given[i]) {
        text.setColor(COLORS.givenText).setFontStyle('bold');
      } else {
        text.setColor(bad.has(i) ? COLORS.conflictText : COLORS.inputText).setFontStyle('normal');
      }
    }

    if (this.selected !== null) {
      this.selectionRing
        .setPosition(
          this.boardLeft + selCol * this.cellSize + this.cellSize / 2,
          this.boardTop + selRow * this.cellSize + this.cellSize / 2,
        )
        .setVisible(true);
    } else {
      this.selectionRing.setVisible(false);
    }
  }

  // ── Победа ───────────────────────────────────────────────────────────────────

  private checkWin() {
    if (this.finished) return;
    if (!isComplete(this.grid) || conflicts(this.grid).length > 0) return;
    this.finished = true;
    this.selected = null;
    this.refresh();
    // Волна радости по клеткам перед переходом.
    for (let i = 0; i < this.cellTexts.length; i++) {
      this.tweens.add({
        targets: this.cellTexts[i], scale: 1.2, duration: 140, yoyo: true,
        delay: (Math.floor(i / this.size) + (i % this.size)) * 28, ease: 'Quad.easeOut',
      });
    }
    this.time.delayedCall(650, () => this.endGame(true));
  }

  private endGame(cleared: boolean) {
    const durationMs = Math.round(this.timer.elapsedMs());
    const hints = MAX_HINTS - this.hintsLeft;

    void this.session
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', hints, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, locale: this.locale, hints, durationMs, mistakes: this.mistakes, cleared,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}

/** «0:09», «1:50» — часы в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
