import { Scene, Math as PhaserMath } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createTargetsGame, FIELD, ROUND_MS, type Target, type TargetsGame,
} from '../../core/targets';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken, setupCamera } from '../ui';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import { DPR } from '../dpr';

const W = 400;
/** Радиус, в котором нарисована цель в пуле: реальный размер задаётся масштабом. */
const BASE_R = 50;
/** Целей одновременно на поле не больше 5 — пула с запасом хватает без аллокаций. */
const TARGET_POOL = 12;
const POP_POOL = 10;
const RIPPLE_POOL = 6;
/** Ограничение шага ядра: после сворачивания WebView delta может быть огромной. */
const MAX_DELTA = 50;
const HUD_TOP_Y = 34;
const HUD_ROW_Y = 80;

interface TargetView {
  root: Phaser.GameObjects.Container;
  outer: Phaser.GameObjects.Arc;
  mid: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  /** Момент появления по «настенным» часам — для анимации всплытия. */
  bornWall: number;
  busy: boolean;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private session?: Session;
  private core!: TargetsGame;
  private timer?: RoundTimer;

  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  private targetPool: TargetView[] = [];
  private popPool: Phaser.GameObjects.Text[] = [];
  private ripplePool: Phaser.GameObjects.Arc[] = [];
  /** Живые цели ядра → их представления. */
  private views = new Map<number, TargetView>();
  /** Цель, показанная в обучении (вне ядра — не влияет на счёт). */
  private demoView?: TargetView;

  /** Переиспользуемый буфер перевода экранных координат тапа в логические. */
  private tapPoint = new PhaserMath.Vector2();

  private running = false;
  private finished = false;
  private tutorialActive = false;
  private lastScore = -1;
  private lastCombo = -1;
  private lastSec = -1;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем всё изменяемое.
    this.targetPool = [];
    this.popPool = [];
    this.ripplePool = [];
    this.views = new Map();
    this.demoView = undefined;
    this.running = false;
    this.finished = false;
    this.tutorialActive = false;
    this.lastScore = -1;
    this.lastCombo = -1;
    this.lastSec = -1;
    this.timer = undefined;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session | undefined;

    this.core = createTargetsGame(mulberry32(Math.floor(Math.random() * 2 ** 31)));

    this.buildField();
    this.buildHud();
    this.buildPools();
    // Холст плотнее в DPR раз, камера зумлена — тап переводим в логические координаты.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y, this.tapPoint);
      this.onTap(w.x, w.y);
    });

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и партии.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.pauseRound();
      else if (e.type === 'RESUME') this.resumeRound();
    });
    if (off) this.events.once('shutdown', off);

    if (!hasOnboarded()) this.runFirstTimeOnboarding();
    else this.time.delayedCall(220, () => this.runCountdown(() => this.beginRound()));
  }

  update(_time: number, delta: number) {
    if (this.running && !this.finished) {
      this.core.step(Math.min(delta, MAX_DELTA));
      this.syncTargets();
      this.syncHud();
      if (this.core.isOver) this.endRound();
      return;
    }
    // Партия на паузе/в обучении: цели не стареют, но анимация появления живёт.
    this.syncTargets();
  }

  // ── Поле и HUD ───────────────────────────────────────────────────────────────

  private buildField() {
    const g = this.add.graphics();
    g.fillStyle(COLORS.field, 1).fillRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 22);
    g.lineStyle(1.5, COLORS.fieldBorder, 1).strokeRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 22);
  }

  private buildHud() {
    this.buildBackButton();

    // Крупный обратный отсчёт — главный элемент аркады.
    this.timeText = this.add
      .text(W - 18, HUD_TOP_Y, t(this.locale, 'game.time', { n: Math.round(ROUND_MS / 1000) }), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    this.scoreText = this.add
      .text(18, HUD_ROW_Y, t(this.locale, 'game.score', { n: 0 }), {
        fontFamily: FONT, fontSize: 22, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setResolution(DPR);

    this.comboText = this.add
      .text(W - 18, HUD_ROW_Y, '', {
        fontFamily: FONT, fontSize: 22, color: COLORS.comboText, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    const w = 92, h = 40, lip = 4, r = 12;
    const container = this.add.container(14 + w / 2, HUD_TOP_Y).setDepth(30);
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
    this.running = false;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  /** HUD перерисовывается только при изменении значения — никакого setText каждый кадр. */
  private syncHud() {
    if (this.core.score !== this.lastScore) {
      this.lastScore = this.core.score;
      this.scoreText.setText(t(this.locale, 'game.score', { n: this.lastScore }));
    }

    // Показываем серию, только когда множитель реально выше единицы — «×1» ни о чём.
    const mult = this.core.multiplier;
    const shown = mult >= 2 ? mult : 0;
    if (shown !== this.lastCombo) {
      this.lastCombo = shown;
      this.comboText.setText(shown ? t(this.locale, 'game.combo', { n: shown }) : '');
      if (shown) this.pop(this.comboText, 1.22);
    }

    const sec = Math.ceil(this.core.remainingMs / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timeText.setText(t(this.locale, 'game.time', { n: sec }));
      this.timeText.setColor(sec <= 10 ? COLORS.timeLow : COLORS.headText);
      if (sec <= 5) this.pop(this.timeText, 1.18);
    }
  }

  private pop(obj: Phaser.GameObjects.Text, scale: number) {
    this.tweens.killTweensOf(obj);
    obj.setScale(1);
    this.tweens.add({ targets: obj, scale, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ── Пулы объектов (никаких аллокаций во время партии) ────────────────────────

  private buildPools() {
    for (let i = 0; i < TARGET_POOL; i++) {
      const outer = this.add.circle(0, 0, BASE_R, COLORS.targetRing).setStrokeStyle(3, 0xffffff, 0.9);
      const mid = this.add.circle(0, 0, BASE_R * 0.66, COLORS.targetMid);
      const core = this.add.circle(0, 0, BASE_R * 0.32, COLORS.targetCore);
      const root = this.add.container(0, 0, [outer, mid, core]).setVisible(false).setDepth(10);
      this.targetPool.push({ root, outer, mid, core, bornWall: 0, busy: false });
    }
    for (let i = 0; i < POP_POOL; i++) {
      this.popPool.push(
        this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: 24, color: COLORS.popText, fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(DPR)
          .setVisible(false)
          .setDepth(20),
      );
    }
    for (let i = 0; i < RIPPLE_POOL; i++) {
      this.ripplePool.push(
        this.add
          .circle(0, 0, 20, 0xffffff, 0)
          .setStrokeStyle(3, COLORS.ripple, 0.8)
          .setVisible(false)
          .setDepth(8),
      );
    }
  }

  private acquireView(): TargetView | undefined {
    const v = this.targetPool.find((x) => !x.busy);
    if (!v) return undefined;
    v.busy = true;
    v.bornWall = this.time.now;
    this.tweens.killTweensOf(v.root);
    v.root.setVisible(true).setAlpha(1).setScale(0);
    return v;
  }

  private releaseView(v: TargetView) {
    this.tweens.killTweensOf(v.root);
    v.root.setVisible(false).setAlpha(1).setScale(0);
    v.busy = false;
  }

  private paintView(v: TargetView, golden: boolean) {
    v.outer.setFillStyle(golden ? COLORS.goldenRing : COLORS.targetRing);
    v.mid.setFillStyle(golden ? COLORS.goldenMid : COLORS.targetMid);
    v.core.setFillStyle(golden ? COLORS.goldenCore : COLORS.targetCore);
  }

  // ── Синхронизация целей ──────────────────────────────────────────────────────

  private syncTargets() {
    const now = this.time.now;
    const elapsed = this.core.elapsedMs;

    for (const target of this.core.targets) {
      let v = this.views.get(target.id);
      if (!v) {
        v = this.acquireView();
        if (!v) continue; // пул исчерпан — цель просто не рисуем (ядро её не теряет)
        this.paintView(v, target.golden);
        this.views.set(target.id, v);
      }
      this.drawTarget(v, target, now, elapsed);
    }

    // Цели, которые ядро погасило по ttl: короткая анимация угасания.
    for (const [id, v] of this.views) {
      if (this.core.targets.some((x) => x.id === id)) continue;
      this.views.delete(id);
      this.fadeOutView(v);
    }

    if (this.demoView) this.pulseDemo(this.demoView, now);
  }

  /** Появление — по «настенным» часам, угасание — по возрасту в шкале ядра. */
  private drawTarget(v: TargetView, target: Target, now: number, elapsed: number) {
    const appear = easeOutBack(clamp01((now - v.bornWall) / 160));
    const life = clamp01((elapsed - target.bornMs) / target.ttlMs);
    const out = clamp01((1 - life) / 0.28); // последние 28% жизни — гаснет
    v.root.setPosition(target.x, target.y);
    v.root.setScale((target.r / BASE_R) * appear * (0.6 + 0.4 * out));
    v.root.setAlpha(Math.min(1, 0.32 + 0.68 * out));
  }

  private fadeOutView(v: TargetView) {
    this.tweens.killTweensOf(v.root);
    this.tweens.add({
      targets: v.root, scale: v.root.scale * 0.35, alpha: 0, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => this.releaseView(v),
    });
  }

  /** Попадание: цель «лопается» — резко раздувается и исчезает. */
  private burstView(v: TargetView) {
    this.tweens.killTweensOf(v.root);
    this.tweens.add({
      targets: v.root, scale: v.root.scale * 1.9, alpha: 0, duration: 210, ease: 'Quad.easeOut',
      onComplete: () => this.releaseView(v),
    });
  }

  private showPop(x: number, y: number, points: number, golden: boolean) {
    const txt = this.popPool.find((p) => !p.visible);
    if (!txt) return;
    this.tweens.killTweensOf(txt);
    txt
      .setText(`+${points}`)
      .setColor(golden ? COLORS.popGolden : COLORS.popText)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.7)
      .setVisible(true);
    this.tweens.add({ targets: txt, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: txt, y: y - 48, alpha: 0, duration: 620, ease: 'Quad.easeOut',
      onComplete: () => txt.setVisible(false),
    });
  }

  /** Промах по пустому месту: тихая волна, без штрафа по очкам. */
  private showRipple(x: number, y: number) {
    const ring = this.ripplePool.find((r) => !r.visible);
    if (!ring) return;
    this.tweens.killTweensOf(ring);
    ring.setPosition(x, y).setScale(0.3).setAlpha(0.75).setVisible(true);
    this.tweens.add({
      targets: ring, scale: 1.5, alpha: 0, duration: 280, ease: 'Quad.easeOut',
      onComplete: () => ring.setVisible(false),
    });
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────────

  private onTap(x: number, y: number) {
    if (!this.running || this.finished || this.tutorialActive) return;
    if (y < FIELD.y) return; // зона HUD — там своя кнопка «Назад»

    const res = this.core.tap(x, y);
    if (!res.hit) {
      this.showRipple(x, y);
      return;
    }
    const v = res.targetId !== undefined ? this.views.get(res.targetId) : undefined;
    if (v && res.targetId !== undefined) {
      this.views.delete(res.targetId);
      this.showPop(v.root.x, v.root.y - 12, res.points, !!res.golden);
      this.burstView(v);
    } else {
      this.showPop(x, y - 12, res.points, !!res.golden);
    }
  }

  // ── Ход партии ───────────────────────────────────────────────────────────────

  /** Отсчёт «3 · 2 · 1» — чтобы игрок успел приготовиться. */
  private runCountdown(done: () => void) {
    const cx = FIELD.x + FIELD.w / 2;
    const cy = FIELD.y + FIELD.h / 2;
    const label = this.add
      .text(cx, cy, '', { fontFamily: FONT, fontSize: 116, color: COLORS.headText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(50);

    const seq = ['3', '2', '1'];
    let i = 0;
    const nextTick = () => {
      if (this.finished) { label.destroy(); return; }
      if (i >= seq.length) {
        label.destroy();
        done();
        return;
      }
      // Гасим твины прошлой цифры: иначе доигрывающий alpha-твин съедает следующую.
      this.tweens.killTweensOf(label);
      label.setText(seq[i]).setScale(0.45).setAlpha(1);
      this.tweens.add({ targets: label, scale: 1.1, duration: 280, ease: 'Back.easeOut' });
      this.tweens.add({ targets: label, alpha: 0, duration: 190, delay: 380 });
      i++;
      this.time.delayedCall(580, nextTick);
    };
    nextTick();
  }

  private beginRound() {
    if (this.finished) return;
    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    this.running = true;
    this.flashGo();
  }

  private flashGo() {
    const go = this.add
      .text(FIELD.x + FIELD.w / 2, FIELD.y + FIELD.h / 2, t(this.locale, 'game.go'), {
        fontFamily: FONT, fontSize: 44, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setDepth(50);
    this.tweens.add({
      targets: go, alpha: 0, scale: 1.3, duration: 520, ease: 'Quad.easeOut',
      onComplete: () => go.destroy(),
    });
  }

  private pauseRound() {
    if (!this.running) return;
    this.running = false;
    this.timer?.pause();
  }

  private resumeRound() {
    if (this.finished || this.tutorialActive || !this.timer) return;
    this.running = true;
    this.timer.resume();
  }

  private endRound() {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    const { score, hits, maxCombo } = this.core;
    const durationMs = Math.round(this.timer?.elapsedMs() ?? this.core.elapsedMs);

    void this.session
      ?.finish({ score, hits, maxCombo, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', { locale: this.locale, score, hits, maxCombo, durationMs });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящее поле + обучение, по концу — обратно в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.hideDemo();
        this.cameras.main.fadeOut(200, ...COLORS.fade);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
      });
    });
  }

  /** Первая партия — показываем обучение один раз, затем отсчёт и старт. */
  private runFirstTimeOnboarding() {
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.hideDemo();
        this.resetHudPreview();
        this.tutorialActive = false;
        this.runCountdown(() => this.beginRound());
      });
    });
  }

  /**
   * Три шага на РЕАЛЬНОМ экране: настоящая цель на поле, строка счёта/серии
   * в HUD и крупный таймер.
   */
  private tutorialSteps(): OnboardingStep[] {
    const demoX = FIELD.x + FIELD.w / 2;
    const demoY = FIELD.y + 180;
    const demoR = 46;
    return [
      {
        textKey: 'onboarding.aim',
        target: (): Rect => ({ x: demoX - demoR, y: demoY - demoR, w: demoR * 2, h: demoR * 2 }),
        pad: 12,
        radius: 22,
        prepare: () => this.showDemo(demoX, demoY, demoR),
      },
      {
        textKey: 'onboarding.combo',
        target: (): Rect => ({ x: 12, y: HUD_ROW_Y - 20, w: W - 24, h: 40 }),
        pad: 6,
        radius: 14,
        prepare: () => this.previewHud(),
      },
      {
        textKey: 'onboarding.time',
        target: (): Rect => rectOf(this.timeText),
        pad: 10,
        radius: 12,
      },
    ];
  }

  /** Настоящая цель на поле для первого шага обучения (вне ядра — счёт не трогает). */
  private showDemo(x: number, y: number, r: number) {
    if (this.demoView) return;
    const v = this.acquireView();
    if (!v) return;
    this.paintView(v, false);
    v.root.setPosition(x, y).setScale(0);
    this.tweens.add({
      targets: v.root, scale: r / BASE_R, duration: 260, ease: 'Back.easeOut',
    });
    this.demoView = v;
  }

  /** Лёгкое «дыхание» демо-цели, чтобы она читалась как живая. */
  private pulseDemo(v: TargetView, now: number) {
    const k = 1 + 0.05 * Math.sin(now / 260);
    v.outer.setScale(k);
  }

  private hideDemo() {
    if (!this.demoView) return;
    const v = this.demoView;
    this.demoView = undefined;
    v.outer.setScale(1);
    this.fadeOutView(v);
  }

  /** На шаге про серию HUD показывает пример значений — иначе подсвечивать нечего. */
  private previewHud() {
    this.scoreText.setText(t(this.locale, 'game.score', { n: 240 }));
    this.comboText.setText(t(this.locale, 'game.combo', { n: 3 }));
  }

  private resetHudPreview() {
    this.lastScore = -1;
    this.lastCombo = -1;
    this.lastSec = -1;
    this.scoreText.setText(t(this.locale, 'game.score', { n: 0 }));
    this.comboText.setText('');
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Мягкий «выскок» при появлении цели. */
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

/** Габарит объекта сцены в координатах сцены (для подсветки в обучении). */
function rectOf(obj: Phaser.GameObjects.Text): Rect {
  const b = obj.getBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
