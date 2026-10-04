import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeLadderResult, uiText, pluralForm,
} from '../ui';
import { COLORS } from '../palette';
import { computeScore } from '../../core/score';
import { levelAt, levelInfo, formatSec, LADDER_SIZE, type Phrase } from '../../core/levels';
import {
  settleLadderRound, starsFor, starGap, chapterOf, loadProgress, isUnlocked, type Stars,
} from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  locale: Locale;
  moves: number;
  durationMs: number;
  /** Поле собрано до исчерпания лимитов ходов и времени. */
  cleared: boolean;
  /** Плиток на своих местах к концу партии — «докуда дошли» при провале. */
  inPlace?: number;
  /** Плиток на поле всего (без пустой клетки). */
  tiles?: number;
}

const SLUG = 'fifteen';

/**
 * Итог уровня (T4, раздел 1d аудита): звёзды, «почти» до третьей звезды,
 * расшифровка бонусов и кнопка, которая называет, что дальше. Очков и
 * лидерборда нет: звёзды считаются по ходам, а топ по уровню ничего не значит.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    // Системный «назад» с экрана итогов — в меню игры.
    setBackHandler(() => this.scene.start('MainMenu'));
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    const level = levelAt(last.level);
    const score = last.cleared ? computeScore({ level: last.level, moves: last.moves, durationMs: last.durationMs }) : 0;
    const starCount = last.cleared ? starsFor(level.goals, last.moves) : 0;
    // Итог одним вызовом: лестница, счётчики дня и бонусы с разбивкой.
    const { bonus, lines } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: last.cleared, stars: (starCount || 1) as Stars, score,
    });

    playSound(last.cleared ? 'win' : 'lose');
    if (last.cleared) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    // «Почти»: сколько ходов не хватило до третьей звезды — повод переиграть сразу.
    const gap = last.cleared ? starGap(level.goals, last.moves) : null;
    const time = formatSec(Math.floor(last.durationMs / 1000));

    const nextN = last.level + 1;
    const hasNext = !last.daily && last.cleared && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    const intro = hasNext ? levelInfo(nextN).intro : null;

    const screen = makeLadderResult(this, {
      locale: loc,
      caption: last.daily
        ? uiText(loc, 'result.dailyLevel')
        : uiText(loc, 'result.levelChapter', { n: last.level, k: chapterOf(last.level) }),
      title: t(loc, last.cleared ? 'result.title' : 'result.failed'),
      stars: starCount,
      // Провал — докуда дошли: «На месте плиток: 11 из 15».
      note: last.cleared || last.inPlace === undefined || !last.tiles
        ? undefined
        : t(loc, 'result.inPlaceOf', { k: last.inPlace, n: last.tiles }),
      almost: gap && {
        title: uiText(loc, 'result.almostStar', {
          gap: t(loc, `result.gapMoves.${pluralForm(gap.missing)}`, { n: gap.missing }),
        }),
        detail: t(loc, 'result.almostDetail', { moves: last.moves, need: gap.threshold, time }),
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
      mood: last.cleared ? 'happy' : 'sad',
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
