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
  /** Обучение в один шаг: первая верная цифра — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

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
  private keyW = 0;

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
    this.mistakes = 0;
    this.session = this.registry.get('session') as Session;

    this.buildPuzzle();
    this.buildScreen();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      // Приложение вернулось, но шит паузы открыт — таймер ждёт «Продолжить».
      // В обучении часы стоят до первой верной цифры.
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer.resume();
    });
    this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
    else this.announceLimits();
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
    if (this.finished || this.tutorial?.active) return;
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

  /**
   * Обучение в один шаг: поле видно, пустая клетка уже выбрана, она и нужная
   * цифра внизу обведены и пульсируют. Нажать цифру — настоящий ход; таймер и
   * чипы включаются после первой верной цифры. Правило «цифры не повторяются»
   * объясняется в момент первой ошибки, лимиты — после обучения.
   */
  private startTutorial() {
    const cell = this.pickTutorialCell();
    if (cell < 0) return;
    this.timer.pause();
    this.header?.setChipsVisible(false);
    // Клетка уже выбрана — малышу остаётся одно действие: нажать цифру.
    this.selected = cell;
    this.refresh();
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      targets: () => this.tutorialTargets(),
      pad: 3,
      radius: 10,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer.resume();
        this.announceLimits();
      },
    });
  }

  /**
   * Пустая клетка, которую проще всего угадать: больше всего данных цифр в её
   * строке, столбце и блоке. При равенстве — верхняя левая.
   */
  private pickTutorialCell(): number {
    const n = this.size;
    const { rows: bRows, cols: bCols } = blockDims(n);
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n * n; i++) {
      if (this.grid[i] !== 0) continue;
      const r = Math.floor(i / n), c = i % n;
      const r0 = r - (r % bRows), c0 = c - (c % bCols);
      const seen = new Set<number>();
      for (let k = 0; k < n; k++) {
        if (this.grid[r * n + k]) seen.add(this.grid[r * n + k]);
        if (this.grid[k * n + c]) seen.add(this.grid[k * n + c]);
      }
      for (let y = r0; y < r0 + bRows; y++) {
        for (let x = c0; x < c0 + bCols; x++) if (this.grid[y * n + x]) seen.add(this.grid[y * n + x]);
      }
      if (seen.size > bestScore) { bestScore = seen.size; best = i; }
    }
    return best;
  }

  /**
   * Подсветка идёт за выбором: выбранная пустая клетка и её верная цифра.
   * Малыш ткнул в другую клетку — рамки переезжают туда же.
   */
  private tutorialTargets(): Rect[] {
    const i = this.selected;
    if (i === null || this.given[i]) return [];
    const n = this.size;
    const cellRect: Rect = {
      x: this.boardLeft + (i % n) * this.cellSize,
      y: this.boardTop + Math.floor(i / n) * this.cellSize,
      w: this.cellSize,
      h: this.cellSize,
    };
    const key = this.keyCenters.find((k) => k.v === this.solution[i]);
    if (!key) return [cellRect];
    return [cellRect, { x: key.x - this.keyW / 2, y: key.y - KEY_H / 2, w: this.keyW, h: KEY_H }];
  }

  /** Лимиты уровня — одной строкой в начале первого уровня, где они появились. */
  private announceLimits() {
    if (this.params.timeLimitSec) {
      showRuleOnce(this, 'sudoku-kids:timer', t(this.locale, 'rule.timer'));
    } else if (this.params.mistakeLimit) {
      showRuleOnce(this, 'sudoku-kids:mistakeLimit', t(this.locale, 'rule.mistakeLimit', { n: this.params.mistakeLimit }));
    }
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
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении часы стоят до первой верной цифры — «Продолжить» их не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer?.resume(); },
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
    this.keyW = kw;
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
    const w = 232, h = 48;
    this.hintButton = makeButton(this, W / 2, HINT_Y, this.hintLabel(), () => this.useHint(), { width: w, height: h });
  }

  private hintLabel(): string {
    return t(this.locale, 'game.hints', { n: this.hintsLeft });
  }

  // ── Взаимодействие ───────────────────────────────────────────────────────────

  private onCellTap(i: number) {
    if (this.finished || this.given[i]) return; // данные не выделяем
    this.selected = i;
    this.refresh();
    this.tutorial?.refresh();
  }

  private onDigit(v: number) {
    if (this.finished || this.selected === null || this.given[this.selected]) return;
    const cell = this.selected;
    const wrong = v !== this.solution[cell];
    playSound(wrong ? 'wrong' : 'ok');
    this.grid[cell] = v;
    this.refresh();

    if (wrong) {
      // Правило — в момент первой ошибки, а не карточкой заранее.
      // Правило уже знакомо, а у уровня лимит — напомнить про лимит (тоже один раз).
      const shown = showRuleOnce(this, 'sudoku-kids:mistake', t(this.locale, 'rule.mistake'));
      if (!shown && this.params.mistakeLimit) {
        showRuleOnce(this, 'sudoku-kids:mistakeLimit', t(this.locale, 'rule.mistakeLimit', { n: this.params.mistakeLimit }));
      }
    } else {
      // Первая верная цифра закрывает обучение: дальше обычная партия.
      this.tutorial?.done();
    }
    // Ошибка во время обучения не идёт в лимит: сначала научиться, потом считать.
    if (wrong && this.params.mistakeLimit && !this.tutorial?.active) {
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
    if (this.finished || this.selected === null || this.given[this.selected]) return;
    this.grid[this.selected] = 0;
    this.refresh();
  }

  /** Подсказка: правильная цифра в выделенную клетку (или случайную пустую). Максимум 3. */
  private useHint() {
    if (this.finished || this.hintsLeft <= 0) return;
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
    // Подсказка вписала верную цифру — это тоже удачный первый ход.
    this.tutorial?.done();
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

    // Докуда дошли — для итога проваленного уровня: верно заполненные клетки из пустых.
    const open = this.given.map((g, i) => (g ? -1 : i)).filter((i) => i !== -1);
    const filled = open.filter((i) => this.grid[i] === this.solution[i]).length;
    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, locale: this.locale, hints, durationMs, mistakes: this.mistakes, cleared,
      filled, toFill: open.length,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}

/** «0:09», «1:50» — часы в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
