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
  /** Пройденные проёмы. */
  passed: number;
  durationMs: number;
  score: number;
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
    const last = (this.registry.get('lastGame') as LastGame) ?? {
      locale: 'ru', passed: 0, durationMs: 0, score: 0,
    };
    const loc = last.locale;
    const isNewBest = saveBest(last.score);

    if (isNewBest) confetti({ disableForReducedMotion: true, particleCount: 110, spread: 75, origin: { y: 0.4 } });

    const title = this.add
      .text(CX, 108, t(loc, 'result.title'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 360, delay: 100, ease: 'Back.easeOut' });

    const hero = this.add
      .text(CX, 176, '🚀', { fontSize: 46 })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setRotation(Math.PI / 4)
      .setScale(0);
    this.tweens.add({ targets: hero, scale: 1, duration: 340, delay: 240, ease: 'Back.easeOut' });

    const sec = Math.floor(last.durationMs / 1000);
    const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

    this.appear(
      this.add
        .text(CX, 246, t(loc, 'result.score', { score: last.score }), {
          fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      420,
    );
    this.appear(
      this.add
        .text(CX, 286, t(loc, 'result.detail', { passed: last.passed, time }), {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      480,
    );
    if (isNewBest) {
      this.appear(
        this.add
          .text(CX, 320, `🏆 ${t(loc, 'result.newBest')}`, {
            fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        540,
      );
    }

    // Мгновенный рестарт — главная кнопка экрана.
    const again = makeButton(this, CX, 388, t(loc, 'result.playAgain'), () => this.playAgain(), { primary: true });
    this.appear(again.root, 580);
    const menu = makeButton(this, CX, 452, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 650);

    const lbTitle = this.add
      .text(CX, 516, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, 542, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 720);
    this.appear(listText, 760);
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

  /** «Ещё раз» — сразу новая партия, без возврата в меню. */
  private playAgain() {
    this.scene.start('Game');
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
