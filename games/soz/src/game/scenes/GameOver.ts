import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Row } from '../../core/gameState';
import { t } from '../../i18n';
import {
  applyTheme, setupCamera, makeBonusChip, playSound, setBackHandler, makePhoenix, motionAllowed,
  makeLadderResult, makeBonusBreakdown, makeChipRow, makeButton, uiText, pluralForm,
  C, S, TYPE, WEIGHT, RADIUS, BUTTON_H, LOGICAL_W, LOGICAL_H, type Button,
} from '../ui';
import { COLORS, FONT, paletteFor } from '../palette';
import { DPR } from '../dpr';
import { buildShareText } from '../share';
import { loadDaily, saveDaily, getHighContrast } from '../../core/persistence';
import { currentStreak } from '../../bridge/demo';
import type { Session } from '../../bridge/session';
import { levelAt, LADDER_SIZE, DAILY_PARAMS } from '../../core/levels';
import {
  settleLadderRound, starsFor, starGap, chapterOf, loadProgress, isUnlocked, recordEndlessResult,
  dailyMissions, grantRoundBonuses, awardOnce, bonusBalance, bonusBreakdown, TARIFF, type Stars,
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
const GAP = 16;
/** Кнопки прижаты к низу вёрстки 720, если колонка короче: большой палец дотягивается. */
const ACTIONS_Y = LOGICAL_H - 150;
/** Плитка мини-сетки слова дня. */
const TILE = 15;
const TILE_GAP = 3;

/**
 * Итоги (T4 UX-волны). Уровень тренировки — экран лестницы по эталону «Найди
 * пару»: звёзды по попыткам, «почти», бонусы, следующий уровень; очков и
 * лидерборда нет. Слово дня — свой экран из тех же кусков: попытки и серия
 * чипами, мини-сетка ответов, бонус дня, компактный топ (только если сервер
 * его дал) и «Поделиться» — переиграть слово дня нельзя.
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
    const cx = LOGICAL_W / 2;
    const top = 56;

    // Шапка — как у экрана лестницы: подпись режима и заголовок итога.
    const cap = this.label(cx, top, t(loc, 'menu.daily'), TYPE.body, S.muted).setOrigin(0.5, 0);
    const title = this.label(cx, top + 24, t(loc, won ? 'result.won' : 'result.lost'), 30, S.ink, WEIGHT.bold)
      .setOrigin(0.5, 0);
    this.appear(cap, 60);
    if (motionAllowed()) {
      title.setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });
    }
    const phoenix = makePhoenix(this, cx + 150, top + 40, 60, { facing: 'left' });
    this.time.delayedCall(320, () => (won ? phoenix.celebrate() : phoenix.sink()));
    this.events.once('shutdown', () => phoenix.destroy());
    let y = top + 24 + title.height + 10;

    // Вместо звёзд — попытки; серия решённых слов дня — рядом.
    const streak = currentStreak();
    const chipLabels = [t(loc, 'result.guesses', { n: last.guessesUsed, max: DAILY_PARAMS.guesses })];
    if (won && streak >= 1) chipLabels.push(t(loc, 'result.streak', { n: streak }));
    const chips = makeChipRow(this, cx, y, chipLabels);
    this.appear(chips.root, 260);
    y += chips.height + GAP;

    const grid = this.miniGrid(cx, y, last.rows);
    this.appear(grid.root, 340);
    y += grid.height + GAP;

    if (!won) {
      const note = this.label(cx, y - 4, t(loc, 'result.answerWas', { word: last.answer }), TYPE.body, S.muted)
        .setOrigin(0.5, 0);
      this.appear(note, 420);
      y += note.height + GAP;
    }

    const b = makeBonusBreakdown(this, cx, y, { locale: loc, lines: settled.lines, total: settled.total });
    if (b.height) {
      this.appear(b.root, 500);
      y += b.height + GAP;
    }

    const actionsY = Math.max(y + 4, ACTIONS_Y);
    this.dailyActions(cx, actionsY);
    // Топ слова дня — в просвете между бонусами и кнопками, только с данными сервера.
    this.leaderboard(cx, y, actionsY - GAP);

    return {
      total: settled.total,
      balance: settled.balance,
      awardFrom: b.height ? b.totalAt : { x: cx, y: top + 90 },
    };
  }

  /** Мини-сетка ответов: цвета плиток без букв — то же, что уходит в «Поделиться». */
  private miniGrid(cx: number, y: number, rows: Row[]): { root: Phaser.GameObjects.Container; height: number } {
    const root = this.add.container(cx, y);
    const pal = paletteFor(getHighContrast());
    const g = this.add.graphics();
    rows.forEach((r, ri) => {
      const w = r.statuses.length * (TILE + TILE_GAP) - TILE_GAP;
      r.statuses.forEach((s, ci) => {
        g.fillStyle(pal[s], 1).fillRoundedRect(-w / 2 + ci * (TILE + TILE_GAP), ri * (TILE + TILE_GAP), TILE, TILE, 3);
      });
    });
    root.add(g);
    return { root, height: rows.length ? rows.length * (TILE + TILE_GAP) - TILE_GAP : 0 };
  }

  /**
   * Кнопки слова дня: награда приложения, пока не забрана, потом «Поделиться»;
   * ниже «В меню». Переиграть слово дня нельзя — «Ещё раз» здесь нет.
   */
  private dailyActions(cx: number, y: number) {
    const last = this.last;
    const loc = last.locale;
    const share = buildShareText(last.rows, {
      solved: last.solved, guessesUsed: last.guessesUsed,
      dayId: last.dayId, title: t(loc, 'app.title'),
    });
    const doShare = () => this.session.shareResult(share);
    const claimable = last.solved && !last.rewardClaimed;
    let onPrimary = claimable ? () => this.session.claim(`soz-daily-${last.dayId}`) : doShare;

    const primary: Button = makeButton(
      this, cx, y + BUTTON_H.lg / 2, t(loc, claimable ? 'result.claim' : 'result.share'), () => onPrimary(),
      { primary: true, width: CARD_W, height: BUTTON_H.lg },
    );
    this.appear(primary.root, 620);
    const menu = makeButton(
      this, cx, y + BUTTON_H.lg + 10 + BUTTON_H.md / 2, uiText(loc, 'result.menu'), () => this.scene.start('MainMenu'),
      { width: CARD_W, height: BUTTON_H.md },
    );
    this.appear(menu.root, 680);

    if (!claimable) return;
    const off = this.session.onReward((r) => {
      if (!r.granted) return;
      onPrimary = doShare;
      primary.setLabel(t(loc, 'result.claimed', { points: r.points ?? 0 }));
      this.tweens.add({ targets: primary.root, scale: 1.05, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
      // Показали, сколько начислено, — и кнопка становится «Поделиться».
      this.time.delayedCall(1600, () => primary.setLabel(t(loc, 'result.share')));
      const saved = loadDaily(loc, last.dayId);
      if (saved) saveDaily(loc, last.dayId, { ...saved, rewardClaimed: true });
    });
    this.events.once('shutdown', off);
  }

  /**
   * Компактный топ слова дня: сколько строк влезает в просвет над кнопками.
   * Нет данных сервера (дев, офлайн) — не показываем ничего, а не «ошибку сети».
   */
  private leaderboard(cx: number, top: number, bottom: number) {
    const loc = this.last.locale;
    const HEAD = 22;
    const ROW = 22;
    const PAD = 8;
    const fits = Math.floor((bottom - top - HEAD - PAD * 2) / ROW);
    if (fits < 1) return;
    void this.session?.leaderboard(5).then((entries) => {
      if (!entries.length || !this.scene.isActive()) return;
      const shown = entries.slice(0, fits);
      const root = this.add.container(cx - CARD_W / 2, top);
      const head = this.label(4, 0, t(loc, 'result.leaderboard'), TYPE.caption, S.muted, WEIGHT.semibold);
      const h = PAD * 2 + shown.length * ROW;
      const g = this.add.graphics();
      g.fillStyle(C.surface, 1).fillRoundedRect(0, HEAD, CARD_W, h, RADIUS.card);
      g.lineStyle(1, C.divider, 0.6).strokeRoundedRect(0, HEAD, CARD_W, h, RADIUS.card);
      root.add([head, g]);
      shown.forEach((e, i) => {
        const ry = HEAD + PAD + i * ROW + 2;
        const color = e.isCurrentUser ? S.primary : S.ink;
        const weight = e.isCurrentUser ? WEIGHT.bold : WEIGHT.regular;
        const name = this.label(16, ry, `${e.rank}. ${e.name}`, TYPE.body - 1, color, weight);
        const score = this.label(CARD_W - 16, ry, String(e.score), TYPE.body - 1, color, WEIGHT.semibold).setOrigin(1, 0);
        // Длинное имя режем с многоточием, чтобы не заехало на счёт.
        const maxW = CARD_W - 16 - score.width - 28;
        for (let s = name.text; name.width > maxW && s.length > 1;) {
          s = s.slice(0, -1);
          name.setText(`${s.trimEnd()}…`);
        }
        root.add([name, score]);
      });
      this.appear(root, 0);
    });
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
