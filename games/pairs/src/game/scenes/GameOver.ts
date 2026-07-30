import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  recordLevelResult, recordEndlessResult, starsFor, loadProgress, isUnlocked, type RecordResult,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
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
    let record: RecordResult | null = null;

    if (last.cleared) {
      score = computeScore({ pairs: last.pairs, moves: last.moves, durationMs: last.durationMs });
      const stars = starsFor(level.goals, last.moves);
      starCount = stars;
      record = recordLevelResult({ slug: SLUG, n: last.level, stars, score });
    } else {
      // Проваленный уровень в лестницу не пишется, но идёт в счётчики дня — игрок всё же играл.
      recordEndlessResult(SLUG, 0);
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
      .text(CX, 134, t(loc, 'result.level', { n: last.level, total: LADDER_SIZE }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Звёзды выезжают с отскоком: заработанные золотые, остальные бледные.
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
    const hasNext = last.cleared && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = 366;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN), {
        primary: true,
      });
      this.appear(next.root, 700);
      y += 50;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 760 : 700);
    y += 50;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 820 : 770);
  }

  private play(n: number) {
    this.registry.set('level', n);
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
