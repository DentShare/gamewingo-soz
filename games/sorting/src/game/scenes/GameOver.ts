import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Mode } from '../../core/sorting';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore, stars } from '../../core/score';
import { saveBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  mode: Mode; locale: Locale; placed: number; mistakes: number; durationMs: number;
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
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    const score = computeScore(last);
    const starCount = stars(last.mistakes);
    const isNewBest = saveBest(last.mode, {
      score, mistakes: last.mistakes, durationMs: last.durationMs,
    });

    // Проиграть нельзя — конфетти получает каждый.
    confetti({ disableForReducedMotion: true, particleCount: 110, spread: 78, origin: { y: 0.4 } });

    const title = this.add
      .text(CX, 104, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 34, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    // Звёзды (заполненные/пустые) — по очереди с отскоком.
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .text(CX + (i - 1) * 64, 186, i < starCount ? '⭐' : '☆', { fontFamily: FONT, fontSize: 46 })
        .setOrigin(0.5)
        .setResolution(DPR)
        .setScale(0);
      this.tweens.add({ targets: star, scale: 1, duration: 320, delay: 300 + i * 130, ease: 'Back.easeOut' });
    }

    this.appear(
      this.add
        .text(CX, 258, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      520,
    );
    this.appear(
      this.add
        .text(CX, 294, t(loc, 'result.mistakes', { n: last.mistakes }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      580,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 328, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        640,
      );
    }

    const again = makeButton(this, CX, 394, t(loc, 'result.playAgain'), () => this.scene.start('Game'), { primary: true });
    this.appear(again.root, 700);
    const menu = makeButton(this, CX, 456, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 770);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 518, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 544, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 840);
    this.appear(listText, 880);
    void (session?.leaderboard(5) ?? Promise.resolve([])).then((entries) => {
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
