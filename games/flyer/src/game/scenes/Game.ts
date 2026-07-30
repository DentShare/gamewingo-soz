import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { COLORS, FONT } from '../palette';
import { setupCamera, shakeCamera, makeBackButton } from '../ui';
import { DPR, VIEW_TOP, VIEW_BOTTOM } from '../dpr';
import { mulberry32 } from '../../core/rng';
import {
  createFlight, FIELD_H, FIELD_W, FLOOR_Y, GAP_H, HERO_X, WALL_W, type Flight,
} from '../../core/flight';
import { computeScore } from '../../core/score';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

const W = FIELD_W;
const H = FIELD_H;
/** Хватает на все одновременно живые стены (поле 400px, шаг 230px) — новые объекты не создаём. */
const WALL_POOL = 5;
/** Высота «ствола» стены: с запасом перекрывает экран сверху и снизу. */
const WALL_TALL = 760;
const STRIPE_STEP = 55;

interface WallView {
  root: Phaser.GameObjects.Container;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private session?: Session;
  private core!: Flight;

  private hero!: Phaser.GameObjects.Container;
  private walls: WallView[] = [];
  private clouds: Phaser.GameObjects.Container[] = [];
  private stripes: Phaser.GameObjects.Rectangle[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private backBtn?: Phaser.GameObjects.Container;

  private timer?: RoundTimer;
  private tutorialActive = false;
  private dead = false;
  private leaving = false;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем всё изменяемое.
    this.walls = [];
    this.clouds = [];
    this.stripes = [];
    this.backBtn = undefined;
    this.timer = undefined;
    this.tutorialActive = false;
    this.dead = false;
    this.leaving = false;

    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session | undefined;
    this.core = createFlight(mulberry32(Math.floor(Math.random() * 2 ** 31)));

    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.buildSky();
    this.buildWalls();
    this.buildGround();
    this.buildHero();
    this.buildHud();
    this.syncViews();

    // «Как играть» из меню: обучение поверх настоящего экрана, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.bindInput();

    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      else if (e.type === 'RESUME') this.timer?.resume();
    });
    if (off) this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  update(time: number, delta: number) {
    if (this.tutorialActive || this.dead || this.leaving) return;

    const before = this.core.score;
    const res = this.core.step(delta);
    if (this.core.started) this.scrollDecor(delta);
    this.syncViews();
    // До первого тапа герой мягко покачивается на месте — экран не выглядит замершим.
    if (!this.core.started) this.hero.y = this.core.y + Math.sin(time / 320) * 5;
    if (this.core.score !== before) this.bumpScore();
    if (res.over) this.die();
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────────

  private bindInput() {
    // `currentlyOver` непуст, если тап пришёлся на интерактивный объект (кнопка
    // «Назад», блокировщик обучения) — тогда это не «взмах».
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over && over.length) return;
      this.flap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
  }

  private flap() {
    if (this.tutorialActive || this.dead || this.leaving) return;
    const first = !this.core.started;
    this.core.flap();
    if (first) this.onFirstFlap();
    this.tweens.add({
      targets: this.hero, scaleX: 1.14, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut',
    });
  }

  /** Первый тап: прячем подсказку и кнопку выхода, запускаем таймер партии. */
  private onFirstFlap() {
    this.timer?.start();
    this.tweens.add({
      targets: this.hintText, alpha: 0, y: this.hintText.y - 14, duration: 220,
      onComplete: () => this.hintText.setVisible(false),
    });
    const btn = this.backBtn;
    if (btn) {
      this.backBtn = undefined;
      this.tweens.add({
        targets: btn, alpha: 0, duration: 180, onComplete: () => btn.destroy(),
      });
    }
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящий экран игры, обучение, по концу — назад в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.time.delayedCall(320, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.leaving = true;
        this.cameras.main.fadeOut(200, ...COLORS.fade);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
      });
    });
  }

  /** Первая партия — показываем обучение один раз. Ввод на это время заблокирован. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.time.delayedCall(320, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.tutorialActive = false;
      });
    });
  }

  /** Три шага на реальном экране: герой → ближайший проём → счёт. */
  private tutorialSteps(): OnboardingStep[] {
    return [
      {
        textKey: 'onboarding.flap',
        target: (): Rect => ({ x: HERO_X - 26, y: this.core.y - 26, w: 52, h: 52 }),
        pad: 6,
        radius: 26,
      },
      {
        textKey: 'onboarding.gap',
        target: (): Rect => {
          const o = this.core.obstacles[0];
          return { x: o.x - 3, y: o.gapY - 32, w: WALL_W + 6, h: o.gapH + 64 };
        },
        pad: 6,
        radius: 14,
      },
      {
        textKey: 'onboarding.score',
        target: (): Rect => {
          const b = this.scoreText.getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        pad: 10,
        radius: 14,
      },
    ];
  }

  // ── Отрисовка мира ───────────────────────────────────────────────────────────

  private buildSky() {
    // До кромок экрана и с запасом на тряску: небо не должно оголять фон камеры
    // ни на вытянутом телефоне, ни при встряске камеры на проигрыше.
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1);
    g.fillRect(-40, VIEW_TOP - 40, W + 80, VIEW_BOTTOM - VIEW_TOP + 80);

    const spec: Array<[number, number, number]> = [
      [70, 120, 1], [280, 210, 0.75], [150, 330, 0.9], [350, 430, 0.62],
    ];
    for (const [x, y, s] of spec) this.clouds.push(this.buildCloud(x, y, s));
  }

  private buildCloud(x: number, y: number, scale: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(COLORS.cloud, 0.9);
    g.fillCircle(0, 0, 21);
    g.fillCircle(22, -5, 15);
    g.fillCircle(-22, 3, 14);
    g.fillEllipse(0, 11, 80, 22);
    const c = this.add.container(x, y, [g]).setScale(scale).setDepth(-6);
    return c;
  }

  private buildWalls() {
    for (let i = 0; i < WALL_POOL; i++) this.walls.push(this.buildWall());
  }

  /**
   * Стена рисуется ОДИН раз: проём фиксированной высоты, поэтому в кадре мы только
   * двигаем контейнер (его начало координат — левый верхний угол проёма).
   * Форма — столб с круглым торцом (без «карниза»), чтобы силуэт был свой.
   */
  private buildWall(): WallView {
    const g = this.add.graphics();
    const half = WALL_W / 2;
    const R = 26;      // радиус торца, смотрящего в проём
    const CUT = 26;    // отступ боковых граней от круглого торца

    /**
     * Столб-«маяк»: брендовый оранжевый корпус, светлый блик слева, тёмная
     * грань справа и светящаяся вставка у торца, смотрящего в проём.
     * Силуэт и палитра — собственные (сознательно не «зелёная труба с пояском»).
     */
    const column = (top: number, roundBottom: boolean) => {
      const rad = roundBottom
        ? { tl: 0, tr: 0, bl: R, br: R }
        : { tl: R, tr: R, bl: 0, br: 0 };
      g.fillStyle(COLORS.wall, 1).fillRoundedRect(-half, top, WALL_W, WALL_TALL, rad);
      const stripeY = roundBottom ? top : top + CUT;
      const stripeH = WALL_TALL - CUT;
      g.fillStyle(COLORS.wallLight, 1).fillRect(-half + 8, stripeY, 9, stripeH);
      g.fillStyle(COLORS.wallDark, 1).fillRect(half - 17, stripeY, 10, stripeH);

      // Светящаяся вставка у торца — ориентир края проёма, читается на скорости.
      const glowH = 14;
      const glowY = roundBottom ? top + WALL_TALL - glowH - 12 : top + 12;
      g.fillStyle(COLORS.wallGlow, 0.9)
        .fillRoundedRect(-half + 10, glowY, WALL_W - 20, glowH, glowH / 2);

      g.lineStyle(2.5, COLORS.wallDark, 1).strokeRoundedRect(-half, top, WALL_W, WALL_TALL, rad);
    };
    column(-WALL_TALL, true);  // верхний столб заканчивается на y = 0 (верх проёма)
    column(GAP_H, false);      // нижний начинается под проёмом

    const root = this.add.container(-999, 0, [g]).setDepth(0).setVisible(false);
    return { root };
  }

  private buildGround() {
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(COLORS.ground, 1).fillRect(-40, FLOOR_Y, W + 80, H - FLOOR_Y + 40);
    g.fillStyle(COLORS.groundDark, 1).fillRect(-40, FLOOR_Y, W + 80, 6);

    const count = Math.ceil((W + STRIPE_STEP * 2) / STRIPE_STEP);
    for (let i = 0; i < count; i++) {
      this.stripes.push(
        this.add
          .rectangle(i * STRIPE_STEP, FLOOR_Y + 22, 26, 7, COLORS.groundDark, 0.55)
          .setOrigin(0, 0.5)
          .setDepth(4),
      );
    }
  }

  private buildHero() {
    const g = this.add.graphics();
    // Реактивный след + светлый ореол: герой читается и на небе, и на стене.
    g.fillStyle(COLORS.hero, 0.16).fillEllipse(-42, 3, 22, 7);
    g.fillStyle(COLORS.hero, 0.3).fillEllipse(-28, 3, 28, 10);
    g.fillStyle(0xffffff, 0.5).fillEllipse(0, 1, 42, 36);
    // Эмодзи-ракета «смотрит» вправо: собственный поворот компенсирует наклон глифа.
    const emoji = this.add
      .text(0, 0, '🚀', { fontSize: 34 })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setRotation(Math.PI / 4);
    this.hero = this.add.container(HERO_X, this.core.y, [g, emoji]).setDepth(5);
  }

  private buildHud() {
    this.scoreText = this.add
      .text(W / 2, 96, '0', {
        fontFamily: FONT, fontSize: 58, color: COLORS.scoreText, fontStyle: 'bold',
        stroke: COLORS.scoreShadow, strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(20);

    this.hintText = this.add
      .text(W / 2, 470, t(this.locale, 'game.tapToStart'), {
        fontFamily: FONT, fontSize: 19, color: COLORS.headText,
        backgroundColor: '#ffffffcc', padding: { x: 14, y: 9 },
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(20);
    this.tweens.add({
      targets: this.hintText, y: this.hintText.y + 8, duration: 720,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.backBtn = this.buildBackButton();
  }

  /** Маленькая кнопка выхода — только до старта партии, чтобы не ловить её вместо взмаха. */
  private buildBackButton(): Phaser.GameObjects.Container {
    return makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());
  }

  private goBack() {
    if (this.leaving || this.dead) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Синхронизация вида с ядром ───────────────────────────────────────────────

  private syncViews() {
    const obs = this.core.obstacles;
    for (let i = 0; i < this.walls.length; i++) {
      const view = this.walls[i].root;
      const o = obs[i];
      if (!o) { view.setVisible(false); continue; }
      view.setVisible(true);
      view.x = o.x + WALL_W / 2;
      view.y = o.gapY;
    }
    this.hero.y = this.core.y;
    this.hero.rotation = clamp(this.core.vy * 0.0011, -0.42, 0.9);
    this.scoreText.setText(String(this.core.score));
  }

  /** Параллакс: облака медленнее стен, полосы земли — быстрее. */
  private scrollDecor(delta: number) {
    const dx = (this.core.speed * Math.min(delta, 100)) / 1000;
    for (const c of this.clouds) {
      c.x -= dx * 0.28;
      if (c.x < -60) c.x = W + 60 + Math.random() * 60;
    }
    const span = this.stripes.length * STRIPE_STEP;
    for (const s of this.stripes) {
      s.x -= dx * 1.15;
      if (s.x < -STRIPE_STEP) s.x += span;
    }
  }

  private bumpScore() {
    this.tweens.add({
      targets: this.scoreText, scale: 1.28, duration: 110, yoyo: true, ease: 'Quad.easeOut',
    });
  }

  // ── Конец партии ─────────────────────────────────────────────────────────────

  private die() {
    if (this.dead) return;
    this.dead = true;
    shakeCamera(this, 220, 0.016);
    this.hintText.setVisible(false);
    this.tweens.add({ targets: this.hero, angle: 92, duration: 420, ease: 'Quad.easeIn' });
    if (this.core.cause !== 'floor') {
      this.tweens.add({ targets: this.hero, y: FLOOR_Y - 16, duration: 460, delay: 60, ease: 'Quad.easeIn' });
    }
    this.time.delayedCall(760, () => this.endGame());
  }

  private endGame() {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const passed = this.core.score;
    const score = computeScore({ passed, durationMs });

    void this.session
      ?.finish({ score, passed, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', { locale: this.locale, passed, durationMs, score });
    this.leaving = true;
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
