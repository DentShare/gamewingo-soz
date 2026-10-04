import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Row } from '../../core/gameState';
import { t } from '../../i18n';
import {
  applyTheme, setupCamera, makeBonusChip, playSound, setBackHandler, motionAllowed,
  makeLadderResult, makeButton, uiText, pluralForm, bonusLineLabel,
  C, S, TYPE, WEIGHT, BUTTON_H, LOGICAL_W, LOGICAL_H, type Button,
} from '../ui';
import { COLORS, FONT, paletteFor } from '../palette';
import { DPR } from '../dpr';
import { buildShareText } from '../share';
import { loadDaily, saveDaily, getHighContrast, recordDailyStats } from '../../core/persistence';
import { streakOn, winPercent } from '../../core/stats';
import { computeDayId, dayDate, formatCountdown, msUntilNextDay } from '../../core/dailyWord';
import { tokenizeWord } from '../../core/tokenizer';
import type { Session } from '../../bridge/session';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  settleLadderRound, starsFor, starGap, chapterOf, loadProgress, isUnlocked, recordEndlessResult,
  dailyMissions, grantRoundBonuses, awardOnce, bonusBalance, bonusBreakdown, nextLevel, TARIFF, type Stars,
} from '@gamewingo/game-progress';
import { computeScore } from '../../core/score';

const SLUG = 'soz';

interface LastGame {
  mode: 'daily' | 'practice';
  /** Номер уровня лестницы; для слова дня не используется. */
  level: number;
  locale: Locale;
  dayId: number;
  solved: boolean;
  guessesUsed: number;
  answer: string;
  rows: Row[];
  rewardClaimed: boolean;
}

/** Ширина колонки итогов — как у карточек `makeLadderResult`. */
const CARD_W = 360;

/**
 * Итоги (T4 UX-волны). Уровень тренировки — экран лестницы по эталону «Найди
 * пару»: звёзды по попыткам, «почти», бонусы, следующий уровень; очков и
 * лидерборда нет.
 *
 * Слово дня (T9) — крюки жанра вместо лидерборда: дата и итог, ряд ответа,
 * статистика «сыграно / % побед / серия / лучшая», распределение попыток и
 * живой отсчёт до нового слова. Лидерборд из трёх имён убран совсем: он не
 * зовёт вернуться завтра, а статистика и серия — зовут; компактный топ под всем
 * экраном уехал бы за сгиб на 360×740 и спорил бы с кнопками. Переиграть слово
 * дня нельзя, поэтому вторая кнопка — «Тренировка», а не «Ещё раз».
 */
export class GameOver extends Scene {
  private session!: Session;
  private last!: LastGame;

  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    setBackHandler(() => this.scene.start('MainMenu'));
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    this.session = this.registry.get('session') as Session;
    this.last = this.registry.get('lastGame') as LastGame;
    playSound(this.last.solved ? 'win' : 'lose');

    const { total, balance, awardFrom } = this.last.mode === 'daily' ? this.showDaily() : this.showLevel();

    const bonusChip = makeBonusChip(this, 386, 30);
    if (total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(Math.max(0, balance - total));
      this.time.delayedCall(1100, () => {
        playSound('coin');
        bonusChip.award(total, awardFrom.x, awardFrom.y);
      });
    }
  }

  /* ── Уровень лестницы ──────────────────────────────────────────────────── */

  private showLevel(): Settled {
    const last = this.last;
    const loc = last.locale;
    const won = last.solved;
    const level = levelAt(last.level);
    // Звёзды меряются использованными попытками: меньше — лучше.
    const starCount = won ? starsFor(level.goals, last.guessesUsed) : 0;
    const score = won ? computeScore({ guessesUsed: last.guessesUsed, solved: true, durationMs: 0 }) : 0;
    const { bonus, lines } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE, mode: 'level',
      cleared: won, stars: (starCount || 1) as Stars, score,
    });

    // «Почти»: на сколько попыток меньше нужно было для третьей звезды.
    const gap = won ? starGap(level.goals, last.guessesUsed) : null;
    const nextN = last.level + 1;
    const hasNext = won && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);

    const screen = makeLadderResult(this, {
      locale: loc,
      caption: uiText(loc, 'result.levelChapter', { n: last.level, k: chapterOf(last.level) }),
      title: t(loc, won ? 'result.won' : 'result.lost'),
      stars: starCount,
      // Провал — какое было слово.
      note: won ? undefined : t(loc, 'result.answerWas', { word: last.answer }),
      almost: gap && {
        title: uiText(loc, 'result.almostStar', {
          gap: t(loc, `result.gapGuesses.${pluralForm(gap.missing)}`, { n: gap.missing }),
        }),
        detail: t(loc, 'result.almostDetail', { used: last.guessesUsed, need: gap.threshold }),
        againLabel: uiText(loc, 'result.again'),
        onAgain: () => this.playLevel(last.level),
      },
      lines,
      total: bonus.total,
      // У «5 букв» нет подписи рычага уровня (в меню её тоже нет) — просто «Уровень N».
      primary: hasNext
        ? { label: uiText(loc, 'result.next', { n: nextN }), onClick: () => this.playLevel(nextN) }
        : { label: uiText(loc, 'result.again'), onClick: () => this.playLevel(last.level) },
      onMenu: () => this.scene.start('MainMenu'),
      mood: won ? 'happy' : 'sad',
    });
    return { total: bonus.total, balance: bonus.balance, awardFrom: screen.awardFrom };
  }

  /* ── Слово дня ─────────────────────────────────────────────────────────── */

  /**
   * Слово дня в лестницу не идёт — это отдельный режим со своей наградой,
   * но в счётчики дня попадает; бонус дня — отдельным тарифом.
   */
  private settleDaily() {
    const last = this.last;
    const won = last.solved;
    const missionsBefore = dailyMissions();
    recordEndlessResult(SLUG, won ? computeScore({ guessesUsed: last.guessesUsed, solved: true, durationMs: 0 }) : 0);
    const bonus = grantRoundBonuses({ slug: SLUG, n: last.level, record: null, missionsBefore });
    const dailyKey = `soz-daily-${last.dayId}`;
    if (won && awardOnce(dailyKey, TARIFF.daily)) {
      bonus.granted.push({ key: dailyKey, amount: TARIFF.daily });
      bonus.total += TARIFF.daily;
    }
    return {
      total: bonus.total,
      balance: bonusBalance(),
      lines: bonusBreakdown({ granted: bonus.granted, missionsBefore }),
    };
  }

  private showDaily(): Settled {
    const last = this.last;
    const loc = last.locale;
    const won = last.solved;
    const settled = this.settleDaily();
    // Запись идемпотентна по дню: партия пишет статистику при завершении, а здесь
    // догоняем восстановленный итог (игрок закрыл приложение до экрана итога).
    const stats = recordDailyStats(loc, { dayId: last.dayId, solved: won, guessesUsed: last.guessesUsed });
    const cx = LOGICAL_W / 2;
    const left = cx - CARD_W / 2;
    let y = 56;

    // «Слово дня · 28 сентября» → «Отгадано с 4-й попытки» / «Не отгадано: СЛОВО».
    const { day, month } = dayDate(last.dayId);
    const date = t(loc, 'date.dayMonth', { d: day, m: t(loc, `date.month.${month}`) });
    const cap = this.label(cx, y, t(loc, 'result.dailyDate', { date }), TYPE.body, S.muted).setOrigin(0.5, 0);
    this.appear(cap, 60);
    y += 24;
    const titleText = won
      ? t(loc, 'result.solvedOn', { n: last.guessesUsed })
      : t(loc, 'result.notSolved', { word: last.answer.toUpperCase() });
    const title = this.label(cx, y, titleText, TYPE.headline + 4, S.ink, WEIGHT.bold).setOrigin(0.5, 0);
    if (motionAllowed()) {
      title.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 340, delay: 120, ease: 'Back.easeOut' });
    }
    y += title.height + 14;

    const answer = this.answerRow(cx, y, last.answer, loc, won);
    this.appear(answer.root, 200);
    y += answer.height + 20;

    const metrics = this.metricsRow(cx, y, [
      { value: String(stats.played), caption: t(loc, 'stats.played') },
      { value: `${winPercent(stats)}%`, caption: t(loc, 'stats.winPct') },
      { value: String(streakOn(stats, last.dayId)), caption: t(loc, 'stats.streak'), accent: true },
      { value: String(stats.bestStreak), caption: t(loc, 'stats.best') },
    ]);
    this.appear(metrics.root, 280);
    y += metrics.height + 20;

    const dist = this.distribution(left, y, stats.distribution, won ? last.guessesUsed : 0, loc);
    this.appear(dist.root, 360);
    y += dist.height + 18;

    const countdown = this.countdown(cx, y, loc);
    this.appear(countdown, 440);
    y += countdown.height + 16;

    // Закрытые этой партией задания дня — строкой; слово дня видно на кнопке награды.
    let bonusAt = { x: cx, y: y };
    for (const line of settled.lines.filter((l) => l.granted && l.kind === 'mission')) {
      const row = this.add.container(left, y);
      const amount = this.label(CARD_W, 0, `+${line.amount}`, TYPE.body, S.gold, WEIGHT.semibold).setOrigin(1, 0);
      const text = this.label(0, 0, bonusLineLabel(loc, line), TYPE.body - 1, S.ink)
        .setWordWrapWidth(CARD_W - amount.width - 12, true);
      row.add([text, amount]);
      this.appear(row, 500);
      bonusAt = { x: left + CARD_W - 20, y: y + 10 };
      y += Math.max(22, text.height + 6);
    }

    const claimable = won && !last.rewardClaimed;
    const blockH = (claimable ? BUTTON_H.lg + 10 : 0) + BUTTON_H.md + 10 + BUTTON_H.md;
    // Кнопки прижаты к низу вёрстки 720, если колонка короче: большой палец дотягивается.
    const actionsY = Math.max(y + 6, LOGICAL_H - 16 - blockH);
    const claimAt = this.dailyActions(cx, actionsY, claimable);

    // «+N» вылетает над кнопкой награды, а не поверх её подписи.
    return {
      total: settled.total,
      balance: settled.balance,
      awardFrom: claimAt ? { x: claimAt.x, y: actionsY - 22 } : bonusAt,
    };
  }

  /** Ряд ответа плитками 40×40: отгадано — цветом «на месте», нет — нейтрально. */
  private answerRow(cx: number, y: number, word: string, loc: Locale, won: boolean) {
    const units = tokenizeWord(word, loc);
    const SIZE = 40;
    const GAP_T = 6;
    const w = units.length * (SIZE + GAP_T) - GAP_T;
    const root = this.add.container(cx, y);
    const g = this.add.graphics();
    const fill = won ? paletteFor(getHighContrast()).correct : C.muted;
    root.add(g);
    units.forEach((u, i) => {
      const x = -w / 2 + i * (SIZE + GAP_T);
      g.fillStyle(fill, 1).fillRoundedRect(x, 0, SIZE, SIZE, 6);
      root.add(this.label(x + SIZE / 2, SIZE / 2, u.toUpperCase(), u.length > 1 ? 16 : 20, S.white, WEIGHT.bold).setOrigin(0.5));
    });
    return { root, height: SIZE };
  }

  /** Четыре метрики в ряд: число 24/700 и подпись 12 muted; серия — primary. */
  private metricsRow(cx: number, y: number, items: Array<{ value: string; caption: string; accent?: boolean }>) {
    const root = this.add.container(cx - CARD_W / 2, y);
    const col = CARD_W / items.length;
    let h = 0;
    items.forEach((it, i) => {
      const x = col * i + col / 2;
      const v = this.label(x, 0, it.value, TYPE.headline + 2, it.accent ? S.primary : S.ink, WEIGHT.bold).setOrigin(0.5, 0);
      const c = this.label(x, v.height + 2, it.caption, TYPE.caption, S.muted).setOrigin(0.5, 0);
      // Длинная подпись («eng uzun seriya») не наезжает на соседа — ужимается.
      for (let size = TYPE.caption; c.width > col - 6 && size > 10;) c.setFontSize(--size);
      root.add([v, c]);
      h = Math.max(h, v.height + 2 + c.height);
    });
    return { root, height: h };
  }

  /**
   * Распределение попыток: бары 16 px, длина — доля от самой частой попытки.
   * Сегодняшняя попытка — primary, остальные — muted; пустые — короткий хвостик с нулём.
   */
  private distribution(x: number, y: number, dist: readonly number[], current: number, loc: Locale) {
    const root = this.add.container(x, y);
    const head = this.label(0, 0, t(loc, 'stats.distribution'), TYPE.caption + 1, S.muted, WEIGHT.semibold);
    root.add(head);
    const BAR_H = 16;
    const ROW_GAP = 5;
    const LABEL_W = 18;
    const maxW = CARD_W - LABEL_W;
    const top = head.height + 8;
    const most = Math.max(1, ...dist);
    const g = this.add.graphics();
    root.add(g);
    dist.forEach((count, i) => {
      const ry = top + i * (BAR_H + ROW_GAP);
      const isCurrent = i + 1 === current;
      root.add(this.label(0, ry + BAR_H / 2, String(i + 1), TYPE.caption + 1, S.ink, WEIGHT.semibold).setOrigin(0, 0.5));
      const num = this.label(0, ry + BAR_H / 2, String(count), TYPE.caption, S.white, WEIGHT.bold).setOrigin(1, 0.5);
      const w = Math.max(num.width + 12, Math.round((count / most) * maxW));
      g.fillStyle(isCurrent ? C.primary : C.muted, 1).fillRoundedRect(LABEL_W, ry, w, BAR_H, 4);
      num.setX(LABEL_W + w - 6);
      root.add(num);
    });
    return { root, height: top + dist.length * (BAR_H + ROW_GAP) - ROW_GAP };
  }

  /**
   * «Новое слово через 06:12:44» — живой отсчёт до полуночи по Ташкенту (когда
   * меняется `dayId`, а с ним слово). Дошёл до нуля — «Новое слово уже готово»,
   * и меню начнёт уже новый день.
   */
  private countdown(cx: number, y: number, loc: Locale) {
    const text = this.label(cx, y, '', TYPE.body, S.ink, WEIGHT.semibold).setOrigin(0.5, 0);
    const tick = () => {
      const left = msUntilNextDay();
      const today = computeDayId();
      if (today > this.last.dayId) {
        text.setText(t(loc, 'result.nextWordReady'));
        this.registry.set('dayId', today);
        timer.remove();
        return;
      }
      text.setText(t(loc, 'result.nextWord', { t: formatCountdown(left) }));
    };
    const timer = this.time.addEvent({ delay: 1000, loop: true, callback: tick });
    tick();
    return text;
  }

  /**
   * Кнопки слова дня: «Забрать награду +25» (награда приложения, пока не забрана),
   * под ней «Поделиться» и «Тренировка», ниже «В меню». Переиграть слово дня нельзя —
   * поэтому не «Ещё раз», а «Тренировка»: она ведёт в лестницу, на следующий уровень.
   * Возвращает точку кнопки награды — оттуда вылетает «+N».
   */
  private dailyActions(cx: number, y: number, claimable: boolean): { x: number; y: number } | null {
    const last = this.last;
    const loc = last.locale;
    const share = buildShareText(last.rows, {
      solved: last.solved, guessesUsed: last.guessesUsed,
      dayId: last.dayId, title: t(loc, 'app.title'),
    });
    let claimAt: { x: number; y: number } | null = null;

    if (claimable) {
      let claimed = false;
      const claim: Button = makeButton(
        this, cx, y + BUTTON_H.lg / 2, t(loc, 'result.claim', { n: TARIFF.daily }),
        () => {
          if (claimed) return;
          this.session.claim(`soz-daily-${last.dayId}`);
        },
        { primary: true, width: CARD_W, height: BUTTON_H.lg },
      );
      this.appear(claim.root, 620);
      claimAt = { x: cx, y: y + BUTTON_H.lg / 2 };
      y += BUTTON_H.lg + 10;
      const off = this.session.onReward((r) => {
        if (!r.granted || claimed) return;
        claimed = true;
        claim.setLabel(t(loc, 'result.claimed', { points: r.points ?? 0 }));
        this.tweens.add({ targets: claim.root, scale: 1.05, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        const saved = loadDaily(loc, last.dayId);
        if (saved) saveDaily(loc, last.dayId, { ...saved, rewardClaimed: true });
      });
      this.events.once('shutdown', off);
    }

    const half = (CARD_W - 10) / 2;
    const shareBtn = makeButton(this, cx - half / 2 - 5, y + BUTTON_H.md / 2, t(loc, 'result.share'),
      () => this.session.shareResult(share), { width: half, height: BUTTON_H.md });
    // Без кнопки награды главное действие — тренировка.
    const practice = makeButton(this, cx + half / 2 + 5, y + BUTTON_H.md / 2, t(loc, 'menu.practice'),
      () => this.playLevel(nextLevel(loadProgress(SLUG), LADDER_SIZE)),
      { width: half, height: BUTTON_H.md, primary: !claimable });
    this.appear(shareBtn.root, 680);
    this.appear(practice.root, 680);
    y += BUTTON_H.md + 10;
    const menu = makeButton(this, cx, y + BUTTON_H.md / 2, uiText(loc, 'result.menu'), () => this.scene.start('MainMenu'),
      { width: CARD_W, height: BUTTON_H.md });
    this.appear(menu.root, 740);
    return claimAt;
  }

  private label(x: number, y: number, s: string, size: number, color: string, weight: string = WEIGHT.regular) {
    return this.add.text(x, y, s, { fontFamily: FONT, fontSize: size, fontStyle: weight, color }).setResolution(DPR);
  }

  private playLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('mode', 'practice');
    this.scene.start('Game');
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    if (!motionAllowed()) return;
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}

interface Settled {
  total: number;
  balance: number;
  awardFrom: { x: number; y: number };
}
