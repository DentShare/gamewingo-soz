import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createStackGame, type StackGame, type DropResult } from '../../core/stack';
import { computeScore } from '../../core/score';
import { COLORS, FONT, blockColor } from '../palette';
import {
  applyTheme, darken, setupCamera, shakeCamera, playSound, makeGameHeader, openPauseSheet,
  setBackHandler, makeRecordGhost, TOP_BAR_H, runFirstMoveTutorial, showRuleOnce,
  type GameHeader, type PauseSheet, type RecordGhost, type FirstMoveTutorial, type Rect,
} from '../ui';
import { DPR, VIEW_BOTTOM } from '../dpr';
import { t } from '../../i18n';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, loadBests, type ChallengeDef } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';

const W = 400;
/** Высота блока на экране. */
const BLOCK_H = 26;
/** Низ фундамента. */
const BASE_Y = 690;
/** Сколько блоков помещается по высоте до того, как башня начнёт «уезжать» вниз. */
const MAX_VISIBLE = 17;
/** Строка активного испытания — на поле сразу под шапкой партии. */
const CHALLENGE_Y = TOP_BAR_H + 20;
/** В обучении первый блок едет медленнее: попасть в рамку легко, мир не наказывает. */
const TUTORIAL_SLOW = 0.5;
/**
 * Оценка высоты полосы обучения (фраза в две строки) с отступами: рамка над
 * фундаментом должна быть видна над полосой и на низком экране (360×740).
 */
const TUTORIAL_BAR_SPACE = 24 + 72 + 8;

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
  private hintText!: Phaser.GameObjects.Text;

  private timer?: RoundTimer;
  private finished = false;
  /** Обучение в один шаг: первый уложенный блок — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

  /** Шапка партии: стрелка (пауза), название игры, чипы счёта и точных попаданий. */
  private header?: GameHeader;
  /** «Призрак» рекорда высоты под шапкой: каждая партия — гонка с собой. */
  private ghost?: RecordGhost;
  private pause: PauseSheet | null = null;
  /** Мир стоит: блок не едет, таймеры и твины заморожены (пауза-шит открыт). */
  private paused = false;
  /** Твины, которые шли в момент паузы, — только их и возобновляем. */
  private frozenTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем изменяемое состояние.
    this.blockViews = new Map();
    this.pool = [];
    this.finished = false;
    this.tutorial = null;
    this.timer = undefined;
    this.header = undefined;
    this.ghost = undefined;
    this.pause = null;
    this.paused = false;
    this.frozenTweens = [];
    // Часы сцены переживают restart — после «Начать заново» из паузы их надо отпустить.
    this.time.paused = false;
    // Системный «назад» ведёт туда же, куда стрелка: забег → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    // Активное испытание: его условие показывается под счётом и живёт всю партию.
    this.challenge = challengeStates('stack', CHALLENGES).find((c) => c.active) ?? null;
    this.streak = 0;
    this.streakMax = 0;
    this.session = this.registry.get('session') as Session;

    // Сначала поле: строка испытания в HUD читает this.core. При обратном порядке
    // первая партия падала на undefined, а при повторной показывала прошлую башню.
    this.buildField();
    this.buildHud();
    this.bindInput();

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    // Приложение уходит в фон (звонок, шторка) — открываем ту же паузу, что и стрелка:
    // мир стоит, а вернувшись, игрок сам жмёт «Продолжить» — блок не уедет без него.
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.openPause();
      else if (e.type === 'RESUME' && !this.paused && !this.tutorial?.active) this.timer?.resume();
    });
    this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
  }

  update(_time: number, delta: number) {
    if (this.finished || this.paused || this.core.isOver) return;
    this.core.tick(this.tutorial?.active ? delta * TUTORIAL_SLOW : delta);
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

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), название игры и чипы — счёт и точные попадания.
   * Раньше здесь были белая пилюля «Назад» (тап по ней сразу терял забег) и крупный
   * счёт на поле. Счёт переехал в чип: крупная цифра дублировала бы его, а место
   * над башней теперь свободно.
   */
  private buildHud() {
    this.header = makeGameHeader(this, {
      title: t(this.locale, 'app.title'),
      chips: [
        { id: 'score', text: '0', widest: '888' },
        { id: 'perfects', text: perfectsLabel(0), widest: perfectsLabel(88) },
      ],
      onBack: () => this.openPause(),
    });
    this.ghost = makeRecordGhost(this, TOP_BAR_H + 3, loadBests('stack').blocks ?? 0);
    this.ghost.update(this.core.placed);
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
      .text(W / 2, 706, t(this.locale, 'game.hint'), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(20);
  }

  /** Счёт и точные попадания — в чипы шапки, высота — в «призрак» рекорда. */
  private updateChips() {
    this.header?.setChip('score', String(this.core.score));
    this.header?.setChip('perfects', perfectsLabel(this.core.perfects));
    this.ghost?.update(this.core.placed);
  }

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
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
   * Остановить мир: `update()` не двигает блок, часы сцены (`delayedCall`) и
   * идущие твины (падающие обрезки, прокрутка башни, вспышка) замирают, таймер
   * партии стоит. Замораживаем ДО открытия шита — его собственные твины
   * выезда создаются позже и идут как обычно.
   */
  private freezeWorld() {
    this.paused = true;
    this.timer?.pause();
    this.time.paused = true;
    this.frozenTweens = this.tweens.getTweens().filter((tw) => tw.isPlaying());
    for (const tw of this.frozenTweens) tw.pause();
  }

  /**
   * Мир едет дальше ровно с того же места: `core.tick` получает обычную дельту
   * следующего кадра (кадры паузы в него не попадали), твины — с того же прогресса.
   */
  private thawWorld() {
    this.paused = false;
    this.time.paused = false;
    for (const tw of this.frozenTweens) if (!tw.isDestroyed()) tw.resume();
    this.frozenTweens = [];
    // В обучении часы стоят до первого блока — «Продолжить» их не запускает.
    if (!this.tutorial?.active) this.timer?.resume();
  }

  /** «Счёт 12 · точных 3». */
  private pauseSummary(): string {
    return t(this.locale, 'pause.summary', { score: this.core.score, perfects: this.core.perfects });
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

  // ── Ввод ─────────────────────────────────────────────────────────────────────

  private bindInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: unknown[]) => {
      // Тап по интерактивному (полоса обучения, «Пропустить», пауза) — не бросок.
      if (over && over.length) return;
      // `p.y` — в пикселях холста (он плотнее в DPR раз), поэтому переводим в координаты сцены.
      if (this.cameras.main.getWorldPoint(p.x, p.y).y < TOP_BAR_H) return; // шапка партии
      this.tryDrop();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tryDrop());
  }

  private tryDrop() {
    if (this.finished || this.paused || this.core.isOver) return;
    // Обучение не наказывает: тап, пока блок совсем не над башней, — не бросок, а подсказка.
    if (this.tutorial?.active && !this.overTower()) {
      showRuleOnce(this, 'stack:aim', t(this.locale, 'rule.aim'));
      return;
    }
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
      // Короткий удар при промахе; вердикт забега — на экране итогов.
      playSound('wrong');
      // Мимо: блок улетает вниз, башня рушится.
      this.finished = true;
      this.fall(this.currentView, res.cutX > W / 2 ? 1 : -1);
      shakeCamera(this, 220, 0.006);
      this.time.delayedCall(560, () => this.endGame());
      return;
    }

    playSound(res.perfect ? 'star' : 'ok');
    // Первый уложенный блок закрывает обучение: дальше обычная партия.
    this.tutorial?.done();
    // Правила — в момент первого события, а не карточкой заранее.
    if (res.perfect) showRuleOnce(this, 'stack:perfect', t(this.locale, 'rule.perfect'));
    else if (res.cutWidth > 0) showRuleOnce(this, 'stack:cut', t(this.locale, 'rule.cut'));

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

    this.updateChips();
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

  /**
   * Обучение в один шаг. Мир «Башни» движется сам, поэтому первый тап и есть ход.
   * Чтобы он почти наверняка удался: над фундаментом обведена «рамка посадки»
   * (ширина вершины башни × ряд едущего блока), блок в ней едет вдвое медленнее,
   * а тап, когда блок совсем не над башней, не роняет его, а показывает правило.
   * Любое перекрытие с вершиной кладёт блок — это и есть первый удачный ход.
   */
  private startTutorial() {
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    this.hintText.setVisible(false); // полоса обучения говорит то же самое
    // На низком экране полоса легла бы на фундамент — приподнимаем башню; после
    // первого блока `scrollTower` плавно вернёт её на место.
    const ringBottom = BASE_Y + 8;
    this.tower.y = -Math.max(0, ringBottom - (VIEW_BOTTOM - TUTORIAL_BAR_SPACE));
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      targets: () => [this.landingRect()],
      pad: 6,
      radius: 12,
      onDone: (skipped) => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open) this.timer?.resume();
        if (skipped) {
          this.scrollTower();
          if (this.core.placed === 0) this.hintText.setVisible(true).setAlpha(1);
        }
      },
    });
  }

  /** Рамка посадки: над вершиной башни, высотой в два ряда (едущий блок + вершина). */
  private landingRect(): Rect {
    const top = this.core.blocks[this.core.blocks.length - 1];
    const y = this.tower.y + this.yOf(this.core.blocks.length) - BLOCK_H / 2;
    return { x: top.x, y, w: top.width, h: BLOCK_H * 2 };
  }

  /** Едущий блок хоть частично над вершиной — бросок его уложит. */
  private overTower(): boolean {
    const top = this.core.blocks[this.core.blocks.length - 1];
    const c = this.core.current;
    return Math.min(c.x + c.width, top.x + top.width) - Math.max(c.x, top.x) > 0;
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

/** «★ 3» — точные попадания в чипе шапки (звезда — символ, не текст: без перевода). */
function perfectsLabel(n: number): string {
  return `★ ${n}`;
}
