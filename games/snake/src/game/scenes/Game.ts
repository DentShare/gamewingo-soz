import { Scene, Math as PhaserMath } from 'phaser';
import type { Locale } from '../../core/locale';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera, makeBackButton } from '../ui';
import { t } from '../../i18n';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, type ChallengeDef } from '@gamewingo/game-progress';
import {
  createSnakeGame, COLS, ROWS, type Dir, type Point, type SnakeGame,
} from '../../core/snake';
import { mulberry32 } from '../../core/rng';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import { DPR } from '../dpr';

const W = 400;
/** Клетка поля: 15×20 клеток по 24 px = 360×480 — вписано в портрет 400×720. */
const CELL = 24;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const BOARD_LEFT = (W - BOARD_W) / 2;
const BOARD_TOP = 168;
/** Порог свайпа в px (доминирующая ось). */
const SWIPE_MIN = 24;

const SEG_TEX = 'snake-seg';
const HEAD_TEX = 'snake-head';
/**
 * Камера зумлена на DPR, поэтому текстуру клетки печём в DPR раз крупнее и ужимаем
 * спрайт обратно — иначе сегменты растягивались бы и мылили.
 */
const TEX_CELL = Math.round(CELL * DPR);
/** Обратный масштаб: текстура TEX_CELL px рисуется как клетка CELL логических px. */
const TEX_SCALE = CELL / TEX_CELL;

/** Поворот головы (глаза смотрят по курсу). */
const ANGLE: Record<Dir, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private session!: Session;
  private core!: SnakeGame;
  /** Активное испытание — его прогресс висит под счётом. */
  private challenge: ChallengeDef | null = null;
  private challengeText?: Phaser.GameObjects.Text;
  /** Времена съеденной еды (мс от старта) — для метрики «жор за 12 секунд». */
  private eatTimes: number[] = [];
  private feast12 = 0;

  private snakeLayer!: Phaser.GameObjects.Container;
  /** Пул сегментов тела: объекты переиспользуются, на каждом тике только позиции. */
  private segs: Phaser.GameObjects.Image[] = [];
  private headC!: Phaser.GameObjects.Container;
  private foodC!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private lengthText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  /** Тело на предыдущем тике — для плавной интерполяции между клетками. */
  private prevBody: Point[] = [];
  private acc = 0;
  private started = false;   // ждём первый свайп/стрелку
  private finished = false;
  private paused = false;    // PAUSE от приложения
  private tutorialActive = false;
  private timer?: RoundTimer;
  private swipeFrom: { x: number; y: number } | null = null;
  /** Переиспользуемый буфер перевода экранных координат в логические. */
  private swipePoint = new PhaserMath.Vector2();

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.segs = [];
    this.prevBody = [];
    this.acc = 0;
    this.started = false;
    this.finished = false;
    this.paused = false;
    this.tutorialActive = false;
    this.timer = undefined;
    this.swipeFrom = null;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session;
    // Активное испытание: его условие показывается под счётом и живёт весь забег.
    this.challenge = challengeStates('snake', CHALLENGES).find((c) => c.active) ?? null;
    this.eatTimes = [];
    this.feast12 = 0;

    this.ensureTextures();
    this.core = createSnakeGame(COLS, ROWS, mulberry32(Math.floor(Math.random() * 2 ** 31)));
    this.prevBody = this.core.body.map((p) => ({ ...p }));

    this.buildHud();
    this.buildBoard();
    this.buildFood();
    this.buildSnake();
    this.renderSnake(1);
    this.bindInput();

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.paused = true; this.timer?.pause(); }
      else if (e.type === 'RESUME') { this.paused = false; this.timer?.resume(); }
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  update(_time: number, delta: number) {
    if (this.finished || !this.started || this.paused || this.tutorialActive) {
      this.renderSnake(1);
      return;
    }
    // Испытания на выживание тикают от времени — обновляем строку раз в кадр недорого.
    if (this.challenge?.metric === 'survivedSec') this.updateChallengeLine();
    this.acc += delta;
    let tick = this.core.speedMs();
    // Догоняем пропущенные тики (например, после лага), но не больше пары за кадр.
    let guard = 0;
    while (this.acc >= tick && !this.finished && guard++ < 3) {
      this.acc -= tick;
      this.doStep();
      tick = this.core.speedMs();
    }
    this.renderSnake(this.finished ? 1 : Math.min(1, this.acc / tick));
  }

  // ── Ход ──────────────────────────────────────────────────────────────────────

  private doStep() {
    this.prevBody = this.core.body.map((p) => ({ ...p }));
    const res = this.core.step();
    if (res.ate) this.onAte();
    if (res.over) this.onCrash();
  }

  /** Съели еду: вспышка, обновление счёта и переезд еды в новую клетку. */
  private onAte() {
    const head = this.core.body[0];
    const fx = this.add
      .circle(this.cellX(head.x), this.cellY(head.y), 9, COLORS.food, 0.45)
      .setDepth(6);
    this.tweens.add({
      targets: fx, scale: 3.2, alpha: 0, duration: 300, ease: 'Quad.easeOut',
      onComplete: () => fx.destroy(),
    });

    this.scoreText.setText(String(this.core.score));
    this.tweens.add({ targets: this.scoreText, scale: 1.18, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.lengthText.setText(t(this.locale, 'game.length', { n: this.core.length }));

    // «Жор»: сколько еды съедено в скользящее окно 12 секунд.
    const now = this.timer?.elapsedMs() ?? 0;
    this.eatTimes.push(now);
    while (this.eatTimes.length && this.eatTimes[0] < now - 12_000) this.eatTimes.shift();
    this.feast12 = Math.max(this.feast12, this.eatTimes.length);
    this.updateChallengeLine();

    this.placeFood();
    this.foodC.setScale(0.4);
    this.tweens.add({ targets: this.foodC, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  /** Врезались: тряска, красная вспышка поля и переход к результату. */
  private onCrash() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.shake(200, 0.012);
    const flash = this.add
      .rectangle(BOARD_LEFT + BOARD_W / 2, BOARD_TOP + BOARD_H / 2, BOARD_W, BOARD_H, COLORS.crash, 0.35)
      .setDepth(7);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 420, ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.tweens.add({ targets: this.headC, scale: 1.25, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    this.time.delayedCall(620, () => this.endGame());
  }

  private endGame() {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { score, eaten, length } = this.core;

    void this.session
      .finish({ score, eaten, length, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, score, eaten, lengthMax: length,
      survivedSec: Math.floor(durationMs / 1000), feast12: this.feast12, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Управление: свайпы + стрелки ─────────────────────────────────────────────

  private bindInput() {
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.command('left'));
    kb?.on('keydown-RIGHT', () => this.command('right'));
    kb?.on('keydown-UP', () => this.command('up'));
    kb?.on('keydown-DOWN', () => this.command('down'));
    kb?.on('keydown-A', () => this.command('left'));
    kb?.on('keydown-D', () => this.command('right'));
    kb?.on('keydown-W', () => this.command('up'));
    kb?.on('keydown-S', () => this.command('down'));

    // Холст плотнее в DPR раз, камера зумлена — свайп меряем в логических координатах.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = this.toLogical(p);
      this.swipeFrom = { x: w.x, y: w.y };
    });
    // Свайп засчитывается уже в движении — управление не ждёт отрыва пальца.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.trySwipe(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.trySwipe(p);
      this.swipeFrom = null;
    });
  }

  /** Экранная точка указателя в логических координатах сцены (400×720). */
  private toLogical(p: Phaser.Input.Pointer): PhaserMath.Vector2 {
    return this.cameras.main.getWorldPoint(p.x, p.y, this.swipePoint);
  }

  private trySwipe(p: Phaser.Input.Pointer) {
    if (!this.swipeFrom) return;
    const w = this.toLogical(p);
    const dx = w.x - this.swipeFrom.x;
    const dy = w.y - this.swipeFrom.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    const dir: Dir = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    // Точка отсчёта сдвигается — можно вести пальцем и поворачивать без отрыва.
    this.swipeFrom = { x: w.x, y: w.y };
    this.command(dir);
  }

  /** Команда поворота: первая — запускает партию (до неё змейка стоит и ждёт). */
  private command(dir: Dir) {
    if (this.finished || this.tutorialActive) return;
    if (!this.started) this.startRun();
    this.core.turn(dir);
  }

  private startRun() {
    this.started = true;
    this.acc = 0;
    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    this.tweens.add({
      targets: this.hintText, alpha: 0, y: this.hintText.y + 8, duration: 240,
      onComplete: () => this.hintText.setVisible(false),
    });
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящее поле, но без сессии и таймера; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз (змейка всё равно ждёт первого свайпа). */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.tutorialActive = false;
      });
    });
  }

  /** Три шага на настоящем поле: змейка → еда → границы. */
  private tutorialSteps(): OnboardingStep[] {
    return [
      { textKey: 'onboarding.move', target: () => this.snakeRect(), pad: 8, radius: 14 },
      { textKey: 'onboarding.food', target: () => this.foodRect(), pad: 14, radius: 14 },
      { textKey: 'onboarding.crash', target: () => this.boardRect(), pad: 6, radius: 18 },
    ];
  }

  private snakeRect(): Rect {
    const xs = this.core.body.map((p) => p.x);
    const ys = this.core.body.map((p) => p.y);
    const x = BOARD_LEFT + Math.min(...xs) * CELL;
    const y = BOARD_TOP + Math.min(...ys) * CELL;
    return {
      x, y,
      w: BOARD_LEFT + (Math.max(...xs) + 1) * CELL - x,
      h: BOARD_TOP + (Math.max(...ys) + 1) * CELL - y,
    };
  }

  private foodRect(): Rect {
    const f = this.core.food;
    return { x: BOARD_LEFT + f.x * CELL, y: BOARD_TOP + f.y * CELL, w: CELL, h: CELL };
  }

  private boardRect(): Rect {
    return { x: BOARD_LEFT, y: BOARD_TOP, w: BOARD_W, h: BOARD_H };
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.lengthText = this.add
      .text(W - 20, 34, t(this.locale, 'game.length', { n: this.core.length }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
    // Счёт — крупно: аркада, его видно боковым зрением.
    this.scoreText = this.add
      .text(W / 2, 108, String(this.core.score), {
        fontFamily: FONT, fontSize: 46, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    // Активное испытание с живым прогрессом — под счётом; когда всё пройдено, строки нет.
    if (this.challenge) {
      this.challengeText = this.add
        .text(W / 2, 146, this.challengeLabel(), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR)
        .setDepth(20);
    }

    this.hintText = this.add
      .text(W / 2, BOARD_TOP + BOARD_H + 32, t(this.locale, 'game.swipeToStart'), {
        fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    this.tweens.add({
      targets: this.hintText, alpha: 0.35, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());
  }

  /** «Съешь 12 яблок за забег · 7/12» — активное испытание с прогрессом. */
  private challengeLabel(): string {
    const ch = this.challenge;
    if (!ch) return '';
    return t(this.locale, 'game.challenge', {
      text: t(this.locale, `challenge.${ch.id}`),
      v: Math.min(ch.target, this.metricValue(ch.metric)),
      n: ch.target,
    });
  }

  /** Текущее значение метрики забега — для живого прогресса испытания. */
  private metricValue(metric: string): number {
    switch (metric) {
      case 'eaten': return this.core.eaten;
      case 'lengthMax': return this.core.length;
      case 'survivedSec': return Math.floor((this.timer?.elapsedMs() ?? 0) / 1000);
      case 'feast12': return this.feast12;
      default: return 0;
    }
  }

  private updateChallengeLine() {
    this.challengeText?.setText(this.challengeLabel());
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Поле, змейка и еда ───────────────────────────────────────────────────────

  private cellX(x: number): number { return BOARD_LEFT + x * CELL + CELL / 2; }
  private cellY(y: number): number { return BOARD_TOP + y * CELL + CELL / 2; }

  /** Текстуры сегментов создаются один раз на всю игру и переиспользуются. */
  private ensureTextures() {
    if (!this.textures.exists(SEG_TEX)) {
      const g = this.add.graphics();
      // Почти во всю клетку: соседние сегменты смыкаются в сплошное тело.
      g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, TEX_CELL, TEX_CELL, 8 * DPR);
      g.generateTexture(SEG_TEX, TEX_CELL, TEX_CELL);
      g.destroy();
    }
    if (!this.textures.exists(HEAD_TEX)) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, TEX_CELL, TEX_CELL, 9 * DPR);
      g.generateTexture(HEAD_TEX, TEX_CELL, TEX_CELL);
      g.destroy();
    }
  }

  private buildBoard() {
    const g = this.add.graphics();
    g.fillStyle(darken(COLORS.board, 0.12), 1)
      .fillRoundedRect(BOARD_LEFT, BOARD_TOP + 4, BOARD_W, BOARD_H, 16);
    g.fillStyle(COLORS.board, 1).fillRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H, 16);
    // Мягкая «шахматка»: ход по клеткам читается, но фон не рябит.
    g.fillStyle(COLORS.boardAlt, 1);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) continue;
        g.fillRect(BOARD_LEFT + x * CELL, BOARD_TOP + y * CELL, CELL, CELL);
      }
    }
    // Рамка поверх «шахматки» — граница, о которую разбивается змейка.
    const edge = this.add.graphics();
    edge.lineStyle(3, COLORS.boardEdge, 1).strokeRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD_W, BOARD_H, 16);
  }

  private buildFood() {
    const c = this.add.container(0, 0).setDepth(3);
    const g = this.add.graphics();
    g.fillStyle(darken(COLORS.food, 0.25), 1).fillCircle(0, 2, 8.5);
    g.fillStyle(COLORS.food, 1).fillCircle(0, 0, 8.5);
    const shine = this.add.circle(-3, -3.5, 2.4, 0xffffff, 0.75);
    const leaf = this.add.ellipse(4, -8, 8, 4, COLORS.snakeBody).setAngle(-28);
    c.add([g, shine, leaf]);
    this.foodC = c;
    this.placeFood();
    this.tweens.add({
      targets: c, scale: 1.14, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private placeFood() {
    const f = this.core.food;
    this.foodC.setPosition(this.cellX(f.x), this.cellY(f.y));
  }

  private buildSnake() {
    this.snakeLayer = this.add.container(0, 0).setDepth(4);

    const head = this.add.container(0, 0);
    const img = this.add.image(0, 0, HEAD_TEX).setTint(COLORS.snakeHead).setScale(TEX_SCALE);
    const eyeL = this.add.circle(4, -5, 3.2, COLORS.snakeEye);
    const eyeR = this.add.circle(4, 5, 3.2, COLORS.snakeEye);
    const pupilL = this.add.circle(5.6, -5, 1.5, COLORS.snakeEyeDot);
    const pupilR = this.add.circle(5.6, 5, 1.5, COLORS.snakeEyeDot);
    head.add([img, eyeL, eyeR, pupilL, pupilR]);
    head.setDepth(5);
    this.headC = head;
    this.snakeLayer.add(head);
  }

  /** Сегмент из пула (создаётся один раз, дальше только переиспользуется). */
  private segAt(i: number): Phaser.GameObjects.Image {
    let img = this.segs[i];
    if (!img) {
      img = this.add.image(0, 0, SEG_TEX).setScale(TEX_SCALE);
      this.segs[i] = img;
      this.snakeLayer.add(img);
    }
    return img;
  }

  /**
   * Отрисовка змейки: сегменты плавно едут из клетки предыдущего тика в текущую
   * (`t` — доля пройденного тика). Объекты не пересоздаются — только позиции.
   */
  private renderSnake(t: number) {
    const body = this.core.body;
    const n = body.length;

    for (let i = 1; i < n; i++) {
      const cur = body[i];
      const prev = this.prevBody[i] ?? cur;
      const img = this.segAt(i - 1);
      img.setPosition(
        lerp(this.cellX(prev.x), this.cellX(cur.x), t),
        lerp(this.cellY(prev.y), this.cellY(cur.y), t),
      );
      img.setTint(i % 2 === 0 ? COLORS.snakeBody : COLORS.snakeBodyAlt);
      // Лёгкое сужение к хвосту — тело выглядит живым, но не рвётся на квадраты.
      img.setScale(TEX_SCALE * Math.max(0.84, 1 - i * 0.004));
      img.setVisible(true);
    }
    for (let i = Math.max(0, n - 1); i < this.segs.length; i++) this.segs[i].setVisible(false);

    const head = body[0];
    const prevHead = this.prevBody[0] ?? head;
    this.headC.setPosition(
      lerp(this.cellX(prevHead.x), this.cellX(head.x), t),
      lerp(this.cellY(prevHead.y), this.cellY(head.y), t),
    );
    this.headC.setRotation(ANGLE[this.core.dir]);
  }
}
