import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow, makeBonusChip, playSound, makePhoenix } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE, perfectCrosses } from '../../core/levels';
import {
  recordLevelResult, starsFor, loadProgress, isUnlocked,
  dailyMissions, grantRoundBonuses, type RecordResult,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  locale: Locale;
  /** Касаний по клеткам за партию — по ним считаются и очки, и звёзды. */
  moves: number;
  undos: number;
  durationMs: number;
}

const CX = 200;
const SLUG = 'sums';

/**
 * Итог партии. Проигрыша в «Суммах» нет: сюда попадают только с сошедшейся доской,
 * поэтому экран говорит не «прошёл или нет», а насколько чисто.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const session = this.registry.get('session') as Session;
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;
    const perfect = perfectCrosses(last.level);

    const score = computeScore({ level: last.level, moves: last.moves });
    // Звёзды меряются лишними касаниями: цель — вычеркнуть точно, а не быстро.
    const extraMoves = Math.max(0, last.moves - perfect);
    const starCount = starsFor(levelAt(last.level).goals, extraMoves);
    const record = recordLevelResult({ slug: SLUG, n: last.level, stars: starCount, score });
    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });

    // Бонусы за партию: первый проход уровня + закрывшиеся задания дня.
    const missionsBefore = dailyMissions();
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

    const title = this.add
      .text(CX, 100, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    this.add
      .text(CX, 138, t(loc, 'result.level', { n: last.level, total: LADDER_SIZE }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    playSound('win');

    // Маскот каталога радуется вместе с игроком.
    const phoenix = makePhoenix(this, 322, 648, 84, { facing: 'left' });
    this.time.delayedCall(320, () => phoenix.celebrate());
    this.events.once('shutdown', () => phoenix.destroy());
    // Звёзды звенят по очереди — итог читается на слух, не только глазами.
    for (let i = 0; i < starCount; i++) {
      this.time.delayedCall(340 + i * 160, () => playSound('star'));
    }
    const stars = makeStarRow(this, CX, 190, starCount, 22).setScale(0);
    this.tweens.add({ targets: stars, scale: 1, duration: 380, delay: 300, ease: 'Back.easeOut' });

    this.appear(
      this.add
        .text(CX, 244, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      420,
    );
    this.appear(
      this.add
        .text(CX, 278, t(loc, 'result.moves', { n: last.moves, best: perfect }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      480,
    );

    const hint = this.hintText(loc, last, perfect, record);
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
    this.buildLeaderboard(loc, session);
  }

  /** Кнопки итога: следующий уровень (если открылся), повтор, меню. */
  private buildButtons(loc: Locale, last: LastGame) {
    const nextN = last.level + 1;
    const hasNext = nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = 366;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN), {
        primary: true,
      });
      this.appear(next.root, 620);
      y += 50;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 680 : 620);
    y += 50;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 740 : 690);
  }

  private play(n: number) {
    this.registry.set('level', n);
    this.scene.start('Game');
  }

  /** Одна строка о том, что изменилось: чистая игра, открытый уровень или рекорд. */
  private hintText(loc: Locale, last: LastGame, perfect: number, record: RecordResult | null): string {
    if (last.moves === perfect) return t(loc, 'result.perfect');
    if (record?.unlockedNext && last.level < LADDER_SIZE) return t(loc, 'result.unlocked', { n: last.level + 1 });
    if (record?.isRecord) return t(loc, 'result.newBest');
    return '';
  }

  private buildLeaderboard(loc: Locale, session: Session) {
    const lbTitle = this.add
      .text(CX, 540, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 566, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 760);
    this.appear(listText, 800);
    void session.leaderboard(5).then((entries) => {
      if (!entries.length) {
        listText.setText(t(loc, 'error.network'));
        return;
      }
      listText.setText(
        entries.map((e) => `${e.rank}. ${e.name}  ${e.score}${e.isCurrentUser ? '  ←' : ''}`).join('\n'),
      );
    });
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
