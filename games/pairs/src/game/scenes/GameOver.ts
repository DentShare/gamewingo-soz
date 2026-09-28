import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow, makeBonusChip, playSound, makePhoenix } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  settleLadderRound, starsFor, loadProgress, isUnlocked, type RecordResult, type Stars,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  locale: Locale;
  pairs: number;
  pairsFound: number;
  moves: number;
  durationMs: number;
  /** Уровень пройден: собраны все пары, лимиты ходов и времени не исчерпаны. */
  cleared: boolean;
}

const CX = 200;
const SLUG = 'pairs';

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

    const level = levelAt(last.level);
    let score = 0;
    let starCount = 0;
    if (last.cleared) {
      score = computeScore({ pairs: last.pairs, moves: last.moves, durationMs: last.durationMs });
      starCount = starsFor(level.goals, last.moves);
    }
    // Итог одним вызовом: лестница, счётчики дня и бонусы — уровень, глава, уровень дня, задания.
    const { record, bonus } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: last.cleared, stars: (starCount || 1) as Stars, score,
    });
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


    if (last.cleared) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    const title = this.add
      .text(CX, 96, t(loc, last.cleared ? 'result.title' : 'result.failed'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    this.add
      .text(CX, 134, last.daily ? t(loc, 'result.dailyLevel') : t(loc, 'result.level', { n: last.level, total: LADDER_SIZE }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Звёзды выезжают с отскоком: заработанные золотые, остальные бледные.
    playSound(last.cleared ? 'win' : 'lose');

    // Маскот каталога реагирует на итог: радуется победе, никнет при провале.
    const phoenix = makePhoenix(this, 322, 648, 84, { facing: 'left' });
    this.time.delayedCall(320, () => (last.cleared ? phoenix.celebrate() : phoenix.sink()));
    this.events.once('shutdown', () => phoenix.destroy());
    // Звёзды звенят по очереди — итог читается на слух, не только глазами.
    for (let i = 0; i < starCount; i++) {
      this.time.delayedCall(340 + i * 160, () => playSound('star'));
    }
    const stars = makeStarRow(this, CX, 186, starCount, 22).setScale(0);
    this.tweens.add({ targets: stars, scale: 1, duration: 380, delay: 300, ease: 'Back.easeOut' });

    const sec = Math.floor(last.durationMs / 1000);
    const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    this.appear(
      this.add
        .text(CX, 240, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      520,
    );
    this.appear(
      this.add
        .text(CX, 274, t(loc, 'result.moves', { moves: last.moves, time }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      580,
    );

    const hint = this.hintText(loc, last, record);
    if (hint) {
      this.appear(
        this.add
          .text(CX, 308, hint, { fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(DPR),
        640,
      );
    }

    this.buildButtons(loc, last);
    this.buildLeaderboard(loc, session);
  }

  /** Кнопки итога: следующий уровень (если открылся), повтор, меню. */
  private buildButtons(loc: Locale, last: LastGame) {
    const nextN = last.level + 1;
    const hasNext = !last.daily && last.cleared && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = 366;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN), {
        primary: true,
      });
      this.appear(next.root, 700);
      y += 50;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level, last.daily), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 760 : 700);
    y += 50;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 820 : 770);
  }

  private play(n: number, daily = false) {
    this.registry.set('level', n);
    // Уровень дня переигрывается тем же раскладом: зерно в реестре осталось с меню.
    this.registry.set('mode', daily ? 'dailyLevel' : 'level');
    this.scene.start('Game');
  }

  /** Одна строка о том, что изменилось: открылся уровень, побит рекорд или стоит попробовать снова. */
  private hintText(loc: Locale, last: LastGame, record: RecordResult | null): string {
    if (!last.cleared) return t(loc, 'result.tryAgain');
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
    this.appear(lbTitle, 860);
    this.appear(listText, 900);
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
