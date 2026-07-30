import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  LEVELS, blockDims, makePuzzle, conflicts, isComplete, type Grid, type LevelId,
} from '../../core/sudoku';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera, type Button, makeButton } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { startOnboarding, type OnboardingTargets, type Rect } from '../onboarding';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;
const GRID_TOP = 92;
const PAD_TOP = 470;   // верх цифровой панели
const KEY_H = 54;
const KEY_GAP = 8;
const HINT_Y = 596;    // центр кнопки-подсказки
const MAX_HINTS = 3;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level: LevelId = 'easy4';
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
  private timeText!: Phaser.GameObjects.Text;
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

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as LevelId) ?? 'easy4';
    this.session = this.registry.get('session') as Session;

    // «Как играть» из меню: обучение на настоящей сетке, без сессии, таймера и ввода.
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

  update() {
    if (this.timeText && this.timer && !this.finished) {
      const sec = Math.floor(this.timer.elapsedMs() / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      this.timeText.setText(`${mm}:${ss}`);
    }
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  /** Генерирует паззл текущего уровня. */
  private buildPuzzle() {
    const spec = LEVELS[this.level];
    this.size = spec.size;
    const { puzzle, solution } = makePuzzle(spec.size, spec.clues, mulberry32(Math.floor(Math.random() * 2 ** 31)));
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

  /** «Как играть» из меню: настоящая сетка 4×4 с данными, но без партии; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.level = 'easy4'; // на 4×4 правила нагляднее
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

  // ── HUD: кнопка назад + таймер ───────────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.timeText = this.add
      .text(W - 20, 34, '00:00', { fontFamily: FONT, fontSize: 16, color: COLORS.headMuted })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
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
    if (this.finished || this.tutorialActive) return;
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
      this.add.rectangle(cx, cy + 3, kw, KEY_H, 0x000000, 0.12).setOrigin(0.5); // нижний бортик (тень)
      const rect = this.add
        .rectangle(cx, cy, kw, KEY_H, COLORS.keyDefault)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.tweens.add({ targets: rect, scale: 0.9, duration: 60, yoyo: true, ease: 'Quad.easeOut' }));
      rect.on('pointerup', () => (digit === 0 ? this.onErase() : this.onDigit(digit)));
      if (digit === 0) {
        this.drawEraserIcon(cx, cy);
      } else {
        this.add
          .text(cx, cy, String(digit), { fontFamily: FONT, fontSize: 22, color: COLORS.keyText, fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(DPR);
      }
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
    this.grid[this.selected] = v;
    this.refresh();
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
    this.time.delayedCall(650, () => this.endGame());
  }

  private endGame() {
    const durationMs = Math.round(this.timer.elapsedMs());
    const hints = MAX_HINTS - this.hintsLeft;

    void this.session
      .finish({ level: this.level, hints, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, locale: this.locale, hints, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
