import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { LevelId } from '../../core/deck';
import { t } from '../../i18n';
import { makeButton, applyTheme } from '../ui';
import { COLORS, FONT } from '../palette';
import { computeScore, stars } from '../../core/score';
import { saveBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: LevelId; locale: Locale; pairs: number; moves: number; durationMs: number;
}

const CX = 200;

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const session = this.registry.get('session') as Session;
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    const score = computeScore(last);
    const starCount = stars(last.pairs, last.moves);
    const isNewBest = saveBest(last.level, { score, moves: last.moves, durationMs: last.durationMs });

    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });

    // Заголовок с pop-in.
    const title = this.add
      .text(CX, 96, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    // Звёзды (заполненные/пустые) — по очереди с отскоком.
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .text(CX + (i - 1) * 64, 176, i < starCount ? '⭐' : '☆', { fontFamily: FONT, fontSize: 44 })
        .setOrigin(0.5)
        .setScale(0);
      this.tweens.add({ targets: star, scale: 1, duration: 320, delay: 300 + i * 130, ease: 'Back.easeOut' });
    }

    const sec = Math.floor(last.durationMs / 1000);
    const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    this.appear(
      this.add
        .text(CX, 246, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5),
      520,
    );
    this.appear(
      this.add
        .text(CX, 282, t(loc, 'result.moves', { moves: last.moves, time }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5),
      580,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 316, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5),
        640,
      );
    }

    const again = makeButton(this, CX, 386, t(loc, 'result.playAgain'), () => this.scene.start('Game'), { primary: true });
    this.appear(again.root, 700);
    const menu = makeButton(this, CX, 450, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 770);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 512, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const listText = this.add
      .text(CX, 538, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0);
    this.appear(lbTitle, 840);
    this.appear(listText, 880);
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
