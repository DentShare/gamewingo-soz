import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  applyTheme, setupCamera, makeButton, makeChip, playSound, makeGameHeader, openPauseSheet,
  setBackHandler, uiText, TOP_BAR_H, runFirstMoveTutorial, showRuleOnce,
  type FirstMoveTutorial, type Rect, type GameHeader, type PauseSheet,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { makeOption, OPTION_W, type Option } from '../option';
import { levelAt } from '../../core/levels';
import { createQuizGame, type AnswerResult, type QuizGame } from '../../core/quiz';
import { mulberry32 } from '../../core/rng';
import { computeScore } from '../../core/score';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

const W = 400;
const CX = W / 2;
/** Верх блока вариантов; вопрос живёт над ним и переносится по словам. */
const OPTIONS_TOP = 268;
const OPTION_GAP = 10;
/** Полоса времени — сразу под шапкой партии. */
const TIMER_Y = TOP_BAR_H + 16;
/** Последние секунды вопроса: полоса краснеет, чип таймера — белый с красным текстом. */
const LOW_MS = 5000;
const TIMER_W = 336;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  /** Уровень дня: параметры уровня лестницы, но колода по зерну от даты. */
  private daily = false;
  private session!: Session;
  private core!: QuizGame;
  private timer?: RoundTimer;

  private questionText!: Phaser.GameObjects.Text;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  /** Секунды, которые сейчас в чипе таймера: перерисовываем чип только при смене. */
  private shownSec = -1;
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
  /** Обучение в один шаг: первый ответ — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

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
    this.tutorial = null;
    this.header = undefined;
    this.pause = null;
    this.shownSec = -1;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    // Уровень дня: параметры уровня лестницы, но вопросы и порядок вариантов
    // по зерну от даты — один расклад на всех.
    this.daily = this.registry.get('mode') === 'dailyLevel';
    this.session = this.registry.get('session') as Session;

    const params = levelAt(this.level).params;
    this.timeLimitSec = params.timeLimitSec;
    // Всё случайное в партии — выбор вопросов и порядок вариантов — идёт от этого зерна.
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    this.core = createQuizGame(
      {
        questions: params.questions,
        options: params.options,
        maxMistakes: params.maxMistakes,
        topics: params.topics,
      },
      mulberry32(seed),
    );

    this.buildHud();
    this.showQuestion();

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.paused = true; this.timer?.pause(); }
      else if (e.type === 'RESUME') {
        this.paused = false;
        // Приложение вернулось, но игрок сам поставил паузу — время стоит, пока он не нажмёт «Продолжить».
        if (!this.pause?.open && !this.tutorial?.active) this.timer?.resume();
      }
    });
    this.events.once('shutdown', off);

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
    else this.announceLimits();
  }

  update(_time: number, delta: number) {
    // Открытая пауза держит и полосу, и просрочку: вопрос не сгорит, пока игрок в шите.
    if (this.finished || this.answered || this.paused || this.tutorial?.active || this.pause?.open) return;
    if (!this.timeLimitSec) return;
    this.questionLeftMs -= delta;
    this.paintTimer();
    if (this.questionLeftMs <= 0) this.reveal(this.core.timeout());
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Уровень N» / «Уровень дня» и чипы —
   * вопрос «3 / 10», ошибки и таймер на вопрос, если он есть на уровне.
   * Раньше здесь были белая пилюля «Назад» и текстовый HUD, а тап по «Назад»
   * посреди партии сразу её терял.
   */
  private buildHud() {
    const params = levelAt(this.level).params;
    const chips = [
      { id: 'progress', text: this.progressLabel(), widest: `${this.core.total} / ${this.core.total}` },
      {
        id: 'mistakes',
        text: this.mistakesLabel(),
        widest: this.mistakesLabel(params.maxMistakes),
      },
    ];
    if (this.timeLimitSec) {
      chips.push({ id: 'time', text: formatClock(this.timeLimitSec), widest: formatClock(Math.max(10, this.timeLimitSec)) });
    }
    this.header = makeGameHeader(this, {
      title: this.daily ? t(this.locale, 'game.dailyLevel') : t(this.locale, 'game.level', { n: this.level }),
      chips,
      onBack: () => this.openPause(),
    });

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
    const low = this.questionLeftMs <= LOW_MS;
    // Чип таймера: секунды вверх до целой, чтобы «0:00» совпадало с моментом просрочки.
    const sec = this.questionSecLeft();
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.header?.setChip('time', formatClock(sec), low);
    }
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

  /** Вопрос в чипе: «3 / 10». */
  private progressLabel(): string {
    return `${this.core.index + 1} / ${this.core.total}`;
  }

  /**
   * Ошибки в чипе: «Ошибки: 1/3». На уровнях с таймером в шапке три чипа, и полная
   * подпись выдавливает заголовок под стрелку — там короткая «× 1/3».
   */
  private mistakesLabel(n = this.core?.mistakes ?? 0): string {
    const max = levelAt(this.level).params.maxMistakes;
    return t(this.locale, this.timeLimitSec ? 'game.mistakesShort' : 'game.mistakes', { n, max });
  }

  /** Сколько целых секунд осталось на вопрос (с округлением вверх). */
  private questionSecLeft(): number {
    return Math.max(0, Math.ceil(this.questionLeftMs / 1000));
  }

  // ── Вопрос и ответ ───────────────────────────────────────────────────────────

  private showQuestion() {
    this.answered = false;
    this.questionLeftMs = this.timeLimitSec * 1000;
    this.paintTimer();

    const q = this.core.current;
    this.header?.setChip('progress', this.progressLabel());
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
    // Первый ответ — верный или нет — и есть ход: обучение закрывается, часы идут.
    this.tutorial?.done();
    this.reveal(this.core.answer(index), index);
  }

  /** Показывает верный ответ, подсвечивает выбранный и открывает факт. */
  private reveal(result: AnswerResult, picked?: number) {
    if (this.answered) return;
    this.answered = true;

    playSound(result.correct ? 'ok' : 'wrong');

    this.options.forEach((opt, i) => {
      opt.lock();
      if (i === result.answer) opt.setState('correct');
      else if (i === picked) opt.setState('wrong');
      else opt.setState('dim');
    });

    // Ошибка — чип ошибок на миг белеет с красным текстом, как таймер на последних секундах.
    this.header?.setChip('mistakes', this.mistakesLabel(), !result.correct);
    if (!result.correct) {
      this.cameras.main.shake(160, 0.006);
      this.time.delayedCall(700, () => this.header?.setChip('mistakes', this.mistakesLabel()));
      // Правило про ошибки и их лимит — в момент первой ошибки, а не карточкой заранее.
      showRuleOnce(this, 'quiz:mistakes', t(this.locale, 'rule.mistakes', { max: levelAt(this.level).params.maxMistakes }));
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
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', won: !failed, correct, mistakes, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, level: this.level, daily: this.daily, correct, mistakes, total, durationMs,
      score: computeScore({ correct, mistakes, level: this.level }),
      cleared: !failed,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Пауза и «назад» ──────────────────────────────────────────────────────────

  /** Стрелка в шапке: пауза с честным выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      summary: this.pauseSummary(),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => {
        this.pause = null;
        // В обучении часы стоят до первого ответа — «Продолжить» их не запускает.
        if (!this.paused && !this.tutorial?.active) this.timer?.resume();
      },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** «Таймер остановлен · вопрос 3 / 10 · осталось 0:09» или «вопрос 3 / 10 · ошибки 1/3». */
  private pauseSummary(): string {
    const parts: string[] = [];
    const ticking = this.timeLimitSec > 0 && !this.answered;
    if (ticking) parts.push(uiText(this.locale, 'pause.timerStopped'));
    parts.push(t(this.locale, 'pause.question', { q: this.progressLabel() }));
    if (ticking) parts.push(uiText(this.locale, 'pause.left', { t: formatClock(this.questionSecLeft()) }));
    else parts.push(t(this.locale, 'pause.mistakes', { m: `${this.core.mistakes} / ${levelAt(this.level).params.maxMistakes}` }));
    return parts.join(' · ');
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

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: вопрос и варианты видны, варианты обведены и пульсируют,
   * внизу одна фраза. Первый ответ — настоящий ход; чипы шапки и часы включаются
   * после него. Про ошибки и лимит — строкой в момент первой ошибки.
   */
  private startTutorial() {
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      note: this.timeLimitSec ? t(this.locale, 'tutorial.note') : undefined,
      // Вопрос в той же рамке, что и варианты: его нужно прочитать, а не угадать сквозь вуаль.
      targets: () => [this.playRect()],
      pad: 8,
      radius: 14,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        if (!this.pause?.open && !this.paused) this.timer?.resume();
        this.announceLimits();
      },
    });
    // Варианты въезжают твином (+10 px) — перерисовать рамку, когда они встанут на место.
    this.time.delayedCall(60 * this.options.length + 240, () => this.tutorial?.refresh());
  }

  /** Лимит времени на вопрос — одной строкой в начале первого уровня, где он появился. */
  private announceLimits() {
    if (this.timeLimitSec) showRuleOnce(this, 'quiz:timer', t(this.locale, 'rule.timer', { n: this.timeLimitSec }));
  }

  /** Вопрос и варианты одним прямоугольником — зона первого хода. */
  private playRect(): Rect {
    const q = this.questionRect();
    const o = this.optionsRect();
    const x = Math.min(q.x, o.x);
    const right = Math.max(q.x + q.w, o.x + o.w);
    return { x, y: q.y, w: right - x, h: o.y + o.h - q.y };
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

/** «0:09», «1:50» — часы в чипе шапки. */
function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
