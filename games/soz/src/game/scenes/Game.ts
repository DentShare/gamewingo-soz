import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { WORD_LENGTH } from '../../core/locale';
import { levelAt, DAILY_PARAMS, type SozParams } from '../../core/levels';
import { tokenizeWord } from '../../core/tokenizer';
import { loadDictionary, type Dictionary } from '../../core/dictionary';
import { createGame, type Game as CoreGame } from '../../core/gameState';
import { pickDailyWord, dailyIndex } from '../../core/dailyWord';
import { saveDaily, loadDaily, hasOnboarded, setOnboarded } from '../../core/persistence';
import { keyboardFor, ENTER, BACKSPACE, UZ_DIGRAPH_KEYS, type Key } from '../keyboards';
import { paletteFor, statusColor, COLORS, FONT, HIGH_CONTRAST, type Palette } from '../palette';
import {
  toast, applyTheme, setupCamera, makeKeyCap, type KeyCap, playSound, makeGameHeader, openPauseSheet,
  setBackHandler, TOP_BAR_H, VIEW_BOTTOM, runFirstMoveTutorial, showRuleOnce,
  type FirstMoveTutorial, type Rect, type GameHeader, type PauseSheet,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import confetti from 'canvas-confetti';

import ansRu from '../../data/answers.ru.json';
import alwRu from '../../data/allowed.ru.json';
import ansUz from '../../data/answers.uz.json';
import alwUz from '../../data/allowed.uz.json';

const DATA: Record<Locale, { answers: string[]; allowed: string[] }> = {
  ru: { answers: ansRu, allowed: alwRu },
  uz: { answers: ansUz, allowed: alwUz },
};

const TILE = 54;
const GAP = 6;
const BOARD_W = WORD_LENGTH * TILE + (WORD_LENGTH - 1) * GAP;
const BOARD_X = (400 - BOARD_W) / 2;
const BOARD_Y = TOP_BAR_H + 16; // поле сразу под шапкой партии

interface Tile { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; }

export class Game extends Scene {
  private locale: Locale = 'ru';
  private mode: 'daily' | 'practice' = 'daily';
  private dayId = 0;
  private level = 1;
  private params: SozParams = DAILY_PARAMS;
  private session!: Session;
  private dict!: Dictionary;
  private coreGame!: CoreGame;
  private answerWord = '';
  private palette!: Palette;

  private tiles: Tile[][] = [];
  private keyObjects = new Map<Key, KeyCap>();
  private rowContainers: Phaser.GameObjects.Container[] = [];
  private current: string[] = [];
  private timer!: RoundTimer;
  private finished = false;
  /** Обучение в один шаг: первый отправленный ряд — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;

  /** Клавиатура целиком — цель обучения (заполняется при построении). */
  private keyboardBounds!: Rect;

  constructor() {
    super('Game');
  }

  create() {
    // Phaser переиспользует один экземпляр сцены между рестартами — сбрасываем изменяемое
    // состояние здесь (инициализаторы полей выполняются только при конструировании).
    this.finished = false;
    this.tutorial = null;
    this.current = [];
    this.tiles = [];
    this.rowContainers = [];
    this.keyObjects = new Map();
    this.header = undefined;
    this.pause = null;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.mode = (this.registry.get('mode') as 'daily' | 'practice') ?? 'daily';
    this.level = (this.registry.get('level') as number) ?? 1;
    // Слово дня играется по классическим правилам, тренировка — по правилам уровня.
    this.params = this.mode === 'daily' ? DAILY_PARAMS : levelAt(this.level).params;
    this.dayId = (this.registry.get('dayId') as number) ?? 0;
    this.session = this.registry.get('session') as Session;
    this.palette = paletteFor(!!this.registry.get('highContrast'));

    // «Как играть» из паузы — то же обучение на этой же партии (флаг одноразовый).
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);

    const { answers, allowed } = DATA[this.locale];
    this.dict = loadDictionary(this.locale, answers, allowed);

    this.answerWord =
      this.mode === 'daily' ? pickDailyWord(this.dict.answers, this.dayId) : this.randomPracticeWord();
    this.coreGame = createGame(tokenizeWord(this.answerWord, this.locale), {
      maxGuesses: this.params.guesses,
      strict: this.params.strict,
    });

    // Анти-реплей + восстановление для daily.
    if (this.mode === 'daily') {
      const saved = loadDaily(this.locale, this.dayId);
      if (saved && saved.status !== 'in_progress') {
        this.goToResult(saved.status === 'won', saved.rows.length, saved.rows, saved.rewardClaimed);
        return;
      }
    }

    this.buildBoard();
    this.buildKeyboard();
    this.buildHeader();

    // Восстановить сохранённые ряды (daily, партия в процессе).
    if (this.mode === 'daily') {
      const saved = loadDaily(this.locale, this.dayId);
      if (saved) {
        for (const row of saved.rows) {
          this.coreGame.submit(row.units);
          this.paintRowInstant(this.coreGame.guessesUsed - 1);
        }
        this.refreshKeyColors();
      }
    }
    this.syncAttempt();

    // Таймер + старт сессии.
    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      // Игрок сам поставил паузу — время стоит, пока он не нажмёт «Продолжить».
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.bindPhysicalKeyboard();
    if (howto || (!hasOnboarded() && this.coreGame.guessesUsed === 0)) this.startTutorial();
  }

  /**
   * Обучение в один шаг: поле видно, текущая строка и клавиатура обведены и
   * пульсируют, внизу одна фраза. Первый отправленный ряд — настоящий ход; чип
   * попытки и часы включаются после него. Что значат цвета — строкой в момент,
   * когда они впервые появились на плитках.
   */
  private startTutorial() {
    this.timer.pause();
    this.header?.setChipsVisible(false);
    const row = this.coreGame.guessesUsed;
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      targets: () => [this.rowRect(this.coreGame.guessesUsed), this.keyboardBounds],
      pad: 6,
      radius: 12,
      barTop: (h) => this.tutorialBarTop(h, row),
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer.resume();
      },
    });
  }

  /**
   * Полоса обучения живёт у нижнего края. На экранах 16:9 (логическая высота 720)
   * узбекская клавиатура в четыре ряда уходит под неё — и «галочка» перекрыта.
   * Тогда ставим полосу на пустые строки поля между текущей строкой и клавиатурой:
   * они всё равно приглушены.
   */
  private tutorialBarTop(h: number, row: number): number {
    const bottomTop = VIEW_BOTTOM - 16 - h - 8;
    const kb = this.keyboardBounds;
    if (kb.y + kb.h + 8 <= bottomTop) return bottomTop;
    const gapTop = this.rowCenterY(row) + TILE / 2 + 8;
    const gapBottom = kb.y - 8;
    return gapBottom - gapTop >= h
      ? (gapTop + gapBottom) / 2 - h / 2
      : this.rowCenterY(row) - TILE / 2 - 8 - h; // последняя строка — над ней
  }

  /** Строка поля в координатах сцены. */
  private rowRect(row: number): Rect {
    return { x: BOARD_X, y: this.rowCenterY(row) - TILE / 2, w: BOARD_W, h: TILE };
  }

  /** Подсказка: во время обучения — над вуалью (900), иначе на обычной глубине. */
  private say(message: string) {
    toast(this, 200, 640, message, this.tutorial?.active ? { depth: 960 } : {});
  }

  /**
   * Цвета плиток — одной строкой, когда они впервые появились. Под шапкой
   * плашка закрыла бы первую строку, которую объясняет, — ставим её под раскрытый ряд.
   */
  private explainColors(row: number) {
    const key = this.palette === HIGH_CONTRAST ? 'rule.colorsContrast' : 'rule.colors';
    showRuleOnce(this, 'soz:colors', t(this.locale, key), { y: this.rowCenterY(row) + TILE / 2 + 10 });
  }

  private randomPracticeWord(): string {
    const dailyIdx = dailyIndex(this.dayId, this.dict.answers.length);
    let idx = Math.floor(Math.random() * this.dict.answers.length);
    if (this.dict.answers.length > 1 && idx === dailyIdx) idx = (idx + 1) % this.dict.answers.length;
    return this.dict.answers[idx];
  }

  private colCenterX(col: number) { return BOARD_X + TILE / 2 + col * (TILE + GAP); }
  private rowCenterY(row: number) { return BOARD_Y + TILE / 2 + row * (TILE + GAP); }

  private buildBoard() {
    for (let r = 0; r < this.params.guesses; r++) {
      const container = this.add.container(0, 0);
      const rowTiles: Tile[] = [];
      for (let c = 0; c < WORD_LENGTH; c++) {
        const x = this.colCenterX(c);
        const y = this.rowCenterY(r);
        const shadow = this.add.rectangle(x, y + 3, TILE, TILE, 0x000000, 0.06).setOrigin(0.5);
        const rect = this.add.rectangle(x, y, TILE, TILE, COLORS.panel).setStrokeStyle(2, COLORS.emptyBorder);
        const text = this.add
          .text(x, y, '', { fontFamily: FONT, fontSize: 26, color: COLORS.tileTextDark })
          .setOrigin(0.5)
          .setResolution(DPR);
        container.add([shadow, rect, text]);
        rowTiles.push({ rect, text });
      }
      this.rowContainers.push(container);
      this.tiles.push(rowTiles);
    }
  }

  private buildKeyboard() {
    const rows = keyboardFor(this.locale);
    const kbTop = BOARD_Y + this.params.guesses * (TILE + GAP) + 24;
    let y = kbTop;
    const kh = 46;
    // Русский ряд из 12 клавиш не влезал в 400 логических пикселей — крайние «й» и «ъ»
    // срезались краем экрана. Считаем общий коэффициент по самому широкому ряду.
    const BASE_W = 30, SPEC_W = 52, BASE_GAP = 5, AVAIL = 388;
    const fit = rows.reduce((k, row) => {
      const total = row.reduce((a, key) => a + (key === ENTER || key === BACKSPACE ? SPEC_W : BASE_W), 0)
        + BASE_GAP * (row.length - 1);
      return Math.min(k, AVAIL / total);
    }, 1);
    const kgap = BASE_GAP * fit;
    let kbMinX = Infinity;
    let kbMaxX = -Infinity;
    let kbBottom = kbTop;
    for (const row of rows) {
      const widths = row.map((k) => (k === ENTER || k === BACKSPACE ? SPEC_W : BASE_W) * fit);
      const totalW = widths.reduce((a, b) => a + b, 0) + kgap * (row.length - 1);
      let x = (400 - totalW) / 2;
      row.forEach((key, i) => {
        const w = widths[i];
        const cx = x + w / 2;
        kbMinX = Math.min(kbMinX, cx - w / 2);
        kbMaxX = Math.max(kbMaxX, cx + w / 2);
        const isSpecial = key === ENTER || key === BACKSPACE;
        const cap = makeKeyCap(this, cx, y + kh / 2, w, kh, isSpecial ? '' : key, () => this.onKey(key), {
          fontSize: Math.round((key.length > 1 ? 15 : 16) * Math.min(1, fit + 0.05)),
          radius: 10,
        });
        if (UZ_DIGRAPH_KEYS.has(key)) cap.setFill(COLORS.digraphKey);

        if (isSpecial) {
          // Символы ⏎/⌫ не входят в сабсет шрифта — рисуем векторные иконки (надёжно везде).
          this.drawSpecialKeyIcon(key, cx, y + kh / 2);
        } else {
          this.keyObjects.set(key, cap);
        }
        x += w + kgap;
      });
      kbBottom = y + kh;
      y += kh + kgap;
    }
    this.keyboardBounds = { x: kbMinX, y: kbTop, w: kbMaxX - kbMinX, h: kbBottom - kbTop };
  }

  /** Векторные иконки для Enter (галочка) и Backspace (стрелка влево). */
  private drawSpecialKeyIcon(key: Key, cx: number, cy: number) {
    const g = this.add.graphics();
    g.lineStyle(2.5, COLORS.iconDark, 1);
    if (key === ENTER) {
      g.beginPath();
      g.moveTo(cx - 8, cy);
      g.lineTo(cx - 2, cy + 6);
      g.lineTo(cx + 9, cy - 6);
      g.strokePath();
    } else {
      // стрелка влево (backspace)
      g.beginPath();
      g.moveTo(cx + 9, cy);
      g.lineTo(cx - 7, cy);
      g.moveTo(cx - 7, cy);
      g.lineTo(cx - 1, cy - 6);
      g.moveTo(cx - 7, cy);
      g.lineTo(cx - 1, cy + 6);
      g.strokePath();
    }
  }

  private bindPhysicalKeyboard() {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      // Escape — та же стрелка: открыть паузу, повторный — продолжить.
      if (e.key === 'Escape') {
        if (this.pause?.open) {
          this.pause.close();
          this.resumeFromPause();
        } else this.openPause();
      } else if (this.pause?.open) return;
      else if (e.key === 'Enter') this.onKey(ENTER);
      else if (e.key === 'Backspace') this.onKey(BACKSPACE);
      else if (e.key.length === 1) {
        const u = e.key.toLowerCase();
        if (this.keyObjects.has(u)) this.onKey(u);
      }
    });
  }

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Слово дня» / «Уровень N» и чип попытки «3 / 6».
   * Раньше здесь были белая пилюля «Назад» и подпись режима справа.
   */
  private buildHeader() {
    this.header = makeGameHeader(this, {
      title: this.mode === 'daily' ? t(this.locale, 'menu.daily') : t(this.locale, 'game.level', { n: this.level }),
      chips: [
        { id: 'attempt', text: this.attemptLabel(), widest: `${this.params.guesses} / ${this.params.guesses}` },
      ],
      onBack: () => this.openPause(),
    });
  }

  /** Текущая попытка: «3 / 6»; после последней — «6 / 6», а не «7 / 6». */
  private attemptLabel(): string {
    const max = this.params.guesses;
    const used = this.coreGame?.guessesUsed ?? 0;
    return `${Math.min(max, used + 1)} / ${max}`;
  }

  private syncAttempt() {
    this.header?.setChip('attempt', this.attemptLabel());
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.timer?.pause();
    const daily = this.mode === 'daily';
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => this.resumeFromPause(),
      // Слово дня одно на день: «заново» ему не нужно (сыгранные ряды остаются), а выход
      // ничего не теряет — ряды сохраняются, поэтому и подпись выхода спокойная.
      kind: daily ? 'saved' : 'level',
      onRestart: daily ? undefined : () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        if (daily) this.saveDailyProgress();
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  private resumeFromPause() {
    this.pause = null;
    // В обучении часы стоят до первого ряда — «Продолжить» их не запускает.
    if (!this.tutorial?.active) this.timer?.resume();
  }

  /** «попытка 3 / 6» и для слова дня — что сыгранные ряды не пропадут. */
  private pauseSummary(): string {
    const parts = [t(this.locale, 'pause.attempt', { a: this.attemptLabel() })];
    if (this.mode === 'daily' && this.coreGame.guessesUsed > 0) parts.push(t(this.locale, 'pause.dailySaved'));
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

  /** Незавершённую партию слова дня сохраняем, чтобы прогресс не потерялся (и не переигрывался). */
  private saveDailyProgress() {
    if (this.mode !== 'daily' || !this.coreGame || this.coreGame.guessesUsed === 0) return;
    saveDaily(this.locale, this.dayId, {
      rows: this.coreGame.rows,
      status: this.coreGame.status,
      rewardClaimed: false,
    });
  }

  /** Выход в главное меню. */
  private exitToMenu() {
    if (this.finished) return;
    this.saveDailyProgress();
    this.finished = true; // блокируем ввод на время перехода
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  private onKey(key: Key) {
    if (this.finished || this.pause?.open) return;
    if (key === ENTER) return this.onEnter();
    if (key === BACKSPACE) return this.onBackspace();
    if (this.current.length >= WORD_LENGTH) return;
    this.current.push(key);
    this.renderCurrent();
    this.popTile(this.coreGame.guessesUsed, this.current.length - 1);
  }

  /** Лёгкий «отскок» плитки при наборе буквы. */
  private popTile(row: number, col: number) {
    const tile = this.tiles[row]?.[col];
    if (!tile) return;
    this.tweens.add({ targets: [tile.rect, tile.text], scale: 1.12, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  }

  private onBackspace() {
    if (!this.current.length) return;
    this.current.pop();
    this.renderCurrent();
  }

  private renderCurrent() {
    const row = this.coreGame.guessesUsed;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const unit = this.current[c] ?? '';
      const tile = this.tiles[row][c];
      tile.text.setText(unit);
      tile.text.setFontSize(unit.length > 1 ? 20 : 26);
      tile.rect.setStrokeStyle(2, unit ? COLORS.filledBorder : COLORS.emptyBorder);
    }
  }

  private onEnter() {
    const row = this.coreGame.guessesUsed;
    if (this.current.length < WORD_LENGTH) {
      playSound('wrong');
      this.shake(row);
      this.say(t(this.locale, 'game.invalidWord'));
      return;
    }
    const word = this.current.join('');
    if (!this.dict.has(word)) {
      playSound('wrong');
      this.shake(row);
      this.say(t(this.locale, 'game.notInList'));
      return;
    }
    const violation = this.coreGame.checkStrict(this.current);
    if (violation) {
      playSound('wrong');
      this.shake(row);
      const message = violation.kind === 'position'
        ? t(this.locale, 'game.strictPosition', { unit: violation.unit.toUpperCase(), n: violation.index + 1 })
        : t(this.locale, 'game.strictMissing', { unit: violation.unit.toUpperCase() });
      this.say(message);
      return;
    }
    playSound('ok');
    this.coreGame.submit(this.current);
    this.current = [];
    // Первый отправленный ряд и есть ход: вуаль уходит, раскрытие видно целиком.
    this.tutorial?.done();

    this.revealRow(row, () => {
      this.refreshKeyColors();
      this.explainColors(row);
      this.syncAttempt();
      const status = this.coreGame.status;
      if (status === 'won') {
        this.winBounce(row);
        this.celebrate();
      }
      if (status !== 'in_progress') {
        this.endGame(status === 'won');
      }
    });
  }

  /** Мгновенная покраска ряда без анимации (для восстановления сохранённой партии). */
  private paintRowInstant(row: number) {
    const r = this.coreGame.rows[row];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = this.tiles[row][c];
      tile.text.setText(r.units[c]);
      tile.text.setFontSize(r.units[c].length > 1 ? 20 : 26);
      tile.text.setColor(COLORS.tileTextLight);
      tile.rect.setFillStyle(statusColor(r.statuses[c], this.palette));
      tile.rect.setStrokeStyle(0);
    }
  }

  /** Флип-раскрытие ряда: плитки переворачиваются по очереди, цвет проявляется на середине флипа. */
  private revealRow(row: number, onComplete: () => void) {
    const r = this.coreGame.rows[row];
    let done = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      // На случай, если анимация была прервана — гарантируем финальный вид ряда.
      this.paintRowInstant(row);
      this.tiles[row].forEach((tile) => { tile.rect.scaleY = 1; tile.text.scaleY = 1; });
      onComplete();
    };
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = this.tiles[row][c];
      this.tweens.add({
        targets: [tile.rect, tile.text],
        scaleY: 0,
        duration: 130,
        delay: c * 180,
        ease: 'Quad.easeIn',
        onComplete: () => {
          tile.text.setText(r.units[c]);
          tile.text.setFontSize(r.units[c].length > 1 ? 20 : 26);
          tile.text.setColor(COLORS.tileTextLight);
          tile.rect.setFillStyle(statusColor(r.statuses[c], this.palette));
          tile.rect.setStrokeStyle(0);
          this.tweens.add({
            targets: [tile.rect, tile.text],
            scaleY: 1,
            duration: 130,
            ease: 'Quad.easeOut',
            onComplete: () => { done++; if (done === WORD_LENGTH) finish(); },
          });
        },
      });
    }
    // Фолбэк: гарантируем переход к результату, даже если твин-колбэк не сработал.
    this.time.delayedCall((WORD_LENGTH - 1) * 180 + 130 + 130 + 120, finish);
  }

  /** Победный отскок выигрышного ряда — плитки прыгают по очереди. */
  private winBounce(row: number) {
    this.tiles[row].forEach((tile, c) => {
      this.tweens.add({
        targets: [tile.rect, tile.text],
        y: '-=14',
        duration: 150,
        delay: 80 * c,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    });
  }

  /** Конфетти при победе (DOM-оверлей поверх canvas игры). */
  private celebrate() {
    const burst = (opts: confetti.Options) => confetti({ disableForReducedMotion: true, ...opts });
    burst({ particleCount: 90, spread: 65, origin: { y: 0.45 }, startVelocity: 38 });
    this.time.delayedCall(180, () => {
      burst({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
      burst({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
    });
  }

  private refreshKeyColors() {
    // На поздних уровнях подсветку отбирают: статусы букв приходится держать в голове.
    if (!this.params.keyboardHints) return;
    for (const [key, obj] of this.keyObjects) {
      const st = this.coreGame.letterStatus(key);
      if (st) {
        obj.setFill(statusColor(st, this.palette), '#ffffff');
      }
    }
  }

  private shake(row: number) {
    const c = this.rowContainers[row];
    this.tweens.add({ targets: c, x: 6, duration: 55, yoyo: true, repeat: 2, onComplete: () => { c.x = 0; } });
  }

  private endGame(solved: boolean) {
    if (this.finished) return;
    this.finished = true;
    const guessesUsed = this.coreGame.guessesUsed;
    const rows = this.coreGame.rows;

    if (this.mode === 'daily') {
      saveDaily(this.locale, this.dayId, { rows, status: this.coreGame.status, rewardClaimed: false });
    }

    // Победу показываем дольше (отскок + конфетти), проигрыш — быстрее.
    const holdMs = solved ? 2000 : 1100;

    void this.session
      .finish({
        mode: this.mode, dayId: this.dayId, locale: this.locale,
        guessesUsed, solved, durationMs: Math.round(this.timer.elapsedMs()), rows,
      })
      .then((res) => {
        this.registry.set('scorePreview', res?.pointsAwarded ?? null);
      });

    this.time.delayedCall(holdMs, () => this.goToResult(solved, guessesUsed, rows, false));
  }

  private goToResult(solved: boolean, guessesUsed: number, rows: CoreGame['rows'], rewardClaimed: boolean) {
    this.registry.set('lastGame', {
      mode: this.mode, level: this.level, locale: this.locale, dayId: this.dayId,
      solved, guessesUsed, answer: this.answerWord, rows, rewardClaimed,
    });
    this.cameras.main.fadeOut(220, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
