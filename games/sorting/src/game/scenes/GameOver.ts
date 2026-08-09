import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow, makeBonusChip, playSound, makePhoenix } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  recordLevelResult, starsFor, loadProgress, isUnlocked,
  dailyMissions, grantRoundBonuses, type RecordResult,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  locale: Locale;
  placed: number;
  mistakes: number;
  durationMs: number;
}

const CX = 200;
const SLUG = 'sorting';

/**
 * Итог детской партии. Проиграть нельзя: уровень всегда засчитывается,
 * ошибки влияют только на число звёзд.
 */
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

    const level = levelAt(last.level);
    const score = computeScore({ placed: last.placed, mistakes: last.mistakes });
    const missionsBefore = dailyMissions();
    const stars = starsFor(level.goals, last.mistakes);
    const record = recordLevelResult({ slug: SLUG, n: last.level, stars, score });
    // Бонусы за партию: первый проход уровня + закрывшиеся задания дня.
    const bonus = grantRoundBonuses({ slug: SLUG, n: last.level, record, missionsBefore });
    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(900, () => {
        playSound('coin');
        bonusChip.award(bonus.total, CX, 196);
      });
    }


    confetti({ disableForReducedMotion: true, particleCount: 110, spread: 80, origin: { y: 0.4 } });

    const title = this.add
      .text(CX, 110, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 32, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    this.add
      .text(CX, 150, t(loc, 'result.level', { n: last.level, total: LADDER_SIZE }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    playSound('win');

    // Маскот каталога: в этой игре проиграть нельзя, поэтому он всегда радуется.
    const phoenix = makePhoenix(this, 322, 648, 84, { facing: 'left' });
    this.time.delayedCall(320, () => phoenix.celebrate());
    this.events.once('shutdown', () => phoenix.destroy());
    // Звёзды звенят по очереди — итог читается на слух, не только глазами.
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(340 + i * 160, () => playSound('star'));
    }
    const starRow = makeStarRow(this, CX, 210, stars, 26).setScale(0);
    this.tweens.add({ targets: starRow, scale: 1, duration: 400, delay: 300, ease: 'Back.easeOut' });

    this.appear(
      this.add
        .text(CX, 274, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      460,
    );

    const hint = this.hintText(loc, last, record);
    if (hint) {
      this.appear(
        this.add
          .text(CX, 312, hint, { fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(DPR),
        540,
      );
    }

    this.buildButtons(loc, last);
    void session;
  }

  /** Кнопки итога: следующий уровень (если открылся), повтор, меню. */
  private buildButtons(loc: Locale, last: LastGame) {
    const nextN = last.level + 1;
    const hasNext = nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = 380;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN), {
        primary: true,
      });
      this.appear(next.root, 620);
      y += 56;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 680 : 620);
    y += 56;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 740 : 690);
  }

  private play(n: number) {
    this.registry.set('level', n);
    this.scene.start('Game');
  }

  /** Одна строка о том, что изменилось: открылся уровень или побит рекорд. */
  private hintText(loc: Locale, last: LastGame, record: RecordResult): string {
    if (record.unlockedNext && last.level < LADDER_SIZE) return t(loc, 'result.unlocked', { n: last.level + 1 });
    if (record.isRecord) return t(loc, 'result.newBest');
    return '';
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
