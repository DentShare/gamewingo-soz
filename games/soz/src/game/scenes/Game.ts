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
import { paletteFor, statusColor, COLORS, FONT, type Palette } from '../palette';
import { toast, applyTheme, setupCamera, makeBackButton, makeKeyCap, type KeyCap, playSound } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { startOnboarding, type Rect } from '../onboarding';
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
const BOARD_Y = 70;

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
  private tutorialActive = false;

  // Зоны для обучения (заполняются при построении доски/клавиатуры).
  private boardBounds!: Rect;
  private keyboardBounds!: Rect;
  private enterKeyBounds!: Rect;

  constructor() {
    super('Game');
  }

  create() {
    // Phaser переиспользует один экземпляр сцены между рестартами — сбрасываем изменяемое
    // состояние здесь (инициализаторы полей выполняются только при конструировании).
    this.finished = false;
    this.tutorialActive = false;
    this.current = [];
    this.tiles = [];
    this.rowContainers = [];
    this.keyObjects = new Map();

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

    // Режим «Как играть»: показываем обучение поверх пустого поля, по концу — в меню.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

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
    this.buildBackButton();

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

    // Таймер + старт сессии.
    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      else if (e.type === 'RESUME') this.timer.resume();
    });
    this.events.once('shutdown', off);

    this.bindPhysicalKeyboard();
    this.maybeShowOnboarding();
  }

  /** «Как играть» из меню: строим поле, показываем обучение, по завершении — обратно в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.buildBoard();
    this.buildKeyboard();
    this.buildBackButton();
    const back = () => {
      setOnboarded();
      this.scene.start('MainMenu');
    };
    this.time.delayedCall(360, () => {
      startOnboarding(
        this,
        this.locale,
        this.palette,
        { board: this.boardBounds, keyboard: this.keyboardBounds, enterKey: this.enterKeyBounds },
        back,
      );
    });
  }

  /** Первый запуск (свежая партия) — показываем обучение один раз. Таймер на паузе. */
  private maybeShowOnboarding() {
    if (this.finished || hasOnboarded() || this.coreGame.guessesUsed > 0) return;
    this.tutorialActive = true;
    this.timer.pause();
    // Даём кадру отрисоваться (и завершиться fade-in камеры), затем открываем оверлей.
    this.time.delayedCall(360, () => {
      startOnboarding(
        this,
        this.locale,
        this.palette,
        { board: this.boardBounds, keyboard: this.keyboardBounds, enterKey: this.enterKeyBounds },
        () => {
          setOnboarded();
          this.tutorialActive = false;
          this.timer.resume();
        },
      );
    });
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
    const boardH = this.params.guesses * (TILE + GAP) - GAP;
    this.boardBounds = { x: BOARD_X, y: BOARD_Y, w: BOARD_W, h: boardH };
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
          if (key === ENTER) this.enterKeyBounds = { x: cx - w / 2, y, w, h: kh };
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
      if (this.tutorialActive) return;
      if (e.key === 'Escape') this.goBack();
      else if (e.key === 'Enter') this.onKey(ENTER);
      else if (e.key === 'Backspace') this.onKey(BACKSPACE);
      else if (e.key.length === 1) {
        const u = e.key.toLowerCase();
        if (this.keyObjects.has(u)) this.onKey(u);
      }
    });
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню. */
  private buildBackButton() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());
    // Справа — что именно сейчас играется: слово дня или уровень тренировки.
    this.add
      .text(386, 34, this.mode === 'daily'
        ? t(this.locale, 'menu.daily')
        : t(this.locale, 'game.level', { n: this.level }), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted,
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
  }

  /** Выход в главное меню. Незавершённую партию слова дня сохраняем, чтобы прогресс не потерялся. */
  private goBack() {
    if (this.finished || this.tutorialActive) return;
    if (this.mode === 'daily' && this.coreGame.guessesUsed > 0) {
      saveDaily(this.locale, this.dayId, {
        rows: this.coreGame.rows,
        status: this.coreGame.status,
        rewardClaimed: false,
      });
    }
    this.finished = true; // блокируем ввод на время перехода
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  private onKey(key: Key) {
    if (this.finished || this.tutorialActive) return;
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
      toast(this, 200, 640, t(this.locale, 'game.invalidWord'));
      return;
    }
    const word = this.current.join('');
    if (!this.dict.has(word)) {
      playSound('wrong');
      this.shake(row);
      toast(this, 200, 640, t(this.locale, 'game.notInList'));
      return;
    }
    const violation = this.coreGame.checkStrict(this.current);
    if (violation) {
      playSound('wrong');
      this.shake(row);
      const message = violation.kind === 'position'
        ? t(this.locale, 'game.strictPosition', { unit: violation.unit.toUpperCase(), n: violation.index + 1 })
        : t(this.locale, 'game.strictMissing', { unit: violation.unit.toUpperCase() });
      toast(this, 200, 640, message);
      return;
    }
    playSound('ok');
    this.coreGame.submit(this.current);
    this.current = [];

    this.revealRow(row, () => {
      this.refreshKeyColors();
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
