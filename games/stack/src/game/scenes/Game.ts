import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createStackGame, type StackGame, type DropResult } from '../../core/stack';
import { computeScore } from '../../core/score';
import { COLORS, FONT, blockColor } from '../palette';
import { applyTheme, darken, setupCamera, shakeCamera, makeBackButton } from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, type ChallengeDef } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';

const W = 400;
/** Высота блока на экране. */
const BLOCK_H = 26;
/** Низ фундамента. */
const BASE_Y = 690;
/** Сколько блоков помещается по высоте до того, как башня начнёт «уезжать» вниз. */
const MAX_VISIBLE = 17;
/** Высота HUD: тапы выше не роняют блок (там кнопка «Назад»). */
const HUD_H = 62;
/** Демонстрационный промах в обучении. */
const TUTORIAL_MISS = 26;

/**
 * Аркада «Башня». Ядро (движение/обрезка/конец игры) — в `core/stack.ts`;
 * сцена только рисует. Прямоугольники переиспользуются из пула: за кадр
 * не создаётся ни одного объекта, на экране одновременно ≤ ~25 спрайтов.
 */
export class Game extends Scene {
  private locale: Locale = 'ru';
  private session!: Session;
  private core!: StackGame;
  /** Активное испытание — его прогресс висит под счётом. */
  private challenge: ChallengeDef | null = null;
  private challengeText?: Phaser.GameObjects.Text;
  /** Текущая и лучшая серия идеальных попаданий подряд. */
  private streak = 0;
  private streakMax = 0;

  private tower!: Phaser.GameObjects.Container;
  private blockViews = new Map<number, Phaser.GameObjects.Rectangle>();
  private pool: Phaser.GameObjects.Rectangle[] = [];
  private currentView!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private perfectText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  private timer?: RoundTimer;
  private finished = false;
  private tutorialActive = false;
  /** Во время обучения блок стоит на месте (кроме первого шага — там он едет). */
  private frozen = false;
  private tutorialCut: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем изменяемое состояние.
    this.blockViews = new Map();
    this.pool = [];
    this.finished = false;
    this.tutorialActive = false;
    this.frozen = false;
    this.timer = undefined;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    // Активное испытание: его условие показывается под счётом и живёт всю партию.
    this.challenge = challengeStates('stack', CHALLENGES).find((c) => c.active) ?? null;
    this.streak = 0;
    this.streakMax = 0;
    this.session = this.registry.get('session') as Session;

    this.buildHud();
    this.buildField();
    this.bindInput();

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer?.pause();
      else if (e.type === 'RESUME') this.timer?.resume();
    });
    this.events.once('shutdown', off);

    this.maybeShowOnboarding();
  }

  update(_time: number, delta: number) {
    if (this.finished || this.core.isOver) return;
    if (this.tutorialActive && this.frozen) return;
    this.core.tick(delta);
    this.currentView.x = this.core.current.x; // единственная работа за кадр
  }

  // ── Поле ─────────────────────────────────────────────────────────────────────

  private yOf(index: number): number {
    return BASE_Y - index * BLOCK_H - BLOCK_H / 2;
  }

  /** Насколько башня «уехала» вниз при текущей высоте. */
  private towerOffset(): number {
    return Math.max(0, (this.core.blocks.length - MAX_VISIBLE) * BLOCK_H);
  }

  private buildField() {
    this.tower = this.add.container(0, 0).setDepth(1);
    // Подложка-«земля» под фундаментом.
    this.tower.add(this.add.rectangle(W / 2, BASE_Y + 10, W - 40, 8, COLORS.shade).setOrigin(0.5));

    this.core = createStackGame({ seed: Math.floor(Math.random() * 2 ** 31) });
    this.placeView(0);
    this.currentView = this.obtain();
    this.syncCurrent();

    this.flash = this.add
      .rectangle(0, 0, 10, BLOCK_H, 0xffffff, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(6)
      .setVisible(false);
    this.perfectText = this.add
      .text(0, 0, t(this.locale, 'game.perfect'), {
        fontFamily: FONT, fontSize: 18, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(7)
      .setVisible(false);
  }

  /** Прямоугольник из пула (или новый) — внутри контейнера башни. */
  private obtain(): Phaser.GameObjects.Rectangle {
    const r = this.pool.pop();
    if (r) return r.setVisible(true).setAlpha(1).setAngle(0);
    // ВАЖНО: без `setRounded` — в Phaser 4.0.0 скруглённый Rectangle роняет
    // WebGL-рендер («pipeline is not defined»). Скругление даём только через Graphics.
    const rect = this.add.rectangle(0, 0, 10, BLOCK_H, 0xffffff).setOrigin(0, 0.5);
    this.tower.add(rect);
    return rect;
  }

  private recycle(r: Phaser.GameObjects.Rectangle) {
    r.setVisible(false);
    this.pool.push(r);
  }

  private style(r: Phaser.GameObjects.Rectangle, index: number, x: number, w: number, y: number) {
    const color = blockColor(index);
    r.setPosition(x, y);
    r.setSize(Math.max(1, w), BLOCK_H);
    r.setFillStyle(color, 1);
    r.setStrokeStyle(2, darken(color, 0.24), 1);
    r.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
  }

  /** Рисует блок башни по его индексу. */
  private placeView(index: number) {
    const b = this.core.blocks[index];
    let r = this.blockViews.get(index);
    if (!r) {
      r = this.obtain();
      this.blockViews.set(index, r);
    }
    this.style(r, index, b.x, b.width, this.yOf(index));
  }

  private syncCurrent() {
    const c = this.core.current;
    this.style(this.currentView, this.core.blocks.length, c.x, c.width, this.yOf(this.core.blocks.length));
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.scoreText = this.add
      .text(W / 2, 84, t(this.locale, 'game.score', { n: 0 }), {
        fontFamily: FONT, fontSize: 58, color: COLORS.scoreText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(20);
    // Активное испытание с живым прогрессом — под счётом; когда всё пройдено, строки нет.
    if (this.challenge) {
      this.challengeText = this.add
        .text(W / 2, 126, this.challengeLabel(), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR)
        .setDepth(20);
    }

    this.hintText = this.add
      .text(W / 2, 706, t(this.locale, 'game.hint'), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(20);
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────────

  private bindInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // `p.y` — в пикселях холста (он плотнее в DPR раз), поэтому переводим в координаты сцены.
      if (this.cameras.main.getWorldPoint(p.x, p.y).y < HUD_H) return; // зона кнопки «Назад»
      this.tryDrop();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tryDrop());
  }

  private tryDrop() {
    if (this.finished || this.tutorialActive || this.core.isOver) return;
    this.applyDrop(this.core.drop());
  }

  // ── Падение блока ────────────────────────────────────────────────────────────

  /** Отрисовка результата броска: обрезка, укладка, прокрутка, конец игры. */
  private applyDrop(res: DropResult) {
    if (this.hintText.visible && this.hintText.alpha === 1) {
      this.tweens.add({
        targets: this.hintText, alpha: 0, duration: 250,
        onComplete: () => this.hintText.setVisible(false),
      });
    }

    if (!res.placed) {
      // Мимо: блок улетает вниз, башня рушится.
      this.finished = true;
      this.fall(this.currentView, res.cutX > W / 2 ? 1 : -1);
      shakeCamera(this, 220, 0.006);
      this.time.delayedCall(560, () => this.endGame());
      return;
    }

    const index = this.core.blocks.length - 1;
    // Едущий блок становится уложенным — переиспользуем его прямоугольник.
    this.blockViews.set(index, this.currentView);
    this.placeView(index);
    const landed = this.currentView;
    this.tweens.add({
      targets: landed, scaleY: 0.74, duration: 70, yoyo: true, ease: 'Quad.easeOut',
    });

    if (res.cutWidth > 0) {
      const cut = this.obtain();
      this.style(cut, index, res.cutX, res.cutWidth, this.yOf(index));
      this.fall(cut, res.cutX > this.core.blocks[index].x ? 1 : -1);
    }
    if (res.perfect) {
      this.showPerfect(index);
      this.streak += 1;
      this.streakMax = Math.max(this.streakMax, this.streak);
    } else {
      this.streak = 0;
    }

    this.scoreText.setText(t(this.locale, 'game.score', { n: this.core.score }));
    this.updateChallengeLine();

    // Новый едущий блок + прокрутка башни вниз.
    this.currentView = this.obtain();
    this.syncCurrent();
    this.scrollTower();
    this.prune();
  }

  /** Кусок отваливается и падает вниз с поворотом; прямоугольник возвращается в пул. */
  private fall(r: Phaser.GameObjects.Rectangle, dir: number) {
    this.tweens.add({
      targets: r,
      y: r.y + 460,
      x: r.x + dir * 26,
      angle: dir * 42,
      alpha: 0.12,
      duration: 620,
      ease: 'Quad.easeIn',
      onComplete: () => this.recycle(r),
    });
  }

  /** Идеальное попадание: вспышка по ширине блока + подпрыгивающая надпись. */
  private showPerfect(index: number) {
    const b = this.core.blocks[index];
    // Позиция берётся по ЦЕЛЕВОМУ смещению башни — вспышка живёт дольше прокрутки.
    const y = this.towerOffset() + this.yOf(index);
    this.flash.setPosition(b.x, y).setSize(b.width, BLOCK_H).setVisible(true).setAlpha(0.9);
    this.flash.setFillStyle(COLORS.perfect, 0.9);
    this.tweens.add({
      targets: this.flash, alpha: 0, scaleY: 2.2, duration: 320, ease: 'Quad.easeOut',
      onComplete: () => this.flash.setVisible(false).setScale(1),
    });
    this.perfectText.setPosition(b.x + b.width / 2, y - 26).setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.perfectText, y: y - 54, alpha: 0, duration: 520, ease: 'Quad.easeOut',
      onComplete: () => this.perfectText.setVisible(false),
    });
    this.tweens.add({
      targets: this.scoreText, scale: 1.16, duration: 110, yoyo: true, ease: 'Quad.easeOut',
    });
  }

  private scrollTower() {
    const target = this.towerOffset();
    if (Math.abs(this.tower.y - target) < 0.5) return;
    this.tweens.add({ targets: this.tower, y: target, duration: 180, ease: 'Quad.easeOut' });
  }

  /** Уехавшие за нижний край блоки возвращаются в пул — держим ≤ ~20 объектов. */
  private prune() {
    const cutoff = this.core.blocks.length - MAX_VISIBLE - 2;
    for (const [i, r] of this.blockViews) {
      if (i < cutoff) {
        this.blockViews.delete(i);
        this.recycle(r);
      }
    }
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящее поле + обучение, по концу — назад в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.frozen = false;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз. Таймер на паузе, тапы заблокированы. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.frozen = false;
    this.timer?.pause();
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.resetRound(); // обучение испортило башню — начинаем партию с чистого листа
        this.tutorialActive = false;
        this.frozen = false;
        this.timer?.start();
      });
    });
  }

  /**
   * Три шага на РЕАЛЬНОМ поле: (1) блок продолжает ездить внутри подсветки,
   * (2) роняем блок с небольшим промахом и подсвечиваем отрезанный край,
   * (3) подсветка счёта.
   */
  private tutorialSteps(): OnboardingStep[] {
    return [
      {
        textKey: 'onboarding.drop',
        target: () => this.currentRowRect(),
        pad: 6,
        radius: 16,
        prepare: () => { this.frozen = false; }, // блок едет — видно, что он двигается сам
      },
      {
        textKey: 'onboarding.cut',
        target: () => this.tutorialCut,
        pad: 10,
        radius: 12,
        prepare: () => this.tutorialDrop(),
      },
      {
        textKey: 'onboarding.score',
        target: () => rectOf(this.scoreText),
        pad: 12,
        radius: 14,
      },
    ];
  }

  /** Полоса во всю ширину на уровне едущего блока — «блок ездит здесь». */
  private currentRowRect(): Rect {
    const y = this.tower.y + this.yOf(this.core.blocks.length);
    return { x: 8, y: y - BLOCK_H / 2, w: W - 16, h: BLOCK_H };
  }

  /** Демонстрация обрезки: ставим блок с небольшим промахом и роняем по-настоящему. */
  private tutorialDrop() {
    this.frozen = true;
    const top = this.core.blocks[this.core.blocks.length - 1];
    this.core.setCurrentX(top.x + TUTORIAL_MISS);
    this.syncCurrent();
    const res = this.core.drop();
    const index = this.core.blocks.length - 1;
    this.applyDrop(res);
    this.tutorialCut = {
      x: res.cutX,
      y: this.tower.y + this.yOf(index) - BLOCK_H / 2,
      w: Math.max(res.cutWidth, 12),
      h: BLOCK_H,
    };
  }

  /** Полный сброс партии после обучения: пул, башня, счёт. */
  private resetRound() {
    this.tweens.killAll();
    this.tower.destroy(); // контейнер уничтожает своих детей (блоки и пул)
    this.blockViews = new Map();
    this.pool = [];
    this.flash.destroy();
    this.perfectText.destroy();
    this.buildField();
    this.scoreText.setText(t(this.locale, 'game.score', { n: 0 })).setScale(1);
    this.hintText.setVisible(true).setAlpha(1);
  }

  // ── Конец партии ─────────────────────────────────────────────────────────────

  private endGame() {
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const blocks = this.core.placed;
    const perfects = this.core.perfects;
    const serverScore = computeScore({ blocks, perfects });

    void this.session
      .finish({ score: serverScore, blocks, perfects, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, score: serverScore, blocks, perfects,
      perfectStreak: this.streakMax, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  /** «Построй башню из 14 блоков · 6/14» — активное испытание с прогрессом. */
  private challengeLabel(): string {
    const ch = this.challenge;
    if (!ch) return '';
    return t(this.locale, 'game.challenge', {
      text: t(this.locale, `challenge.${ch.id}`),
      v: Math.min(ch.target, this.metricValue(ch.metric)),
      n: ch.target,
    });
  }

  /** Текущее значение метрики партии — для живого прогресса испытания. */
  private metricValue(metric: string): number {
    switch (metric) {
      case 'blocks': return this.core.placed;
      case 'perfects': return this.core.perfects;
      case 'perfectStreak': return this.streakMax;
      default: return 0;
    }
  }

  private updateChallengeLine() {
    this.challengeText?.setText(this.challengeLabel());
  }
}

/** Габарит объекта сцены в координатах сцены (для подсветки в обучении). */
function rectOf(obj: Phaser.GameObjects.Text): Rect {
  const b = obj.getBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };

}
