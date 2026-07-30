import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeStarRow } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  recordLevelResult, recordEndlessResult, starsFor, loadProgress, isUnlocked, type RecordResult,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  level: number;
  score: number;
  durationMs: number;
  /** Забег без цели — в лестницу не пишется. */
  endless: boolean;
}

const CX = 200;
const SLUG = 'snake';

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

    const level = levelAt(last.level);
    const target = level.params.target;
    const cleared = !last.endless && last.score >= target;

    let starCount = 0;
    let record: RecordResult | null = null;
    if (cleared) {
      const stars = starsFor(level.goals, last.score);
      starCount = stars;
      record = recordLevelResult({ slug: SLUG, n: last.level, stars, score: last.score });
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    } else {
      // Недобранная цель и бесконечный забег в лестницу не идут, но день считают.
      recordEndlessResult(SLUG, last.score);
    }

    const titleKey = last.endless ? 'result.endless' : cleared ? 'result.title' : 'result.failed';
    const title = this.add
      .text(CX, 100, t(loc, titleKey), {
        fontFamily: FONT, fontSize: 30, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });

    if (!last.endless) {
      this.add
        .text(CX, 138, t(loc, 'result.level', { n: last.level, total: LADDER_SIZE }), {
          fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);

      const stars = makeStarRow(this, CX, 190, starCount, 22).setScale(0);
      this.tweens.add({ targets: stars, scale: 1, duration: 380, delay: 300, ease: 'Back.easeOut' });
    }

    this.appear(
      this.add
        .text(CX, 246, t(loc, 'result.score', { score: last.score }), {
          fontFamily: FONT, fontSize: 26, color: COLORS.headText, fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      460,
    );

    const hint = this.hintText(loc, last, cleared, target, record);
    if (hint) {
      this.appear(
        this.add
          .text(CX, 284, hint, { fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(DPR),
        520,
      );
    }

    this.buildButtons(loc, last, cleared);
    void session;
  }

  /** Кнопки итога: следующий уровень (если открылся), повтор, меню. */
  private buildButtons(loc: Locale, last: LastGame, cleared: boolean) {
    const nextN = last.level + 1;
    const hasNext = cleared && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    let y = 360;

    if (hasNext) {
      const next = makeButton(this, CX, y, t(loc, 'result.nextLevel', { n: nextN }), () => this.play(nextN, false), {
        primary: true,
      });
      this.appear(next.root, 600);
      y += 56;
    }

    const again = makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.play(last.level, last.endless), {
      primary: !hasNext,
    });
    this.appear(again.root, hasNext ? 660 : 600);
    y += 56;

    const menu = makeButton(this, CX, y, t(loc, 'result.menu'), () => this.scene.start('MainMenu'));
    this.appear(menu.root, hasNext ? 720 : 670);
  }

  private play(n: number, endless: boolean) {
    this.registry.set('level', n);
    this.registry.set('endless', endless);
    this.scene.start('Game');
  }

  /** Одна строка о том, что изменилось: открылся уровень, побит рекорд или сколько не хватило. */
  private hintText(
    loc: Locale,
    last: LastGame,
    cleared: boolean,
    target: number,
    record: RecordResult | null,
  ): string {
    if (last.endless) return '';
    if (!cleared) return t(loc, 'result.goalMissed', { n: target });
    if (record?.unlockedNext && last.level < LADDER_SIZE) return t(loc, 'result.unlocked', { n: last.level + 1 });
    if (record?.isRecord) return t(loc, 'result.newBest');
    return '';
  }

  /** Появление снизу вверх с fade. */
  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
