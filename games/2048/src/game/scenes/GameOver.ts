import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, darken } from '../ui';
import { COLORS, FONT, tileColor, tileTextColor, tileFontSize } from '../palette';
import { saveBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale; score: number; maxTile: number; moves: number; durationMs: number; won: boolean;
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

    const isNewBest = saveBest(last.score);

    // Конфетти — только при собранной плитке 2048.
    if (last.won) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    // Заголовок с pop-in.
    const title = this.add
      .text(CX, 96, t(loc, last.won ? 'result.titleWon' : 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    // Лучшая плитка партии — с отскоком.
    this.buildMaxTile(last.maxTile);

    this.appear(
      this.add
        .text(CX, 262, t(loc, 'result.score', { n: last.score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5),
      520,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 302, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5),
        600,
      );
    }

    const again = makeButton(this, CX, 372, t(loc, 'result.playAgain'), () => this.scene.start('Game'), { primary: true });
    this.appear(again.root, 700);
    const menu = makeButton(this, CX, 436, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 770);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 498, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const listText = this.add
      .text(CX, 524, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
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

  /** Лучшая плитка партии в стиле игрового поля. */
  private buildMaxTile(value: number) {
    const size = 88;
    const cont = this.add.container(CX, 178).setScale(0);
    const g = this.add.graphics();
    g.fillStyle(darken(tileColor(value), 0.18), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, 14);
    g.fillStyle(tileColor(value), 1).fillRoundedRect(-size / 2, -size / 2, size, size, 14);
    const txt = this.add
      .text(0, 0, String(value), {
        fontFamily: FONT, fontSize: tileFontSize(value) + 2, color: tileTextColor(value), fontStyle: 'bold',
      })
      .setOrigin(0.5);
    cont.add([g, txt]);
    this.tweens.add({ targets: cont, scale: 1, duration: 340, delay: 320, ease: 'Back.easeOut' });
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
