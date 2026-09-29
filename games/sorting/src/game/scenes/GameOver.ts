import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeKidsResult } from '../ui';
import { COLORS } from '../palette';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import { settleLadderRound, starsFor, loadProgress, isUnlocked } from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  locale: Locale;
  placed: number;
  mistakes: number;
  durationMs: number;
}

const SLUG = 'sorting';

/**
 * Итог детской партии (T8, раздел 1g аудита): три звезды крупно, феникс
 * радуется и одна большая кнопка «дальше». Проиграть нельзя, очков,
 * лидерборда и текста нет — ребёнок 3–6 лет не читает.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    setBackHandler(() => this.scene.start('MainMenu'));
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;

    const level = levelAt(last.level);
    const score = computeScore({ placed: last.placed, mistakes: last.mistakes });
    const stars = starsFor(level.goals, last.mistakes);
    // Итог одним вызовом: лестница, счётчики дня и бонусы с разбивкой.
    // Проиграть нельзя, поэтому партия всегда засчитана.
    const { bonus } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: true, stars, score,
    });

    playSound('win');
    confetti({ disableForReducedMotion: true, particleCount: 110, spread: 80, origin: { y: 0.4 } });

    // Детский итог (T8): три звезды, феникс радуется, одна кнопка «дальше».
    // Следующий уровень, если он есть; после последнего — снова с первого,
    // где не хватает звёзд. Бонусы начисляются как обычно — это доход родителя.
    const nextN = last.level + 1;
    const hasNext = !last.daily && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    makeKidsResult(this, { stars, onNext: () => (hasNext ? this.play(nextN) : this.scene.start('MainMenu')) });
    const screen = { awardFrom: { x: 200, y: 360 } };

    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1100, () => {
        playSound('coin');
        bonusChip.award(bonus.total, screen.awardFrom.x, screen.awardFrom.y);
      });
    }
  }

  private play(n: number, daily = false) {
    this.registry.set('level', n);
    // Уровень дня переигрывается тем же раскладом: зерно в реестре осталось с меню.
    this.registry.set('mode', daily ? 'dailyLevel' : 'level');
    this.scene.start('Game');
  }
}
