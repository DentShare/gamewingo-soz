import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { LevelId } from '../../core/sudoku';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { saveBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: LevelId; locale: Locale; hints: number; durationMs: number;
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

    const score = computeScore(last);
    const isNewBest = saveBest(last.level, { score, hints: last.hints, durationMs: last.durationMs });

    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });

    // Заголовок с pop-in.
    this.add.text(CX, 100, '🧩', { fontFamily: FONT, fontSize: 40 }).setOrigin(0.5).setResolution(DPR);
    const title = this.add
      .text(CX, 158, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 32, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    const sec = Math.floor(last.durationMs / 1000);
    const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    this.appear(
      this.add
        .text(CX, 226, t(loc, 'result.score', { score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      420,
    );
    this.appear(
      this.add
        .text(CX, 262, `${t(loc, 'result.time', { time })} · 💡 ${last.hints}`, {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      480,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 298, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        540,
      );
    }

    const again = makeButton(this, CX, 368, t(loc, 'result.playAgain'), () => this.scene.start('Game'), { primary: true });
    this.appear(again.root, 620);
    const menu = makeButton(this, CX, 432, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 690);

    // Лидерборд.
    const lbTitle = this.add
      .text(CX, 496, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 522, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
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
