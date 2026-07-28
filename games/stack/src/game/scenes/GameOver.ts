import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { saveBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale; score: number; blocks: number; perfects: number; durationMs: number;
}

const CX = 200;

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const session = this.registry.get('session') as Session;
    const last = (this.registry.get('lastGame') as LastGame) ?? {
      locale: 'ru', score: 0, blocks: 0, perfects: 0, durationMs: 0,
    };
    const loc = last.locale;

    const isNewBest = saveBest(last.score);
    if (isNewBest && last.score > 0) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    const title = this.add
      .text(CX, 116, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 28, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 100, ease: 'Back.easeOut' });

    this.appear(
      this.add
        .text(CX, 206, t(loc, 'result.score', { score: last.score }), {
          fontFamily: FONT, fontSize: 42, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      420,
    );
    this.appear(
      this.add
        .text(CX, 252, t(loc, 'result.detail', { blocks: last.blocks, perfects: last.perfects }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      480,
    );
    if (isNewBest && last.score > 0) {
      this.appear(
        this.add
          .text(CX, 288, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        540,
      );
    }

    // Аркада: главная кнопка перезапускает партию мгновенно, без возврата в меню.
    const again = makeButton(this, CX, 366, t(loc, 'result.playAgain'), () => this.scene.start('Game'), {
      primary: true, width: 264, height: 60,
    });
    this.appear(again.root, 600);
    const menu = makeButton(this, CX, 438, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 670);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 508, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 534, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 740);
    this.appear(listText, 780);
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
