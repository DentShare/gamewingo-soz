import { Scene, Math as PhaserMath } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createSortingGame, type Color, type Shape, type Mode, type SortingGame,
} from '../../core/sorting';
import { mulberry32 } from '../../core/rng';
import { levelAt } from '../../core/levels';
import { COLORS, FIGURE_COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, makeGlyph, playSound,
  makeGameHeader, openPauseSheet, setBackHandler, type GameHeader, type PauseSheet,
  runFirstMoveTutorial, showRuleOnce, motionAllowed, type FirstMoveTutorial, type Rect,
} from '../ui';
import { drawBin, drawFigure } from '../shapes';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;

/** Откуда ребёнок берёт фигурку. */
const SPAWN_X = 200;
const SPAWN_Y = 300;
const TRAY_R = 68;
/** Крупная фигурка — промахнуться пальцем сложно. */
const FIG_SIZE = 92;

/** Корзины: широкие, у нижнего края — удобно тянуть большим пальцем. */
const BIN_H = 140;
const BIN_TOP = 500;

/**
 * Корзины делят ширину поля поровну: три широких или четыре поуже.
 * Ширина и центры считаются от числа корзин, чтобы четвёртая не вылезала за экран.
 */
function binLayout(count: number): { w: number; xs: number[] } {
  const margin = 12;
  const gap = 10;
  const w = Math.floor((400 - margin * 2 - gap * (count - 1)) / count);
  const xs = Array.from({ length: count }, (_, i) => margin + w / 2 + i * (w + gap));
  return { w, xs };
}
/** Полоса, в которой бросок засчитывается за корзину (щедрая — игра для малышей). */
const DROP_TOP = BIN_TOP - 56;
const DROP_BOTTOM = BIN_TOP + BIN_H + 44;

/**
 * Обучение приглушает поле слоем на глубине 900. Фигурка в пальце и «палец»-подсказка
 * жеста в это время идут поверх него — иначе на пути от лотка к корзине они тускнеют.
 */
const TUTORIAL_TOP_DEPTH = 910;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private mode: Mode = 'color';
  private session?: Session;
  private core!: SortingGame;
  private level = 1;
  /** Уровень дня: параметры уровня лестницы, но расклад по зерну от даты. */
  private daily = false;
  /** Раскладка корзин текущего уровня: их три или четыре. */
  private binW = 0;
  private binXs: number[] = [];

  private bins: Phaser.GameObjects.Container[] = [];
  private item?: Phaser.GameObjects.Container;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private hintFx?: Phaser.GameObjects.Graphics;

  private timer?: RoundTimer;
  private finished = false;
  /** Обучение в один шаг: первая фигурка в своей корзине — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

  // Перетаскивание. Камера отмасштабирована в DPR раз, поэтому сырые pointer.x/y —
  // координаты ХОЛСТА: их обязательно переводим в мировые через getWorldPoint.
  private dragging = false;
  private dragOffX = 0;
  private dragOffY = 0;
  private worldBuf = new PhaserMath.Vector2();

  private demoTween?: Phaser.Tweens.Tween;
  private demoFinger?: Phaser.GameObjects.Container;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.bins = [];
    this.item = undefined;
    this.hintFx = undefined;
    this.demoTween = undefined;
    this.demoFinger = undefined;
    this.dragging = false;
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
    this.session = this.registry.get('session') as Session | undefined;

    this.buildRound();

    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      // Наша пауза открыта или идёт обучение — часы стоят до «Продолжить» / первой фигурки.
      else if (e.type === 'RESUME' && !this.pause?.open && !this.tutorial?.active) this.timer?.resume();
    });
    if (off) this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  private buildRound() {
    const { total, mode, bins } = levelAt(this.level).params;
    this.mode = mode;
    const layout = binLayout(bins);
    this.binW = layout.w;
    this.binXs = layout.xs;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    this.core = createSortingGame(mode, mulberry32(seed), { total, bins });
    this.buildHud();
    this.buildTray();
    this.buildDragHint();
    this.buildBins();
    this.spawnItem(false);
    this.installDragHandlers();
  }

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» / «Уровень дня» и чип
   * прогресса «3 из 8». Таймера и проигрыша у «Сортировки» нет — других чипов не нужно.
   * Под шапкой — подпись режима («по цвету» / «по форме»), она поле не задевает.
   */
  private buildHud() {
    const total = this.core.total;
    this.header = makeGameHeader(this, {
      // Детская игра: в шапке название, а не «Уровень N» — номер ребёнку ничего не говорит.
      title: t(this.locale, 'app.title'),
      chips: [
        {
          id: 'progress',
          text: this.progressLabel(),
          widest: t(this.locale, 'game.progress', { n: total, total }),
        },
      ],
      onBack: () => this.openPause(),
    });
    this.add
      .text(W / 2, 84, t(this.locale, this.mode === 'color' ? 'mode.color' : 'mode.shape'), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  private progressLabel(): string {
    return t(this.locale, 'game.progress', { n: this.core.placed, total: this.core.total });
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    // Фигурка в пальце на паузу не уезжает — возвращаем её в лоток.
    if (this.dragging) {
      this.dragging = false;
      this.returnItem();
    }
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      // В обучении часы стоят до первой фигурки — «Продолжить» их не запускает.
      onResume: () => { this.pause = null; if (!this.tutorial?.active) this.timer?.resume(); },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «разложено 3 из 8 · ошибок: 1» — таймера нет, поэтому про него ни слова. */
  private pauseSummary(): string {
    return [
      t(this.locale, 'pause.progress', { n: this.core.placed, total: this.core.total }),
      t(this.locale, 'pause.mistakes', { n: this.core.mistakes }),
    ].join(' · ');
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

  /** Светлая площадка, с которой берут фигурку. */
  private buildTray() {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(COLORS.tray, 0.8).fillCircle(SPAWN_X, SPAWN_Y, TRAY_R);
    g.lineStyle(3, COLORS.panelBorder, 1).strokeCircle(SPAWN_X, SPAWN_Y, TRAY_R);
  }

  /** Три бледные «галочки» вниз — молча подсказывают направление перетаскивания. */
  private buildDragHint() {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(6, COLORS.panelBorder, 1);
    for (let i = 0; i < 3; i++) {
      const y = 400 + i * 26;
      g.beginPath();
      g.moveTo(SPAWN_X - 16, y);
      g.lineTo(SPAWN_X, y + 12);
      g.lineTo(SPAWN_X + 16, y);
      g.strokePath();
    }
  }

  /**
   * Корзины внизу — три или четыре, по уровню. В режиме «по цвету» они окрашены
   * (форма нигде не подсказывает), в режиме «по форме» — нейтральные со значком формы.
   */
  private buildBins() {
    for (let i = 0; i < this.core.bins.length; i++) {
      const c = this.add.container(this.binXs[i], BIN_TOP + BIN_H).setDepth(5);
      const g = this.add.graphics();
      if (this.mode === 'color') {
        drawBin(g, this.binW, BIN_H, FIGURE_COLORS[this.core.bins[i] as Color]);
      } else {
        drawBin(g, this.binW, BIN_H, COLORS.binNeutral, true);
        drawFigure(g, this.core.bins[i] as Shape, Math.round(this.binW * 0.52), COLORS.binGlyph, 0, -BIN_H / 2 - 4);
      }
      c.add(g);
      this.bins.push(c);
    }
  }

  /** Лоток с фигуркой — первая цель обучения. */
  private trayRect(): Rect {
    return { x: SPAWN_X - TRAY_R, y: SPAWN_Y - TRAY_R, w: TRAY_R * 2, h: TRAY_R * 2 };
  }

  /** Корзина для текущей фигурки (−1, если фигурки нет). */
  private rightBin(): number {
    const cur = this.core.current;
    return cur ? this.core.bins.indexOf(this.core.featureOf(cur)) : -1;
  }

  private binRect(i: number): Rect {
    return { x: this.binXs[i] - this.binW / 2, y: BIN_TOP, w: this.binW, h: BIN_H };
  }

  // ── Фигурка и перетаскивание ─────────────────────────────────────────────────

  private spawnItem(animate: boolean) {
    const item = this.core.current;
    if (!item) return;
    const c = this.add.container(SPAWN_X, SPAWN_Y).setDepth(10);
    const g = this.add.graphics();
    // Белая подложка чуть больше фигурки — контраст на любом фоне.
    drawFigure(g, item.shape, FIG_SIZE + 10, COLORS.panel, 0, 0, 0.9);
    drawFigure(g, item.shape, FIG_SIZE, FIGURE_COLORS[item.color]);
    const hit = this.add
      .rectangle(0, 0, FIG_SIZE + 34, FIG_SIZE + 34, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onGrab(p));
    c.add([g, hit]);
    this.item = c;

    if (animate) {
      c.setScale(0);
      this.tweens.add({
        targets: c, scale: 1, duration: 280, ease: 'Back.easeOut',
        onComplete: () => this.idlePulse(),
      });
    } else {
      this.idlePulse();
    }
  }

  /** Мягкое «дыхание» фигурки — приглашение взять её пальцем. */
  private idlePulse() {
    if (!this.item) return;
    this.tweens.add({
      targets: this.item, scale: 1.06, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private installDragHandlers() {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onRelease());
    this.input.on('gameout', () => this.onRelease());
  }

  private onGrab(p: Phaser.Input.Pointer) {
    if (this.finished || this.dragging || !this.item) return;
    this.tweens.killTweensOf(this.item);
    // В обучении фигурка в пальце — поверх приглушения, «палец»-подсказка больше не нужен.
    const onTop = this.tutorial?.active === true;
    if (onTop) this.stopDragDemo();
    this.item.setScale(1.1).setDepth(onTop ? TUTORIAL_TOP_DEPTH : 20);
    // Камера зумлена в DPR раз → сырые pointer.x/y надо перевести в мировые координаты,
    // иначе фигурка «улетает» от пальца.
    const w = this.cameras.main.getWorldPoint(p.x, p.y, this.worldBuf);
    this.dragOffX = this.item.x - w.x;
    this.dragOffY = this.item.y - w.y;
    this.dragging = true;
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.dragging || !this.item) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y, this.worldBuf);
    this.item.setPosition(w.x + this.dragOffX, w.y + this.dragOffY);
  }

  private onRelease() {
    if (!this.dragging || !this.item) return;
    this.dragging = false;
    this.item.setScale(1);
    const bin = this.binAt(this.item.x, this.item.y);
    if (bin < 0) {
      // Отпустил мимо корзин — просто возвращаем, ничего не происходит.
      this.returnItem();
      return;
    }
    const res = this.core.drop(bin);
    playSound(res.correct ? 'ok' : 'wrong');
    if (res.correct) this.acceptItem(bin, res.done);
    else this.rejectItem(bin);
  }

  /** Ближайшая корзина под точкой (или −1, если бросок мимо). */
  private binAt(x: number, y: number): number {
    if (y < DROP_TOP || y > DROP_BOTTOM) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.binXs.length; i++) {
      const d = Math.abs(x - this.binXs[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= this.binW / 2 + 10 ? best : -1;
  }

  /** Верно: фигурка «всасывается» в корзину, та подпрыгивает, счёт +1. */
  private acceptItem(bin: number, done: boolean) {
    const flying = this.item!;
    this.item = undefined;
    this.tweens.killTweensOf(flying);
    flying.setDepth(6);
    this.tweens.add({
      targets: flying,
      x: this.binXs[bin], y: BIN_TOP + 30, scale: 0.3, alpha: 0.1,
      duration: 260, ease: 'Quad.easeIn',
      onComplete: () => flying.destroy(),
    });
    this.bounceBin(bin);
    this.flashBin(bin);
    this.clearHint();
    // Первая фигурка в своей корзине закрывает обучение: дальше обычная партия.
    this.tutorial?.done();
    this.header?.setChip('progress', this.progressLabel());
    this.header?.pulseChip('progress');

    if (done) {
      this.finished = true;
      this.time.delayedCall(760, () => this.endGame());
    } else {
      this.time.delayedCall(300, () => this.spawnItem(true));
    }
  }

  /** Неверно: не штраф, а подсказка — фигурка вернулась, правильная корзина подсвечена. */
  private rejectItem(bin: number) {
    this.wobbleBin(bin);
    // Правило про ошибку — в момент первой ошибки, а не карточкой заранее.
    showRuleOnce(this, 'sorting:mistake', t(this.locale, 'rule.mistake'));
    const right = this.core.bins.indexOf(this.core.featureOf(this.core.current!));
    if (right >= 0) this.showHint(right);
    this.returnItem();
  }

  private returnItem() {
    const c = this.item;
    if (!c) return;
    c.setDepth(10);
    this.tweens.add({
      targets: c, x: SPAWN_X, y: SPAWN_Y, scale: 1, duration: 320, ease: 'Back.easeOut',
      onComplete: () => {
        this.idlePulse();
        // Фигурка вернулась, а обучение ещё идёт — снова показываем жест.
        if (this.tutorial?.active) this.startDragDemo();
      },
    });
  }

  // ── Обратная связь корзин ────────────────────────────────────────────────────

  private bounceBin(i: number) {
    const bin = this.bins[i];
    this.tweens.add({
      targets: bin, scaleY: 1.14, scaleX: 0.94, y: BIN_TOP + BIN_H - 10,
      duration: 140, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => bin.setScale(1).setY(BIN_TOP + BIN_H),
    });
  }

  private flashBin(i: number) {
    const fx = this.add
      .circle(this.binXs[i], BIN_TOP + BIN_H / 2, 34, COLORS.correct, 0.45)
      .setDepth(7);
    this.tweens.add({
      targets: fx, alpha: 0, scale: 2.4, duration: 420, ease: 'Quad.easeOut',
      onComplete: () => fx.destroy(),
    });
  }

  private wobbleBin(i: number) {
    const bin = this.bins[i];
    this.tweens.add({
      targets: bin, angle: { from: -7, to: 7 }, duration: 100, yoyo: true, repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => bin.setAngle(0),
    });
  }

  /** Мягкая подсказка «вот сюда» — рамка вокруг правильной корзины на секунду. */
  private showHint(i: number) {
    this.clearHint();
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(5, COLORS.hint, 1)
      .strokeRoundedRect(this.binXs[i] - this.binW / 2 - 10, BIN_TOP - 8, this.binW + 20, BIN_H + 16, 20);
    this.hintFx = g;
    this.tweens.add({
      targets: g, alpha: 0.2, duration: 280, yoyo: true, repeat: 2,
      onComplete: () => { g.destroy(); if (this.hintFx === g) this.hintFx = undefined; },
    });
  }

  private clearHint() {
    if (!this.hintFx) return;
    this.tweens.killTweensOf(this.hintFx);
    this.hintFx.destroy();
    this.hintFx = undefined;
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: поле видно, обведены фигурка в лотке и её корзина,
   * «палец» показывает жест. Перетаскивание — настоящий ход; прогресс в шапке
   * и часы включаются после первой верно разложенной фигурки.
   */
  private startTutorial() {
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      // В режиме «по форме» фраза говорит про форму, а не про цвет.
      text: t(this.locale, this.mode === 'color' ? 'tutorial.firstMove' : 'tutorial.firstMoveShape'),
      targets: () => {
        const bin = this.rightBin();
        return bin >= 0 ? [this.trayRect(), this.binRect(bin)] : [this.trayRect()];
      },
      pad: 8,
      radius: 20,
      onDone: () => {
        setOnboarded();
        this.stopDragDemo();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer?.resume();
      },
    });
    this.startDragDemo();
  }

  /**
   * Подсказка жеста: «палец» едет от фигурки к её корзине и обратно поверх
   * приглушения. Саму фигурку не двигаем — её берёт ребёнок.
   */
  private startDragDemo() {
    this.stopDragDemo();
    const bin = this.rightBin();
    if (bin < 0) return;
    const tx = this.binXs[bin];
    const ty = BIN_TOP + 60;
    this.demoFinger = makeGlyph(this, SPAWN_X + 20, SPAWN_Y + 30, 'tap', 34)
      .setDepth(TUTORIAL_TOP_DEPTH + 1);
    // Без анимаций «палец» просто стоит на фигурке — путь показывают две рамки.
    if (!motionAllowed()) return;
    this.demoTween = this.tweens.add({
      targets: this.demoFinger, x: tx + 20, y: ty + 30,
      duration: 1000, ease: 'Sine.easeInOut', hold: 300, repeat: -1, repeatDelay: 300,
    });
  }

  private stopDragDemo() {
    this.demoTween?.remove();
    this.demoTween = undefined;
    this.demoFinger?.destroy();
    this.demoFinger = undefined;
  }

  // ── Финиш ────────────────────────────────────────────────────────────────────

  private endGame() {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { placed, mistakes } = this.core;

    void this.session
      ?.finish({
        level: this.level, mode: this.daily ? 'dailyLevel' : 'level', feature: this.mode, placed, mistakes, durationMs,
      })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, daily: this.daily, mode: this.mode, locale: this.locale, placed, mistakes, durationMs,
      total: this.core.total,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
