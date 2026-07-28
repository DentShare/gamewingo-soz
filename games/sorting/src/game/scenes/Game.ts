import { Scene, Math as PhaserMath } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createSortingGame, type Color, type Mode, type SortingGame,
} from '../../core/sorting';
import { mulberry32 } from '../../core/rng';
import { COLORS, FIGURE_COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera } from '../ui';
import { drawBin, drawFigure } from '../shapes';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';

const W = 400;

/** Откуда ребёнок берёт фигурку. */
const SPAWN_X = 200;
const SPAWN_Y = 300;
const TRAY_R = 68;
/** Крупная фигурка — промахнуться пальцем сложно. */
const FIG_SIZE = 92;

/** Корзины: широкие, у нижнего края — удобно тянуть большим пальцем. */
const BIN_W = 108;
const BIN_H = 140;
const BIN_TOP = 500;
const BIN_XS = [72, 200, 328];
/** Полоса, в которой бросок засчитывается за корзину (щедрая — игра для малышей). */
const DROP_TOP = BIN_TOP - 56;
const DROP_BOTTOM = BIN_TOP + BIN_H + 44;

/** Демонстрация перетаскивания в обучении рисуется поверх затемнения onboarding. */
const DEMO_DEPTH = 1500;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private mode: Mode = 'color';
  private session?: Session;
  private core!: SortingGame;

  private bins: Phaser.GameObjects.Container[] = [];
  private item?: Phaser.GameObjects.Container;
  private progressText!: Phaser.GameObjects.Text;
  private hintFx?: Phaser.GameObjects.Graphics;

  private timer?: RoundTimer;
  private finished = false;
  private tutorialActive = false;

  // Перетаскивание. Камера отмасштабирована в DPR раз, поэтому сырые pointer.x/y —
  // координаты ХОЛСТА: их обязательно переводим в мировые через getWorldPoint.
  private dragging = false;
  private dragOffX = 0;
  private dragOffY = 0;
  private worldBuf = new PhaserMath.Vector2();

  private demoTweens: Phaser.Tweens.Tween[] = [];
  private demoFinger?: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.bins = [];
    this.item = undefined;
    this.hintFx = undefined;
    this.demoTweens = [];
    this.demoFinger = undefined;
    this.dragging = false;
    this.finished = false;
    this.tutorialActive = false;
    this.timer = undefined;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.mode = (this.registry.get('mode') as Mode) ?? 'color';
    this.session = this.registry.get('session') as Session | undefined;

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.buildRound();

    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      else if (e.type === 'RESUME') this.timer?.resume();
    });
    if (off) this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  // ── Сборка партии ────────────────────────────────────────────────────────────

  private buildRound() {
    this.core = createSortingGame(this.mode, mulberry32(Math.floor(Math.random() * 2 ** 31)));
    this.buildHud();
    this.buildTray();
    this.buildDragHint();
    this.buildBins();
    this.spawnItem(false);
    this.installDragHandlers();
  }

  private buildHud() {
    this.buildBackButton();
    this.progressText = this.add
      .text(W - 20, 34, this.progressLabel(), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
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
   * Три корзины внизу. В режиме «по цвету» они окрашены (форма нигде не подсказывает),
   * в режиме «по форме» — одинаково нейтральные с крупным значком формы.
   */
  private buildBins() {
    for (let i = 0; i < 3; i++) {
      const c = this.add.container(BIN_XS[i], BIN_TOP + BIN_H).setDepth(5);
      const g = this.add.graphics();
      if (this.mode === 'color') {
        drawBin(g, BIN_W, BIN_H, FIGURE_COLORS[this.core.bins[i] as Color]);
      } else {
        drawBin(g, BIN_W, BIN_H, COLORS.binNeutral, true);
        drawFigure(g, this.core.bins[i] as 'circle' | 'square' | 'triangle', 56, COLORS.iconDark, 0, -BIN_H / 2 - 4);
      }
      c.add(g);
      this.bins.push(c);
    }
  }

  /** Габарит всех корзин — зона подсветки в обучении. */
  private binsRect(): Rect {
    const x = BIN_XS[0] - BIN_W / 2 - 8;
    return { x, y: BIN_TOP, w: BIN_XS[2] + BIN_W / 2 + 8 - x, h: BIN_H };
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
    if (this.finished || this.tutorialActive || this.dragging || !this.item) return;
    this.tweens.killTweensOf(this.item);
    this.item.setScale(1.1).setDepth(20);
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
    if (res.correct) this.acceptItem(bin, res.done);
    else this.rejectItem(bin);
  }

  /** Ближайшая корзина под точкой (или −1, если бросок мимо). */
  private binAt(x: number, y: number): number {
    if (y < DROP_TOP || y > DROP_BOTTOM) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < BIN_XS.length; i++) {
      const d = Math.abs(x - BIN_XS[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= BIN_W / 2 + 10 ? best : -1;
  }

  /** Верно: фигурка «всасывается» в корзину, та подпрыгивает, счёт +1. */
  private acceptItem(bin: number, done: boolean) {
    const flying = this.item!;
    this.item = undefined;
    this.tweens.killTweensOf(flying);
    flying.setDepth(6);
    this.tweens.add({
      targets: flying,
      x: BIN_XS[bin], y: BIN_TOP + 30, scale: 0.3, alpha: 0.1,
      duration: 260, ease: 'Quad.easeIn',
      onComplete: () => flying.destroy(),
    });
    this.bounceBin(bin);
    this.flashBin(bin);
    this.clearHint();
    this.progressText.setText(this.progressLabel());
    this.tweens.add({
      targets: this.progressText, scale: 1.25, duration: 130, yoyo: true, ease: 'Quad.easeOut',
    });

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
      onComplete: () => this.idlePulse(),
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
      .circle(BIN_XS[i], BIN_TOP + BIN_H / 2, 34, COLORS.correct, 0.45)
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
      .strokeRoundedRect(BIN_XS[i] - BIN_W / 2 - 10, BIN_TOP - 8, BIN_W + 20, BIN_H + 16, 20);
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

  /** «Как играть» из меню: строим настоящее поле, показываем обучение, по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.buildRound();
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.stopDragDemo();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз. Таймер на паузе, перетаскивание заблокировано. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.timer?.pause();
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.stopDragDemo();
        this.tutorialActive = false;
        this.timer?.resume();
      });
    });
  }

  /** Три шага НА РЕАЛЬНОМ ПОЛЕ: взять фигурку → перетащить (с показом) → цель партии. */
  private tutorialSteps(): OnboardingStep[] {
    return [
      {
        textKey: 'onboarding.take',
        target: () => ({
          x: SPAWN_X - TRAY_R, y: SPAWN_Y - TRAY_R, w: TRAY_R * 2, h: TRAY_R * 2,
        }),
        pad: 8,
        radius: 76,
      },
      {
        // В режиме «по форме» подсказка говорит про форму, а не про цвет.
        textKey: this.mode === 'color' ? 'onboarding.drop' : 'onboarding.dropShape',
        target: () => this.binsRect(),
        pad: 10,
        radius: 20,
        // Карточка уходит вверх, чтобы не перекрывать траекторию демонстрации.
        captionY: 140,
        prepare: () => this.startDragDemo(),
      },
      {
        textKey: 'onboarding.goal',
        target: () => {
          const b = this.progressText.getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        pad: 10,
        radius: 12,
        prepare: () => this.stopDragDemo(),
      },
    ];
  }

  /**
   * Реальная демонстрация перетаскивания: фигурка (с «пальцем») ездит из лотка
   * в свою корзину и обратно, поверх затемнения обучения — движение видно всегда.
   */
  private startDragDemo() {
    const c = this.item;
    const cur = this.core.current;
    if (!c || !cur) return;
    const bin = this.core.bins.indexOf(this.core.featureOf(cur));
    if (bin < 0) return;

    this.tweens.killTweensOf(c);
    c.setScale(1).setDepth(DEMO_DEPTH);
    const tx = BIN_XS[bin];
    // Глубже в корзину: так демонстрация не наезжает на карточку-подсказку.
    const ty = BIN_TOP + 66;

    this.demoFinger = this.add
      .text(SPAWN_X + 30, SPAWN_Y + 40, '👆', { fontFamily: FONT, fontSize: 30 })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(DEMO_DEPTH + 1);

    const cfg = {
      duration: 900, ease: 'Sine.easeInOut', yoyo: true, hold: 320, repeat: -1, repeatDelay: 220,
    } as const;
    this.demoTweens.push(this.tweens.add({ targets: c, x: tx, y: ty, ...cfg }));
    this.demoTweens.push(
      this.tweens.add({ targets: this.demoFinger, x: tx + 30, y: ty + 40, ...cfg }),
    );
  }

  private stopDragDemo() {
    for (const tw of this.demoTweens) tw.remove();
    this.demoTweens = [];
    this.demoFinger?.destroy();
    this.demoFinger = undefined;
    if (this.item) {
      this.tweens.killTweensOf(this.item);
      this.item.setPosition(SPAWN_X, SPAWN_Y).setScale(1).setDepth(10);
      this.idlePulse();
    }
  }

  // ── Финиш ────────────────────────────────────────────────────────────────────

  private endGame() {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { placed, mistakes } = this.core;

    void this.session
      ?.finish({ mode: this.mode, placed, mistakes, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      mode: this.mode, locale: this.locale, placed, mistakes, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
