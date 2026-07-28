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
  locale: Locale; score: number; eaten: number; length: number; durationMs: number;
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
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    const isNewBest = saveBest(last.score);
    if (isNewBest) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    const title = this.add
      .text(CX, 112, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 360, delay: 100, ease: 'Back.easeOut' });

    // Счёт — крупно, как в аркаде.
    const score = this.add
      .text(CX, 200, t(loc, 'result.score', { score: last.score }), {
        fontFamily: FONT, fontSize: 40, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.6)
      .setAlpha(0);
    this.tweens.add({ targets: score, scale: 1, alpha: 1, duration: 400, delay: 260, ease: 'Back.easeOut' });

    this.appear(
      this.add
        .text(CX, 248, t(loc, 'result.length', { n: last.length }), {
          fontFamily: FONT, fontSize: 18, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      540,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 292, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 18, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        600,
      );
    }

    // Аркада: «Ещё раз» сразу запускает партию, без промежуточных экранов.
    const again = makeButton(this, CX, 382, t(loc, 'result.playAgain'), () => this.scene.start('Game'), {
      primary: true, width: 248, height: 56,
    });
    this.appear(again.root, 690);
    const menu = makeButton(this, CX, 446, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 760);

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
    this.appear(lbTitle, 830);
    this.appear(listText, 870);
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
