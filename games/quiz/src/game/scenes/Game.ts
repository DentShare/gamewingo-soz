import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { applyTheme, setupCamera, makeBackButton, makeButton, makeChip } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { makeOption, OPTION_W, type Option } from '../option';
import { levelAt } from '../../core/levels';
import { createQuizGame, type AnswerResult, type QuizGame } from '../../core/quiz';
import { mulberry32 } from '../../core/rng';
import { computeScore } from '../../core/score';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

const W = 400;
const CX = W / 2;
/** Верх блока вариантов; вопрос живёт над ним и переносится по словам. */
const OPTIONS_TOP = 268;
const OPTION_GAP = 10;
const TIMER_Y = 84;
const TIMER_W = 336;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private session!: Session;
  private core!: QuizGame;
  private timer?: RoundTimer;

  private questionText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private mistakesText!: Phaser.GameObjects.Text;
  private topicChip?: ReturnType<typeof makeChip>;
  private options: Option[] = [];
  private factGroup?: Phaser.GameObjects.Container;
  private timerBar?: Phaser.GameObjects.Graphics;

  /** Сколько секунд даётся на вопрос; 0 — без таймера. */
  private timeLimitSec = 0;
  private questionLeftMs = 0;
  private answered = false;
  private finished = false;
  private paused = false;
  private tutorialActive = false;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между партиями — сбрасываем изменяемое состояние.
    this.options = [];
    this.factGroup = undefined;
    this.timerBar = undefined;
    this.answered = false;
    this.finished = false;
    this.paused = false;
    this.tutorialActive = false;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    this.session = this.registry.get('session') as Session;

    const params = levelAt(this.level).params;
    this.timeLimitSec = params.timeLimitSec;
    this.core = createQuizGame(
      {
        questions: params.questions,
        options: params.options,
        maxMistakes: params.maxMistakes,
        topics: params.topics,
      },
      mulberry32(Math.floor(Math.random() * 2 ** 31)),
    );

    this.buildHud();
    this.showQuestion();

    // «Как играть» из меню: обучение поверх настоящей партии, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.paused = true; this.timer?.pause(); }
      else if (e.type === 'RESUME') { this.paused = false; this.timer?.resume(); }
    });
    this.events.once('shutdown', off);

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    this.maybeShowOnboarding();
  }

  update(_time: number, delta: number) {
    if (this.finished || this.answered || this.paused || this.tutorialActive) return;
    if (!this.timeLimitSec) return;
    this.questionLeftMs -= delta;
    this.paintTimer();
    if (this.questionLeftMs <= 0) this.reveal(this.core.timeout());
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  private buildHud() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());

    this.progressText = this.add
      .text(W - 20, 34, this.progressLabel(), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    const params = levelAt(this.level).params;
    this.mistakesText = this.add
      .text(W - 20, 58, t(this.locale, 'game.mistakes', { n: 0, max: params.maxMistakes }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    if (this.timeLimitSec) {
      this.timerBar = this.add.graphics();
      this.questionLeftMs = this.timeLimitSec * 1000;
      this.paintTimer();
    }

    this.questionText = this.add
      .text(CX, 180, '', {
        fontFamily: FONT, fontSize: 21, color: COLORS.headText, fontStyle: 'bold',
        align: 'center', wordWrap: { width: 344 },
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Полоса времени: тает к нулю и краснеет на последних секундах. */
  private paintTimer() {
    if (!this.timerBar || !this.timeLimitSec) return;
    const ratio = Math.max(0, Math.min(1, this.questionLeftMs / (this.timeLimitSec * 1000)));
    const low = this.questionLeftMs <= 5000;
    this.timerBar.clear();
    this.timerBar
      .fillStyle(COLORS.timerTrack, 1)
      .fillRoundedRect(CX - TIMER_W / 2, TIMER_Y, TIMER_W, 6, 3);
    if (ratio > 0) {
      this.timerBar
        .fillStyle(low ? COLORS.timerLow : COLORS.timerFill, 1)
        .fillRoundedRect(CX - TIMER_W / 2, TIMER_Y, Math.max(6, TIMER_W * ratio), 6, 3);
    }
  }

  private progressLabel(): string {
    return t(this.locale, 'game.progress', { n: this.core.index + 1, total: this.core.total });
  }

  // ── Вопрос и ответ ───────────────────────────────────────────────────────────

  private showQuestion() {
    this.answered = false;
    this.questionLeftMs = this.timeLimitSec * 1000;
    this.paintTimer();

    const q = this.core.current;
    this.progressText.setText(this.progressLabel());
    this.questionText.setText(q.q[this.locale]);

    // Чип с темой вопроса: игрок всегда видит, о чём спрашивают.
    this.topicChip?.destroy();
    this.topicChip = makeChip(this, CX, 126, t(this.locale, `topic.${q.topic}`));

    let y = OPTIONS_TOP;
    this.options = q.options.map((opt, i) => {
      const button = makeOption(this, CX, y, opt[this.locale], () => this.pick(i));
      y += button.height + OPTION_GAP;
      button.root.setAlpha(0).setY(button.root.y + 10);
      this.tweens.add({
        targets: button.root, alpha: 1, y: button.root.y - 10,
        duration: 220, delay: 60 * i, ease: 'Quad.easeOut',
      });
      return button;
    });
  }

  private pick(index: number) {
    if (this.answered || this.finished) return;
    this.reveal(this.core.answer(index), index);
  }

  /** Показывает верный ответ, подсвечивает выбранный и открывает факт. */
  private reveal(result: AnswerResult, picked?: number) {
    if (this.answered) return;
    this.answered = true;

    this.options.forEach((opt, i) => {
      opt.lock();
      if (i === result.answer) opt.setState('correct');
      else if (i === picked) opt.setState('wrong');
      else opt.setState('dim');
    });

    const params = levelAt(this.level).params;
    this.mistakesText.setText(
      t(this.locale, 'game.mistakes', { n: this.core.mistakes, max: params.maxMistakes }),
    );
    if (!result.correct) {
      this.cameras.main.shake(160, 0.006);
      this.tweens.add({
        targets: this.mistakesText, scale: 1.2, duration: 120, yoyo: true, ease: 'Quad.easeOut',
      });
    }

    this.showFact(result);
  }

  /** Карточка с фактом и кнопка перехода — ради факта игра и затевалась. */
  private showFact(result: AnswerResult) {
    const last = this.options[this.options.length - 1];
    const top = last.root.y + last.height / 2 + 18;

    const label = this.add
      .text(0, 0, t(this.locale, 'game.fact'), {
        fontFamily: FONT, fontSize: 12, color: COLORS.factLabel, fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    const body = this.add
      .text(0, 20, result.fact[this.locale], {
        fontFamily: FONT, fontSize: 15, color: COLORS.factInk,
        align: 'center', wordWrap: { width: OPTION_W - 28 },
      })
      .setOrigin(0.5, 0)
      .setResolution(DPR);

    const h = 20 + body.height + 26;
    const card = this.add.graphics();
    card.fillStyle(COLORS.factBg, 1).fillRoundedRect(-OPTION_W / 2, -14, OPTION_W, h, 12);

    this.factGroup = this.add.container(CX, top, [card, label, body]).setAlpha(0);
    this.tweens.add({ targets: this.factGroup, alpha: 1, duration: 260, ease: 'Quad.easeOut' });

    const nextLabel = result.last ? t(this.locale, 'game.finish') : t(this.locale, 'game.next');
    const button = makeButton(this, CX, top + h + 14, nextLabel, () => this.advance(result), {
      primary: true,
    });
    this.factGroup.setData('button', button);
    button.root.setAlpha(0);
    this.tweens.add({ targets: button.root, alpha: 1, duration: 260, delay: 80 });
  }

  private advance(result: AnswerResult) {
    (this.factGroup?.getData('button') as { destroy(): void } | undefined)?.destroy();
    this.factGroup?.destroy();
    this.factGroup = undefined;
    this.options.forEach((o) => o.destroy());
    this.options = [];
    this.topicChip?.destroy();
    this.topicChip = undefined;

    if (result.last || !this.core.next()) {
      this.endGame();
      return;
    }
    this.showQuestion();
  }

  // ── Конец партии ─────────────────────────────────────────────────────────────

  private endGame() {
    if (this.finished) return;
    this.finished = true;
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const { correct, mistakes, failed, total } = this.core;

    void this.session
      .finish({ level: this.level, correct, mistakes, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, level: this.level, correct, mistakes, total, durationMs,
      score: computeScore({ correct, mistakes, level: this.level }),
      cleared: !failed,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящая партия, но без сессии и таймера; по концу — в меню. */
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

  /** Первая партия — показываем обучение один раз. */
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

  private tutorialSteps(): OnboardingStep[] {
    return [
      { textKey: 'onboarding.question', target: (): Rect => this.questionRect(), pad: 10, radius: 14 },
      { textKey: 'onboarding.fact', target: (): Rect => this.optionsRect(), pad: 8, radius: 14 },
      { textKey: 'onboarding.mistakes', target: (): Rect => ({ x: W - 150, y: 46, w: 140, h: 28 }), pad: 6, radius: 10 },
    ];
  }

  private questionRect(): Rect {
    return {
      x: CX - 180, y: this.questionText.y - this.questionText.height / 2 - 6,
      w: 360, h: this.questionText.height + 12,
    };
  }

  private optionsRect(): Rect {
    if (!this.options.length) return { x: CX - OPTION_W / 2, y: OPTIONS_TOP, w: OPTION_W, h: 120 };
    const first = this.options[0];
    const last = this.options[this.options.length - 1];
    const top = first.root.y - first.height / 2;
    const bottom = last.root.y + last.height / 2;
    return { x: CX - OPTION_W / 2, y: top, w: OPTION_W, h: bottom - top };
  }
}
