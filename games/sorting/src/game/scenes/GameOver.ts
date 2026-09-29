import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeLadderResult, uiText, pluralForm,
} from '../ui';
import { COLORS } from '../palette';
import { computeScore } from '../../core/score';
import { levelAt, levelInfo, LADDER_SIZE, type Phrase } from '../../core/levels';
import {
  settleLadderRound, starsFor, starGap, chapterOf, loadProgress, isUnlocked,
} from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  locale: Locale;
  placed: number;
  mistakes: number;
  durationMs: number;
}

const SLUG = 'sorting';

/**
 * Итог детской партии (T4): звёзды, «почти» до третьей звезды, расшифровка
 * бонусов и кнопка, которая называет, что дальше. Проиграть нельзя: уровень
 * всегда засчитывается, ошибки влияют только на число звёзд — поэтому и
 * «почти» считается по ошибкам. Очков и лидерборда нет.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    setBackHandler(() => this.scene.start('MainMenu'));
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    const level = levelAt(last.level);
    const score = computeScore({ placed: last.placed, mistakes: last.mistakes });
    const stars = starsFor(level.goals, last.mistakes);
    // Итог одним вызовом: лестница, счётчики дня и бонусы с разбивкой.
    // Проиграть нельзя, поэтому партия всегда засчитана.
    const { bonus, lines } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: true, stars, score,
    });

    playSound('win');
    confetti({ disableForReducedMotion: true, particleCount: 110, spread: 80, origin: { y: 0.4 } });

    // «Почти»: на сколько ошибок меньше нужно до третьей звезды — повод переиграть сразу.
    const gap = starGap(level.goals, last.mistakes);

    const nextN = last.level + 1;
    const hasNext = !last.daily && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    const intro = hasNext ? levelInfo(nextN).intro : null;

    const screen = makeLadderResult(this, {
      locale: loc,
      caption: last.daily
        ? uiText(loc, 'result.dailyLevel')
        : uiText(loc, 'result.levelChapter', { n: last.level, k: chapterOf(last.level) }),
      title: t(loc, 'result.title'),
      stars,
      almost: gap && {
        title: uiText(loc, 'result.almostStar', {
          gap: t(loc, `result.gapMistakes.${pluralForm(gap.missing)}`, { n: gap.missing }),
        }),
        // Порог «0 ошибок» звучит странно — для него своя фраза, как в подсказке меню.
        detail: gap.threshold > 0
          ? t(loc, 'result.almostDetail', { n: last.mistakes, need: gap.threshold })
          : t(loc, 'result.almostDetailClean', { n: last.mistakes }),
        againLabel: uiText(loc, 'result.again'),
        onAgain: () => this.play(last.level, last.daily),
      },
      lines,
      total: bonus.total,
      primary: hasNext
        ? {
          label: intro
            ? uiText(loc, 'result.nextIntro', { n: nextN, intro: this.phrase(loc, intro) })
            : uiText(loc, 'result.next', { n: nextN }),
          onClick: () => this.play(nextN),
        }
        : { label: uiText(loc, 'result.again'), onClick: () => this.play(last.level, last.daily) },
      onMenu: () => this.scene.start('MainMenu'),
      // В этой игре проиграть нельзя, поэтому маскот всегда радуется.
      mood: 'happy',
    });

    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1100, () => {
        playSound('coin');
        bonusChip.award(bonus.total, screen.awardFrom.x, screen.awardFrom.y);
      });
    }
  }

  /** Фраза из core → строка на языке игрока. */
  private phrase(loc: Locale, p: Phrase): string {
    return t(loc, p.key, p.vars);
  }

  private play(n: number, daily = false) {
    this.registry.set('level', n);
    // Уровень дня переигрывается тем же раскладом: зерно в реестре осталось с меню.
    this.registry.set('mode', daily ? 'dailyLevel' : 'level');
    this.scene.start('Game');
  }
}
