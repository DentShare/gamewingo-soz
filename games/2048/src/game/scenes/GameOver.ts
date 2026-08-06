import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton, applyTheme, setupCamera, makeStarRow, makeBonusChip,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { CHALLENGES, MILESTONES } from '../../core/challenges';
import {
  recordArcadeRound, milestoneStates, grantArcadeBonuses, dailyMissions,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  score: number;
  maxTile: number;
  moves: number;
  durationMs: number;
  tile256in220: number;
  tile512in400: number;
  tile1024in800: number;
}

const CX = 200;
const SLUG = '2048';

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

    // Запись забега: испытания каскадом, рекорды, счётчики дня.
    // Задания дня снимаем ДО записи — иначе не увидеть, что закрылось сейчас.
    const missionsBefore = dailyMissions();
    const round = recordArcadeRound({
      slug: SLUG,
      defs: CHALLENGES,
      metrics: {
        score: last.score, maxTile: last.maxTile, moves: last.moves,
        tile256in220: last.tile256in220, tile512in400: last.tile512in400,
        tile1024in800: last.tile1024in800,
      },
      score: last.score,
    });

    // Бонусы: испытания по тарифу уровня, свежие вехи, задания дня.
    const bonus = grantArcadeBonuses({
      slug: SLUG,
      closed: round.closed,
      milestones: milestoneStates(SLUG, MILESTONES),
      missionsBefore,
    });
    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(900, () => bonusChip.award(bonus.total, CX, 210));
    }

    const isRecord = round.records.improved.includes('score');
    if (round.closed.length || isRecord) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    const title = this.add
      .text(CX, 96, t(loc, 'result.run'), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    this.appear(
      this.add
        .text(CX, 148, t(loc, 'result.score', { score: last.score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      260,
    );
    this.appear(
      this.add
        .text(CX, 182, `${t(loc, 'result.detail', { tile: last.maxTile, moves: last.moves })}${isRecord ? ` · ${t(loc, 'result.newBest')}` : ''}`, {
          fontFamily: FONT, fontSize: 16, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      320,
    );

    // Закрытые этим забегом испытания — по строке с тремя звёздами.
    let y = 236;
    if (round.closed.length) {
      this.appear(
        this.add
          .text(CX, y, t(loc, 'result.closed'), {
            fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        380,
      );
      y += 30;
      for (const [i, ch] of round.closed.slice(0, 3).entries()) {
        const row = this.add.container(CX, y);
        const text = this.add
          .text(-24, 0, t(loc, `challenge.${ch.id}`), {
            fontFamily: FONT, fontSize: 15, color: COLORS.headText,
          })
          .setOrigin(0.5, 0.5)
          .setResolution(DPR);
        row.add(text);
        row.add(makeStarRow(this, text.width / 2 + 12, 0, 3, 7));
        this.appear(row, 420 + i * 60);
        y += 28;
      }
    }

    this.buildButtons(loc, Math.max(y + 24, 330));
    void session;
  }

  private buildButtons(loc: Locale, top: number) {
    const again = makeButton(this, CX, top + 30, t(loc, 'result.playAgain'), () => this.scene.start('Game'), {
      primary: true,
    });
    this.appear(again.root, 600);
    const menu = makeButton(this, CX, top + 86, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, 660);
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
