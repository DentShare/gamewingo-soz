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
  locale: Locale;
  score: number;
  hits: number;
  maxCombo: number;
  durationMs: number;
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
    const session = this.registry.get('session') as Session | undefined;
    const last = (this.registry.get('lastGame') as LastGame | undefined)
      ?? { locale: 'ru' as Locale, score: 0, hits: 0, maxCombo: 0, durationMs: 0 };
    const loc = last.locale;

    const isNewBest = saveBest({
      score: last.score, hits: last.hits, maxCombo: last.maxCombo, durationMs: last.durationMs,
    });
    if (isNewBest && last.score > 0) {
      confetti({ disableForReducedMotion: true, particleCount: 110, spread: 75, origin: { y: 0.4 } });
    }

    const title = this.add
      .text(CX, 112, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 100, ease: 'Back.easeOut' });

    // Крупный итог — главное число экрана.
    this.appear(
      this.add
        .text(CX, 186, t(loc, 'result.score', { score: last.score }), {
          fontFamily: FONT, fontSize: 38, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      420,
    );
    this.appear(
      this.add
        .text(CX, 230, t(loc, 'result.hits', { hits: last.hits, combo: last.maxCombo }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      490,
    );
    if (isNewBest && last.score > 0) {
      this.appear(
        this.add
          .text(CX, 266, t(loc, 'result.newBest'), {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        550,
      );
    }

    // Мгновенный рестарт — главная кнопка аркады.
    const again = makeButton(this, CX, 336, t(loc, 'result.playAgain'), () => this.scene.start('Game'), {
      primary: true, width: 264, height: 58,
    });
    this.appear(again.root, 610);
    const menu = makeButton(this, CX, 404, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 680);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 470, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 496, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 750);
    this.appear(listText, 790);
    void session?.leaderboard(5).then((entries) => {
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
