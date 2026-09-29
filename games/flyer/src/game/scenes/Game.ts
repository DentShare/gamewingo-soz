import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, type ChallengeDef } from '@gamewingo/game-progress';
import { COLORS, FONT } from '../palette';
import {
  setupCamera, shakeCamera, playSound, makeGameHeader, openPauseSheet, setBackHandler,
  TOP_BAR_H, type GameHeader, type PauseSheet,
} from '../ui';
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
/** Строка активного испытания — на поле сразу под шапкой партии. */
const CHALLENGE_Y = TOP_BAR_H + 20;

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
  /** Активное испытание — его прогресс висит под счётом. */
  private challenge: ChallengeDef | null = null;
  private challengeText?: Phaser.GameObjects.Text;
  private challengeLine = '';

  private hero!: Phaser.GameObjects.Container;
  private walls: WallView[] = [];
  private clouds: Phaser.GameObjects.Container[] = [];
  private stripes: Phaser.GameObjects.Rectangle[] = [];
  private hintText!: Phaser.GameObjects.Text;

  /** Шапка партии: стрелка (пауза), название игры, чипы проёмов и времени в воздухе. */
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  /** Мир стоит: физика не шагает, часы сцены и твины заморожены (пауза-шит открыт). */
  private paused = false;
  /** Твины, которые шли в момент паузы, — только их и возобновляем. */
  private frozenTweens: Phaser.Tweens.Tween[] = [];
  /** Что сейчас в чипах — перерисовываем чип, только когда текст изменился. */
  private chipScore = '';
  private chipTime = '';
  /** Своё время покачивания героя до старта: копится только вне паузы — без рывка. */
  private bobMs = 0;

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
    this.timer = undefined;
    this.header = undefined;
    this.pause = null;
    this.paused = false;
    this.frozenTweens = [];
    this.chipScore = '';
    this.chipTime = '';
    this.bobMs = 0;
    // Часы сцены переживают restart — после «Начать заново» из паузы их надо отпустить.
    this.time.paused = false;
    // Системный «назад» ведёт туда же, куда стрелка: полёт → пауза → меню.
    setBackHandler(() => this.onSystemBack());
    this.tutorialActive = false;
    this.dead = false;
    this.leaving = false;

    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    // Активное испытание: его условие показывается под счётом и живёт весь полёт.
    this.challenge = challengeStates('flyer', CHALLENGES).find((c) => c.active) ?? null;
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
    // Приложение уходит в фон (звонок, шторка) — открываем ту же паузу, что и стрелка:
    // мир стоит, а вернувшись, игрок сам жмёт «Продолжить» — герой не упадёт без него.
    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') {
        if (!this.tutorialActive) this.openPause();
        else this.timer?.pause();
      } else if (e.type === 'RESUME') {
        if (!this.paused && this.core.started) this.timer?.resume();
      }
    });
    if (off) this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  update(_time: number, delta: number) {
    // На паузе кадры просто пропускаем: ядро копит время только из переданной
    // дельты, поэтому после «Продолжить» следующий кадр — обычные ~16 мс, без рывка.
    if (this.paused || this.tutorialActive || this.dead || this.leaving) return;

    const res = this.core.step(delta);
    if (this.core.started) this.scrollDecor(delta);
    this.syncViews();
    // До первого тапа герой мягко покачивается на месте — экран не выглядит замершим.
    if (!this.core.started) {
      this.bobMs += delta;
      this.hero.y = this.core.y + Math.sin(this.bobMs / 320) * 5;
    }
    this.updateChips();
    this.updateChallengeLine();
    if (res.over) this.die();
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────────

  private bindInput() {
    // `currentlyOver` непуст, если тап пришёлся на интерактивный объект (стрелка
    // шапки, пауза-шит, блокировщик обучения) — тогда это не «взмах». Тап по самой
    // шапке мимо стрелки тоже не взмах: промахнувшись по стрелке, не взлетаем.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over && over.length) return;
      if (this.cameras.main.getWorldPoint(p.x, p.y).y < TOP_BAR_H) return;
      this.flap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
  }

  private flap() {
    if (this.paused) return;
    playSound('swipe');
    if (this.tutorialActive || this.dead || this.leaving) return;
    const first = !this.core.started;
    this.core.flap();
    if (first) this.onFirstFlap();
    this.tweens.add({
      targets: this.hero, scaleX: 1.14, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut',
    });
  }

  /** Первый тап: прячем подсказку, запускаем таймер партии. */
  private onFirstFlap() {
    this.timer?.start();
    this.tweens.add({
      targets: this.hintText, alpha: 0, y: this.hintText.y - 14, duration: 220,
      onComplete: () => this.hintText.setVisible(false),
    });
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
        target: (): Rect =>
          this.header?.chipRect('score') ?? { x: HERO_X - 26, y: this.core.y - 26, w: 52, h: 52 },
        pad: 8,
        radius: 16,
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
    // Земля — до нижней кромки вытянутого экрана (+ запас на тряску): иначе на
    // высоком телефоне из-под неё торчат нижние столбы стен.
    g.fillStyle(COLORS.ground, 1).fillRect(-40, FLOOR_Y, W + 80, Math.max(H, VIEW_BOTTOM) - FLOOR_Y + 40);
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

  /**
   * Шапка каталога: стрелка (пауза), название игры и чипы — пройденные проёмы и
   * время в воздухе. Раньше здесь был крупный белый счёт поверх неба (стены с
   * верхним проёмом проезжали прямо под ним) и кнопка «Назад», которая пряталась
   * после взлёта — выйти посреди полёта было нельзя. Счёт переехал в чип, крупной
   * цифры на поле больше нет: дубль чипа только закрывал бы верхние проёмы.
   */
  private buildHud() {
    this.header = makeGameHeader(this, {
      title: t(this.locale, 'app.title'),
      chips: [
        { id: 'score', text: '0', widest: '888' },
        { id: 'time', text: formatClock(0), widest: '88:88' },
      ],
      onBack: () => this.openPause(),
    });
    // Активное испытание с живым прогрессом — под шапкой; когда всё пройдено, строки нет.
    if (this.challenge) {
      this.challengeText = this.add
        .text(W / 2, CHALLENGE_Y, this.challengeLabel(), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR)
        .setDepth(20);
    }

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
  }

  /** Проёмы и время в воздухе — в чипы шапки (только при изменении текста). */
  private updateChips() {
    const score = String(this.core.score);
    if (score !== this.chipScore) {
      this.chipScore = score;
      this.header?.setChip('score', score);
    }
    const time = formatClock(this.airSec());
    if (time !== this.chipTime) {
      this.chipTime = time;
      this.header?.setChip('time', time);
    }
  }

  /** Секунды в воздухе: таймер партии идёт с первого взмаха и стоит на паузе. */
  private airSec(): number {
    return this.core.started ? Math.floor((this.timer?.elapsedMs() ?? 0) / 1000) : 0;
  }

  // ── Пауза ────────────────────────────────────────────────────────────────────

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.dead || this.leaving || this.pause?.open) return;
    // В обучении ставить на паузу нечего — стрелка просто возвращает в меню.
    if (this.tutorialActive) {
      this.exitToMenu();
      return;
    }
    this.freezeWorld();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      kind: 'run',
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => {
        this.pause = null;
        this.thawWorld();
      },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /**
   * Остановить мир: `update()` не шагает физику ядра и не двигает стены, облака
   * и землю; часы сцены (`delayedCall`) и идущие твины (взмах героя, подсказка)
   * замирают; таймер партии стоит. Замораживаем ДО открытия шита — его
   * собственные твины выезда создаются позже и идут как обычно.
   */
  private freezeWorld() {
    this.paused = true;
    this.timer?.pause();
    this.time.paused = true;
    this.frozenTweens = this.tweens.getTweens().filter((tw) => tw.isPlaying());
    for (const tw of this.frozenTweens) tw.pause();
  }

  /** Полёт продолжается ровно с того же места: та же высота, скорость и стены. */
  private thawWorld() {
    this.paused = false;
    this.time.paused = false;
    for (const tw of this.frozenTweens) if (!tw.isDestroyed()) tw.resume();
    this.frozenTweens = [];
    // До первого взмаха таймер ещё не запущен — его стартует сам взмах.
    if (this.core.started) this.timer?.resume();
  }

  /** «Проёмов 4 · в воздухе 0:12». */
  private pauseSummary(): string {
    return t(this.locale, 'pause.summary', { passed: this.core.score, time: formatClock(this.airSec()) });
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

    this.registry.set('lastGame', {
      locale: this.locale, passed, survivedSec: Math.floor(durationMs / 1000), durationMs, score,
    });
    this.leaving = true;
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  /** «Пройди 10 проёмов · 4/10» — активное испытание с прогрессом. */
  private challengeLabel(): string {
    const ch = this.challenge;
    if (!ch) return '';
    return t(this.locale, 'game.challenge', {
      text: t(this.locale, `challenge.${ch.id}`),
      v: Math.min(ch.target, this.metricValue(ch.metric)),
      n: ch.target,
    });
  }

  /** Текущее значение метрики полёта — для живого прогресса испытания. */
  private metricValue(metric: string): number {
    const durationMs = this.timer?.elapsedMs() ?? 0;
    switch (metric) {
      case 'passed': return this.core.score;
      case 'survivedSec': return Math.floor(durationMs / 1000);
      case 'score': return computeScore({ passed: this.core.score, durationMs });
      default: return 0;
    }
  }

  /** Обновляет строку испытания, только когда текст реально изменился. */
  private updateChallengeLine() {
    if (!this.challengeText) return;
    const line = this.challengeLabel();
    if (line !== this.challengeLine) {
      this.challengeLine = line;
      this.challengeText.setText(line);
    }
  }
}

/** «0:12», «1:05» — время в воздухе в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
