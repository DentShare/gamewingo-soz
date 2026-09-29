import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeLadderResult, uiText, pluralForm, motionAllowed,
} from '../ui';
import { COLORS } from '../palette';
import { levelAt, levelInfo, LADDER_SIZE, type Phrase } from '../../core/levels';
import { pictureById } from '../../core/pictures';
import { BASE_FRAME, ensurePictureTexture } from '../picture';
import {
  settleLadderRound, starsFor, starGap, chapterOf, loadProgress, isUnlocked,
} from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  pieces: number;
  wrongDrops: number;
  durationMs: number;
  score: number;
  picture: string;
}

const SLUG = 'jigsaw';
/** Собранная картинка над итогом — то, чем ребёнок только что гордится. */
const PIC = 76;
const PIC_Y = 50;
/** Верх колонки итога — под картинкой. */
const TOP = PIC_Y + PIC / 2 + 12;

/**
 * Итог картинки (T4, раздел 1d аудита): собранная картинка, звёзды, «почти»
 * до третьей звезды, история про картинку, расшифровка бонусов и кнопка,
 * которая называет следующую картинку. Очков и лидерборда нет.
 *
 * Проиграть в пазле нельзя: собрал — значит прошёл. Звёзды меряются промахами.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    // Системный «назад» с экрана итогов — в меню игры.
    setBackHandler(() => this.scene.start('MainMenu'));
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;
    const picture = pictureById(last.picture);

    const level = levelAt(last.level);
    const stars = starsFor(level.goals, last.wrongDrops);
    // Итог одним вызовом: лестница, счётчики дня и бонусы с разбивкой.
    const { bonus, lines } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: true, stars, score: last.score,
    });

    playSound('win');
    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.35 } });

    // Картинка целиком — награда за сборку; под ней весь итог.
    const key = ensurePictureTexture(this, last.picture);
    const image = this.add.image(200, PIC_Y, key, BASE_FRAME).setDisplaySize(PIC, PIC);
    if (motionAllowed()) {
      const sx = image.scaleX;
      const sy = image.scaleY;
      image.setScale(0);
      this.tweens.add({ targets: image, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' });
    }

    // «Почти»: сколько промахов лишние до третьей звезды — повод собрать ещё раз.
    const gap = starGap(level.goals, last.wrongDrops);

    const nextN = last.level + 1;
    const hasNext = !last.daily && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    const intro = hasNext ? levelInfo(nextN).intro : null;

    const screen = makeLadderResult(this, {
      locale: loc,
      caption: last.daily
        ? uiText(loc, 'result.dailyLevel')
        : t(loc, 'result.pictureChapter', { n: last.level, k: chapterOf(last.level) }),
      title: t(loc, 'result.title'),
      stars,
      // Провала в пазле не бывает, поэтому под звёздами — название и история картинки.
      // Короткое название первой строкой ещё и держит длинную историю подальше от маскота.
      note: `${picture.title[loc]}\n${picture.story[loc]}`,
      almost: gap && {
        title: uiText(loc, 'result.almostStar', {
          gap: t(loc, `result.gapMisses.${pluralForm(gap.missing)}`, { n: gap.missing }),
        }),
        detail: gap.threshold > 0
          ? t(loc, 'result.almostDetail', { misses: last.wrongDrops, need: gap.threshold })
          : t(loc, 'result.almostDetailFlawless', { misses: last.wrongDrops }),
        againLabel: uiText(loc, 'result.again'),
        onAgain: () => this.play(last.level, last.daily),
      },
      lines,
      total: bonus.total,
      primary: hasNext
        ? {
          label: intro
            ? t(loc, 'result.nextPictureIntro', { n: nextN, intro: this.phrase(loc, intro) })
            : t(loc, 'game.level', { n: nextN }),
          onClick: () => this.play(nextN),
        }
        : { label: uiText(loc, 'result.again'), onClick: () => this.play(last.level, last.daily) },
      onMenu: () => this.scene.start('MainMenu'),
      // Маскот в этой игре всегда радуется: проиграть нельзя.
      mood: 'happy',
    }, TOP);

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
