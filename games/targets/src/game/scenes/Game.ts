import { Scene, Math as PhaserMath } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  createTargetsGame, FIELD, ROUND_MS, MAX_MULTIPLIER, R_BIG, type Target, type TargetsGame,
} from '../../core/targets';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import {
  applyTheme, setupCamera, playSound, makeGameHeader, openPauseSheet, setBackHandler, uiText, makeRecordGhost,
  runFirstMoveTutorial, showRuleOnce, TOP_BAR_H,
  type GameHeader, type PauseSheet, type RecordGhost, type FirstMoveTutorial,
} from '../ui';
import { t } from '../../i18n';
import { CHALLENGES } from '../../core/challenges';
import { challengeStates, loadBests, type ChallengeDef } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
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
/** Строка активного испытания — в полосе между шапкой партии и полем. */
const CHALLENGE_Y = (TOP_BAR_H + FIELD.y) / 2;

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
  /** Активное испытание — его прогресс висит под счётом. */
  private challenge: ChallengeDef | null = null;
  private challengeText?: Phaser.GameObjects.Text;
  private timer?: RoundTimer;

  private header?: GameHeader;
  /** «Призрак» рекорда очков под шапкой: каждый раунд — гонка с собой. */
  private ghost?: RecordGhost;
  private pause: PauseSheet | null = null;
  /** Твины, замороженные паузой-шитом (всплытие/угасание целей, «+N», отсчёт) — их и продолжаем. */
  private frozenTweens: Phaser.Tweens.Tween[] = [];

  private targetPool: TargetView[] = [];
  private popPool: Phaser.GameObjects.Text[] = [];
  private ripplePool: Phaser.GameObjects.Arc[] = [];
  /** Живые цели ядра → их представления. */
  private views = new Map<number, TargetView>();
  /** Первая цель обучения — настоящая цель ядра: попадание по ней и есть первый ход. */
  private tutorialTarget: Target | null = null;

  /** Переиспользуемый буфер перевода экранных координат тапа в логические. */
  private tapPoint = new PhaserMath.Vector2();

  private running = false;
  private finished = false;
  /** PAUSE от приложения и пауза-шит — раунд идёт, только когда нет ни того, ни другого. */
  private appPaused = false;
  private sheetPaused = false;
  /** Обучение в один шаг (T6): раунд стоит, пока не будет первого попадания. */
  private tutorial: FirstMoveTutorial | null = null;
  /** Сколько целей уже погасло само — чтобы поймать первое такое событие. */
  private lastExpired = 0;
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
    this.tutorialTarget = null;
    this.running = false;
    this.finished = false;
    this.tutorial = null;
    this.lastExpired = 0;
    this.lastScore = -1;
    this.lastCombo = -1;
    this.lastSec = -1;
    this.timer = undefined;
    this.appPaused = false;
    this.sheetPaused = false;
    this.header = undefined;
    this.ghost = undefined;
    this.pause = null;
    this.frozenTweens = [];
    // Часы сцены переживают restart: «Начать заново» из паузы пришёл бы с замороженными таймерами.
    this.time.paused = false;
    // Системный «назад» ведёт туда же, куда стрелка: раунд → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    // Активное испытание: его условие показывается под счётом и живёт весь раунд.
    this.challenge = challengeStates('targets', CHALLENGES).find((c) => c.active) ?? null;
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

    const off = this.session?.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.appPaused = true; this.pauseRound(); }
      else if (e.type === 'RESUME') { this.appPaused = false; this.resumeRound(); }
    });
    if (off) this.events.once('shutdown', off);

    // «Как играть» из паузы — то же обучение на новом раунде.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
    else this.time.delayedCall(220, () => this.runCountdown(() => this.beginRound()));
  }

  update(_time: number, delta: number) {
    if (this.running && !this.finished) {
      this.core.step(Math.min(delta, MAX_DELTA));
      this.syncTargets();
      this.syncHud();
      this.checkRules();
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

  /**
   * Шапка каталога: стрелка (пауза), название игры и чипы очков, серии и времени.
   * Раньше были белая пилюля «Назад» (сразу терявшая раунд), крупный таймер
   * справа и строка «Очки · Серия» над полем; теперь всё это — чипы шапки,
   * последние 10 секунд — белый чип с красным текстом, как таймер в «Найди пару».
   */
  private buildHud() {
    this.header = makeGameHeader(this, {
      title: t(this.locale, 'app.title'),
      chips: [
        { id: 'score', text: '0', widest: '88888' },
        { id: 'combo', text: comboChip(1), widest: comboChip(MAX_MULTIPLIER) },
        { id: 'time', text: this.timeLabel(Math.round(ROUND_MS / 1000)), widest: this.timeLabel(88) },
      ],
      onBack: () => this.openPause(),
    });
    // Шкала — по очкам: они растут весь раунд плавно, а рекорд очков — главная цифра итога.
    // Полоса y 56…65 — выше строки испытания (CHALLENGE_Y = 80, кегль 13): не пересекаются.
    this.ghost = makeRecordGhost(this, TOP_BAR_H + 3, loadBests('targets').score ?? 0);
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
  }

  private timeLabel(sec: number): string {
    return t(this.locale, 'game.time', { n: sec });
  }

  // ── Пауза ────────────────────────────────────────────────────────────────────

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенная потеря раунда. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.freezeWorld();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      kind: 'run',
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => { this.pause = null; this.thawWorld(); },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «Таймер остановлен · очки 240 · осталось 32 с». */
  private pauseSummary(): string {
    const sec = Math.ceil(this.core.remainingMs / 1000);
    return [
      uiText(this.locale, 'pause.timerStopped'),
      t(this.locale, 'pause.score', { n: this.core.score }),
      uiText(this.locale, 'pause.left', { t: this.timeLabel(sec) }),
    ].join(' · ');
  }

  /**
   * Мир раунда стоит: ядро не шагает (running = false — цели не стареют, спавн
   * и отсчёт минуты стоят, серия цела), часы сессии на паузе, таймеры сцены
   * («3 · 2 · 1» до старта) стоят, идущие твины (всплытие/угасание, «+N») замерли.
   * Твины самого шита создаются после заморозки и едут как обычно.
   */
  private freezeWorld() {
    this.sheetPaused = true;
    this.pauseRound();
    this.time.paused = true;
    this.frozenTweens = this.tweens.getTweens().filter((tw) => tw.isPlaying());
    for (const tw of this.frozenTweens) tw.pause();
  }

  private thawWorld() {
    this.sheetPaused = false;
    this.time.paused = false;
    for (const tw of this.frozenTweens) tw.resume();
    this.frozenTweens = [];
    this.resumeRound();
  }

  /** Системный «назад»: из паузы — в меню, иначе — открыть паузу. */
  private onSystemBack() {
    if (this.pause?.open) {
      this.pause.close();
      this.pause = null;
      this.exitToMenu();
      return;
    }
    this.openPause();
  }

  private exitToMenu() {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.time.paused = false;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  /** HUD перерисовывается только при изменении значения — никакого setText каждый кадр. */
  private syncHud() {
    if (this.core.score !== this.lastScore) {
      this.lastScore = this.core.score;
      this.header?.setChip('score', String(this.lastScore));
      this.ghost?.update(this.lastScore);
      this.updateChallengeLine();
    }

    // Чип серии: «×1» без серии, дальше множитель — он и подсвечен в обучении.
    const mult = this.core.multiplier;
    const shown = mult >= 2 ? mult : 0;
    if (shown !== this.lastCombo) {
      this.lastCombo = shown;
      this.header?.setChip('combo', comboChip(mult));
      if (shown) this.header?.pulseChip('combo');
    }

    const sec = Math.ceil(this.core.remainingMs / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      // Последние десять секунд — белый чип с красным текстом.
      this.header?.setChip('time', this.timeLabel(sec), sec <= 10);
    }
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
    if (this.finished || this.sheetPaused) return;
    if (y < FIELD.y) return; // зона шапки и строки испытания — не поле
    if (this.tutorial?.active) {
      // Промах в обучении не трогает ядро (ни промахов, ни серии) — только объясняет правило.
      if (!this.hitsTutorialTarget(x, y)) {
        playSound('wrong');
        this.showRipple(x, y);
        showRuleOnce(this, 'targets:miss', t(this.locale, 'rule.miss'));
        return;
      }
      // Первое попадание — настоящий ход: раунд стартует, очки за цель засчитываются.
      this.tutorial.done();
    }
    if (!this.running) return;

    const res = this.core.tap(x, y);
    if (!res.hit) {
      playSound('wrong');
      this.showRipple(x, y);
      showRuleOnce(this, 'targets:miss', t(this.locale, 'rule.miss'));
      return;
    }
    playSound(res.golden ? 'star' : 'ok');
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

  /** `flash` — «Начали!» после отсчёта; после первого попадания в обучении он лишний. */
  private beginRound(flash = true) {
    if (this.finished) return;
    // Отсчёт «3 · 2 · 1» живёт на таймерах сцены — под шитом он стоит, сюда не дойдёт.
    this.timer = createRoundTimer(() => performance.now());
    this.session?.start();
    this.timer.start();
    this.running = true;
    // Приложение свернули на «3 · 2 · 1»: раунд стартует уже на паузе.
    if (this.appPaused) this.pauseRound();
    if (flash) this.flashGo();
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
    if (!this.running) { this.timer?.pause(); return; }
    this.running = false;
    this.timer?.pause();
  }

  private resumeRound() {
    // Раунд идёт, только когда его не держат ни приложение, ни шит паузы.
    if (this.finished || !this.timer || this.appPaused || this.sheetPaused) return;
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

    this.registry.set('lastGame', {
      locale: this.locale, score, hits, maxCombo, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: на поле одна крупная настоящая цель, обведена и пульсирует,
   * внизу одна фраза. Мир стоит (ядро не шагает, цель не гаснет, минута не идёт),
   * чипы шапки спрятаны. Попадание по цели — первый ход: очки засчитываются,
   * раунд стартует сразу, без отсчёта. Промах не наказывается — только строка правила.
   */
  private startTutorial() {
    this.header?.setChipsVisible(false);
    this.tutorialTarget = this.core.spawnTarget({
      x: FIELD.x + FIELD.w / 2,
      y: FIELD.y + 180,
      r: R_BIG,
    });
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      note: t(this.locale, 'tutorial.note'),
      targets: () => {
        const tg = this.tutorialTarget;
        return tg ? [{ x: tg.x - tg.r, y: tg.y - tg.r, w: tg.r * 2, h: tg.r * 2 }] : [];
      },
      pad: 10,
      radius: R_BIG + 10,
      onDone: (skipped) => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (skipped) {
          // «Пропустить» — обычный старт с отсчётом; цель обучения остаётся подарком.
          this.runCountdown(() => this.beginRound());
        } else {
          this.beginRound(false);
        }
      },
    });
  }

  /** Попал ли тап по цели обучения (с тем же допуском для пальца, что и в ядре). */
  private hitsTutorialTarget(x: number, y: number): boolean {
    const tg = this.tutorialTarget;
    if (!tg) return false;
    return Math.hypot(x - tg.x, y - tg.y) <= tg.r + 6;
  }

  /**
   * Правила — в момент первого события, один раз на устройство: первая серия ×2
   * и первая цель, погасшая сама. Про промах — в onTap.
   */
  private checkRules() {
    if (this.core.multiplier >= 2) showRuleOnce(this, 'targets:combo', t(this.locale, 'rule.combo'));
    if (this.core.expired > this.lastExpired) {
      this.lastExpired = this.core.expired;
      showRuleOnce(this, 'targets:expired', t(this.locale, 'rule.expired'));
    }
  }

  /** «Серия из 10 подряд · 6/10» — активное испытание с прогрессом. */
  private challengeLabel(): string {
    const ch = this.challenge;
    if (!ch) return '';
    return t(this.locale, 'game.challenge', {
      text: t(this.locale, `challenge.${ch.id}`),
      v: Math.min(ch.target, this.metricValue(ch.metric)),
      n: ch.target,
    });
  }

  /** Текущее значение метрики раунда — для живого прогресса испытания. */
  private metricValue(metric: string): number {
    switch (metric) {
      case 'score': return this.core.score;
      case 'hits': return this.core.hits;
      case 'maxCombo': return this.core.maxCombo;
      default: return 0;
    }
  }

  private updateChallengeLine() {
    this.challengeText?.setText(this.challengeLabel());
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

/** Чип серии: «×3» — множитель без слова, чтобы три чипа влезли рядом с названием. */
function comboChip(mult: number): string {
  return `×${mult}`;
}
