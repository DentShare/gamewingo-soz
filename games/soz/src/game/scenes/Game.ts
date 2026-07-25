import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { WORD_LENGTH, MAX_GUESSES } from '../../core/locale';
import { tokenizeWord } from '../../core/tokenizer';
import { loadDictionary, type Dictionary } from '../../core/dictionary';
import { createGame, type Game as CoreGame } from '../../core/gameState';
import { pickDailyWord, dailyIndex } from '../../core/dailyWord';
import { saveDaily, loadDaily } from '../../core/persistence';
import { keyboardFor, ENTER, BACKSPACE, UZ_DIGRAPH_KEYS, type Key } from '../keyboards';
import { paletteFor, statusColor, COLORS, FONT, type Palette } from '../palette';
import { toast, applyTheme } from '../ui';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';

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
  private session!: Session;
  private dict!: Dictionary;
  private coreGame!: CoreGame;
  private answerWord = '';
  private palette!: Palette;

  private tiles: Tile[][] = [];
  private keyObjects = new Map<Key, { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }>();
  private rowContainers: Phaser.GameObjects.Container[] = [];
  private current: string[] = [];
  private timer!: RoundTimer;
  private finished = false;

  constructor() {
    super('Game');
  }

  create() {
    // Phaser переиспользует один экземпляр сцены между рестартами — сбрасываем изменяемое
    // состояние здесь (инициализаторы полей выполняются только при конструировании).
    this.finished = false;
    this.current = [];
    this.tiles = [];
    this.rowContainers = [];
    this.keyObjects = new Map();

    applyTheme(this);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.mode = (this.registry.get('mode') as 'daily' | 'practice') ?? 'daily';
    this.dayId = (this.registry.get('dayId') as number) ?? 0;
    this.session = this.registry.get('session') as Session;
    this.palette = paletteFor(!!this.registry.get('highContrast'));

    const { answers, allowed } = DATA[this.locale];
    this.dict = loadDictionary(this.locale, answers, allowed);

    this.answerWord =
      this.mode === 'daily' ? pickDailyWord(this.dict.answers, this.dayId) : this.randomPracticeWord();
    this.coreGame = createGame(tokenizeWord(this.answerWord, this.locale));

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

    // Восстановить сохранённые ряды (daily, партия в процессе).
    if (this.mode === 'daily') {
      const saved = loadDaily(this.locale, this.dayId);
      if (saved) {
        for (const row of saved.rows) {
          this.coreGame.submit(row.units);
          this.renderRow(this.coreGame.guessesUsed - 1);
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
    for (let r = 0; r < MAX_GUESSES; r++) {
      const container = this.add.container(0, 0);
      const rowTiles: Tile[] = [];
      for (let c = 0; c < WORD_LENGTH; c++) {
        const x = this.colCenterX(c);
        const y = this.rowCenterY(r);
        const rect = this.add.rectangle(x, y, TILE, TILE).setStrokeStyle(2, COLORS.emptyBorder);
        const text = this.add
          .text(x, y, '', { fontFamily: FONT, fontSize: 26, color: COLORS.tileText })
          .setOrigin(0.5);
        container.add([rect, text]);
        rowTiles.push({ rect, text });
      }
      this.rowContainers.push(container);
      this.tiles.push(rowTiles);
    }
  }

  private buildKeyboard() {
    const rows = keyboardFor(this.locale);
    let y = BOARD_Y + MAX_GUESSES * (TILE + GAP) + 24;
    const kh = 46;
    const kgap = 5;
    for (const row of rows) {
      const widths = row.map((k) => (k === ENTER || k === BACKSPACE ? 52 : 30));
      const totalW = widths.reduce((a, b) => a + b, 0) + kgap * (row.length - 1);
      let x = (400 - totalW) / 2;
      row.forEach((key, i) => {
        const w = widths[i];
        const cx = x + w / 2;
        const isDigraph = UZ_DIGRAPH_KEYS.has(key);
        const rect = this.add
          .rectangle(cx, y + kh / 2, w, kh, isDigraph ? 0x3a6d11 : COLORS.keyDefault)
          .setInteractive({ useHandCursor: true });
        rect.on('pointerup', () => this.onKey(key));

        if (key === ENTER || key === BACKSPACE) {
          // Символы ⏎/⌫ не входят в сабсет шрифта — рисуем векторные иконки (надёжно везде).
          this.drawSpecialKeyIcon(key, cx, y + kh / 2);
        } else {
          const text = this.add
            .text(cx, y + kh / 2, key, {
              fontFamily: FONT, fontSize: key.length > 1 ? 15 : 16,
              color: isDigraph ? '#ffffff' : COLORS.keyText,
            })
            .setOrigin(0.5);
          this.keyObjects.set(key, { rect, text });
        }
        x += w + kgap;
      });
      y += kh + kgap;
    }
  }

  /** Векторные иконки для Enter (галочка) и Backspace (стрелка влево). */
  private drawSpecialKeyIcon(key: Key, cx: number, cy: number) {
    const g = this.add.graphics();
    g.lineStyle(2.5, 0x111317, 1);
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
      if (e.key === 'Enter') this.onKey(ENTER);
      else if (e.key === 'Backspace') this.onKey(BACKSPACE);
      else if (e.key.length === 1) {
        const u = e.key.toLowerCase();
        if (this.keyObjects.has(u)) this.onKey(u);
      }
    });
  }

  private onKey(key: Key) {
    if (this.finished) return;
    if (key === ENTER) return this.onEnter();
    if (key === BACKSPACE) return this.onBackspace();
    if (this.current.length >= WORD_LENGTH) return;
    this.current.push(key);
    this.renderCurrent();
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
      this.shake(row);
      toast(this, 200, 640, t(this.locale, 'game.invalidWord'));
      return;
    }
    const word = this.current.join('');
    if (!this.dict.has(word)) {
      this.shake(row);
      toast(this, 200, 640, t(this.locale, 'game.notInList'));
      return;
    }
    this.coreGame.submit(this.current);
    this.renderRow(row);
    this.refreshKeyColors();
    this.current = [];

    if (this.coreGame.status !== 'in_progress') {
      this.endGame();
    }
  }

  private renderRow(row: number) {
    const r = this.coreGame.rows[row];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = this.tiles[row][c];
      tile.text.setText(r.units[c]);
      tile.text.setFontSize(r.units[c].length > 1 ? 20 : 26);
      tile.rect.setFillStyle(statusColor(r.statuses[c], this.palette));
      tile.rect.setStrokeStyle(0);
      this.tweens.add({ targets: tile.rect, scaleY: 0.85, yoyo: true, duration: 90, delay: c * 40 });
    }
  }

  private refreshKeyColors() {
    for (const [key, obj] of this.keyObjects) {
      const st = this.coreGame.letterStatus(key);
      if (st) {
        obj.rect.setFillStyle(statusColor(st, this.palette));
        obj.text.setColor('#ffffff');
      }
    }
  }

  private shake(row: number) {
    const c = this.rowContainers[row];
    this.tweens.add({ targets: c, x: 6, duration: 55, yoyo: true, repeat: 2, onComplete: () => { c.x = 0; } });
  }

  private endGame() {
    if (this.finished) return;
    this.finished = true;
    const solved = this.coreGame.status === 'won';
    const guessesUsed = this.coreGame.guessesUsed;
    const rows = this.coreGame.rows;

    if (this.mode === 'daily') {
      saveDaily(this.locale, this.dayId, { rows, status: this.coreGame.status, rewardClaimed: false });
    }

    void this.session
      .finish({
        mode: this.mode, dayId: this.dayId, locale: this.locale,
        guessesUsed, solved, durationMs: Math.round(this.timer.elapsedMs()), rows,
      })
      .then((res) => {
        this.registry.set('scorePreview', res?.pointsAwarded ?? null);
        this.time.delayedCall(1200, () => this.goToResult(solved, guessesUsed, rows, false));
      });
  }

  private goToResult(solved: boolean, guessesUsed: number, rows: CoreGame['rows'], rewardClaimed: boolean) {
    this.registry.set('lastGame', {
      mode: this.mode, locale: this.locale, dayId: this.dayId,
      solved, guessesUsed, answer: this.answerWord, rows, rewardClaimed,
    });
    this.scene.start('GameOver');
  }
}
