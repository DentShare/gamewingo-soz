import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow, makeBonusChip, playSound, makePhoenix } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import { pictureById } from '../../core/pictures';
import { BASE_FRAME, ensurePictureTexture } from '../picture';
import {
  recordLevelResult, starsFor, loadProgress, isUnlocked,
  dailyMissions, grantRoundBonuses, type RecordResult,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  level: number;
  pieces: number;
  wrongDrops: number;
  durationMs: number;
  score: number;
  picture: string;
}

const CX = 200;
const SLUG = 'jigsaw';
/** Собранная картинка на экране истории. */
const PIC = 168;

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const session = this.registry.get('session') as Session | undefined;
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;
    const picture = pictureById(last.picture);

    const missionsBefore = dailyMissions();
    // Проиграть в пазле нельзя: собрал — значит прошёл. Звёзды меряются промахами.
    const stars = starsFor(levelAt(last.level).goals, last.wrongDrops);
    const record: RecordResult = recordLevelResult({
      slug: SLUG, n: last.level, stars, score: last.score,
    });
    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.35 } });

    // Бонусы за партию: первый проход уровня + закрывшиеся задания дня.
    const bonus = grantRoundBonuses({ slug: SLUG, n: last.level, record, missionsBefore });
    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1200, () => {
        playSound('coin');
        bonusChip.award(bonus.total, CX, 150);
      });
    }

    // Собранная картинка целиком — то, чем ребёнок только что гордится.
    const key = ensurePictureTexture(this, last.picture);
    const image = this.add.image(CX, 150, key, BASE_FRAME).setDisplaySize(PIC, PIC).setScale(0);
    this.tweens.add({
      targets: image,
      scaleX: PIC / image.width, scaleY: PIC / image.height,
      duration: 420, ease: 'Back.easeOut',
    });

    const title = this.add
      .text(CX, 262, picture.title[loc], {
        fontFamily: FONT, fontSize: 24, color: COLORS.storyTitle, fontStyle: 'bold',
        align: 'center', wordWrap: { width: 340 },
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 320, delay: 320 });

    // История про картинку — главная награда за сборку.
    const story = this.add
      .text(CX, 296, picture.story[loc], {
        fontFamily: FONT, fontSize: 16, color: COLORS.storyInk,
        align: 'center', wordWrap: { width: 328 }, lineSpacing: 4,
      })
      .setOrigin(0.5, 0)
      .setResolution(DPR)
      .setAlpha(0);
    this.tweens.add({ targets: story, alpha: 1, duration: 380, delay: 480 });

    const afterStory = 296 + story.height + 22;

    // Проиграть в пазле нельзя: собранная картинка — всегда победа.
    playSound('win');

    // Маскот каталога: в этой игре проиграть нельзя, поэтому он всегда радуется.
    const phoenix = makePhoenix(this, 322, 648, 84, { facing: 'left' });
    this.time.delayedCall(320, () => phoenix.celebrate());
    this.events.once('shutdown', () => phoenix.destroy());
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(680 + i * 160, () => playSound('star'));
    }
    const starRow = makeStarRow(this, CX, afterStory, stars, 20).setScale(0);
    this.tweens.add({ targets: starRow, scale: 1, duration: 380, delay: 640, ease: 'Back.easeOut' });

    this.add
      .text(CX, afterStory + 30, t(loc, 'result.detail', {
        pieces: last.pieces, misses: last.wrongDrops,
      }), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    this.buildButtons(loc, last, afterStory + 60);
    void session;
  }

  /** Кнопки итога: следующая картинка (если открылась), собрать ещё раз, меню. */
  private buildButtons(loc: Locale, last: LastGame, top: number) {
    const nextN = last.level + 1;
    const hasNext = nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = top;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN), {
        primary: true,
      });
      this.appear(next.root, 720);
      y += 52;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 780 : 720);
    y += 52;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 840 : 780);
  }

  private play(n: number) {
    this.registry.set('level', n);
    this.scene.start('Game');
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
