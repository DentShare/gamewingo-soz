import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { buildDeck } from '../../core/deck';
import { levelAt, type PairsParams } from '../../core/levels';
import { createPairsGame, type PairsGame } from '../../core/game';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, darken, setupCamera, makeGlyph, type GlyphName, toast, shakeCamera,
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
const GRID_BOTTOM = 660;
const GAP = 10;

interface CardView {
  root: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private daily = false;
  private params!: PairsParams;
  private session!: Session;
  private core!: PairsGame;
  private cards: CardView[] = [];
  private cardCenters: Array<{ cx: number; cy: number }> = [];
  private cardSize = 0;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private timer?: RoundTimer;
  private locked = false;   // во время показа промаха
  private finished = false;
  /** Обучение в один шаг: первая пара — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.cards = [];
    this.cardCenters = [];
    this.locked = false;
    this.finished = false;
    this.tutorial = null;
    this.timer = undefined;
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

    this.buildRound();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      // Приложение вернулось на передний план, а наша пауза открыта — часы стоят до «Продолжить».
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer?.resume();
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

  /** Колода уровня + HUD + сетка карточек. */
  private buildRound() {
    const spec = this.params;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    const deck = buildDeck(spec.pairs, mulberry32(seed));
    this.core = createPairsGame(deck);
    this.buildHud();
    this.buildGrid(spec.cols, spec.rows);
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: поле видно, ближайшая пара обведена и пульсирует,
   * внизу одна фраза. Тап по ней — настоящий ход; таймер и ходы включаются
   * после первой найденной пары. Промах объясняется в момент промаха.
   */
  private startTutorial() {
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    const pair = this.pickMatchDemo();
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      note: t(this.locale, 'tutorial.note'),
      targets: () => pair.filter((i) => !this.core.isMatched(i)).map((i) => this.cardsRect([i])),
      pad: 6,
      radius: 14,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer?.resume();
        this.announceLimits();
      },
    });
  }

  /**
   * Лимиты уровня — одной строкой в начале первого уровня, где они появились.
   * Если на уровне оба, второе правило идёт после первого, а не теряется.
   */
  private announceLimits() {
    const shown = Boolean(this.params.moveLimit) && showRuleOnce(this, 'pairs:moveLimit', t(this.locale, 'rule.moveLimit'));
    if (!this.params.timeLimitSec) return;
    const timer = () => showRuleOnce(this, 'pairs:timer', t(this.locale, 'rule.timer'));
    if (shown) this.time.delayedCall(2500, timer);
    else timer();
  }

  /** Пара одинаковых карточек, лежащих ближе всего друг к другу (компактная подсветка). */
  private pickMatchDemo(): [number, number] {
    const deck = this.core.deck;
    let best: [number, number] = [0, 1];
    let bestDist = Infinity;
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        if (deck[i].symbol !== deck[j].symbol) continue;
        const d = this.dist(i, j);
        if (d < bestDist) { bestDist = d; best = [i, j]; }
      }
    }
    return best;
  }

  private dist(i: number, j: number): number {
    const a = this.cardCenters[i];
    const b = this.cardCenters[j];
    return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
  }

  /** Габарит нескольких карточек — зона подсветки в обучении. */
  private cardsRect(indices: number[]): Rect {
    const half = this.cardSize / 2;
    const xs = indices.map((i) => this.cardCenters[i].cx);
    const ys = indices.map((i) => this.cardCenters[i].cy);
    const x = Math.min(...xs) - half;
    const y = Math.min(...ys) - half;
    return { x, y, w: Math.max(...xs) + half - x, h: Math.max(...ys) + half - y };
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

  /** Ходы в чипе: с лимитом «сделано / всего», без лимита — просто счётчик. */
  private movesLabel(): string {
    const n = this.core?.moves ?? 0;
    return this.params.moveLimit ? `${n} / ${this.params.moveLimit}` : String(n);
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении часы стоят до первой пары — «Продолжить» их не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer?.resume(); },
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

  // ── Сетка карточек ───────────────────────────────────────────────────────────

  private buildGrid(cols: number, rows: number) {
    const size = Math.floor(Math.min(
      (W - 24 - (cols - 1) * GAP) / cols,
      (GRID_BOTTOM - GRID_TOP - (rows - 1) * GAP) / rows,
    ));
    const gridW = cols * size + (cols - 1) * GAP;
    const gridH = rows * size + (rows - 1) * GAP;
    const left = (W - gridW) / 2 + size / 2;
    const top = GRID_TOP + (GRID_BOTTOM - GRID_TOP - gridH) / 2 + size / 2;
    this.cardSize = size;

    for (let i = 0; i < this.core.deck.length; i++) {
      const cx = left + (i % cols) * (size + GAP);
      const cy = top + Math.floor(i / cols) * (size + GAP);
      this.cardCenters.push({ cx, cy });
      this.cards.push(this.buildCard(i, cx, cy, size));
    }
  }

  private buildCard(index: number, cx: number, cy: number, size: number): CardView {
    const r = Math.max(10, Math.round(size * 0.16));
    const root = this.add.container(cx, cy);

    // Рубашка: оранжевая с «?»
    const back = this.add.container(0, 0);
    const backG = this.add.graphics();
    backG.fillStyle(darken(COLORS.cardBack, 0.25), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, r);
    backG.fillStyle(COLORS.cardBack, 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    const mark = this.add
      .text(0, 0, '?', { fontFamily: FONT, fontSize: Math.round(size * 0.42), color: COLORS.cardBackMark, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setResolution(DPR);
    back.add([backG, mark]);

    // Лицо: белая карточка со значком (скрыто до переворота).
    const front = this.add.container(0, 0).setVisible(false);
    const frontG = this.add.graphics();
    frontG.fillStyle(0x000000, 0.08).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, r);
    frontG.fillStyle(COLORS.panel, 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    frontG.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, r);
    const symbol = makeGlyph(this, 0, 0, this.core.deck[index].symbol as GlyphName, Math.round(size * 0.52));
    front.add([frontG, symbol]);

    const hit = this.add.rectangle(0, 0, size, size, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.onCardTap(index));
    root.add([back, front, hit]);

    return { root, back, front };
  }

  // ── Логика взаимодействия ────────────────────────────────────────────────────

  private onCardTap(index: number) {
    if (this.finished || this.locked) return;
    const before = [...this.core.open];
    const result = this.core.flip(index);
    if (result === 'ignored') return;

    this.flipOpen(index);
    this.header?.setChip('moves', this.movesLabel());

    if (result === 'match' || result === 'won') {
      playSound('ok');
      // Первая пара закрывает обучение: дальше обычная партия с таймером и ходами.
      this.tutorial?.done();
      const pairIdx = before[0];
      this.time.delayedCall(170, () => {
        this.pulseMatch(pairIdx);
        this.pulseMatch(index);
      });
      if (result === 'won') {
        this.finished = true;
        this.time.delayedCall(650, () => this.endGame(true));
      }
    } else if (result === 'miss') {
      playSound('wrong');
      // Правило про промах — в момент первого промаха, а не карточкой заранее.
      showRuleOnce(this, 'pairs:miss', t(this.locale, 'rule.miss'));
      this.locked = true;
      const other = before[0];
      this.time.delayedCall(750, () => {
        this.core.closeMiss();
        this.flipClosed(index);
        this.flipClosed(other);
        this.locked = false;
        // Лимит проверяем после закрытия пары: игрок должен увидеть, чем закончился ход.
        if (this.params.moveLimit && this.core.moves >= this.params.moveLimit) this.failRound('moves');
      });
    }
  }

  /** Флип-анимация: сжать по X → показать лицо → раскрыть. */
  private flipOpen(i: number) {
    const c = this.cards[i];
    this.tweens.add({
      targets: c.root, scaleX: 0, duration: 90, ease: 'Quad.easeIn',
      onComplete: () => {
        c.back.setVisible(false);
        c.front.setVisible(true);
        this.tweens.add({ targets: c.root, scaleX: 1, duration: 90, ease: 'Quad.easeOut' });
      },
    });
  }

  private flipClosed(i: number) {
    const c = this.cards[i];
    this.tweens.add({
      targets: c.root, scaleX: 0, duration: 90, ease: 'Quad.easeIn',
      onComplete: () => {
        c.front.setVisible(false);
        c.back.setVisible(true);
        this.tweens.add({ targets: c.root, scaleX: 1, duration: 90, ease: 'Quad.easeOut' });
      },
    });
  }

  /** Найденная пара: зелёная вспышка + подпрыгивание. */
  private pulseMatch(i: number) {
    const c = this.cards[i];
    this.tweens.add({ targets: c.root, scale: 1.12, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    const glow = this.add
      .rectangle(c.root.x, c.root.y, 10, 10, COLORS.matchGlow, 0.35)
      .setOrigin(0.5)
      .setScale(6)
      .setDepth(5);
    this.tweens.add({ targets: glow, alpha: 0, scale: 9, duration: 380, onComplete: () => glow.destroy() });
  }

  /** Уровень не пройден: кончились ходы или время. Показываем причину и уходим на итог. */
  private failRound(cause: 'moves' | 'time') {
    if (this.finished) return;
    this.finished = true;
    this.timer?.pause();
    toast(this, 200, 620, t(this.locale, `game.fail.${cause}`));
    shakeCamera(this, 260, 0.012);
    this.time.delayedCall(1100, () => this.endGame(false));
  }

  private endGame(cleared: boolean) {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { moves, totalPairs, pairsFound } = this.core;

    void this.session
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', pairs: pairsFound, moves, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, locale: this.locale, pairs: totalPairs, pairsFound, moves, durationMs, cleared,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}

/** Габарит объекта сцены в координатах сцены (для подсветки в обучении). */
/** «0:09», «1:50» — часы в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
