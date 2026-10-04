import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeKidsResult } from '../ui';
import { COLORS } from '../palette';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import { settleLadderRound, starsFor, loadProgress, isUnlocked, type Stars } from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  locale: Locale;
  hints: number;
  durationMs: number;
  mistakes: number;
  /** Поле заполнено верно до исчерпания лимита ошибок и времени. */
  cleared: boolean;
  /** Верно заполнено пустых клеток — докуда дошли при провале. */
  filled?: number;
  /** Сколько клеток было пустыми в начале. */
  toFill?: number;
}

const SLUG = 'sudoku-kids';

/**
 * Итог детской партии (T8, раздел 1g аудита): звёзды крупно, феникс и одна
 * большая кнопка «дальше» — без очков, лидерборда и текста: ребёнок 3–6 лет
 * не читает. На поздних уровнях есть лимит ошибок и таймер, поэтому провал
 * возможен: тогда звёзд нет, феникс грустит, а «дальше» переигрывает тот же уровень.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    // Системный «назад» с экрана итогов — в меню игры.
    setBackHandler(() => this.scene.start('MainMenu'));
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;

    const level = levelAt(last.level);
    // Звёзды судоку меряются временем: цель — решить быстро, а не просто решить.
    const sec = Math.floor(last.durationMs / 1000);
    const score = last.cleared ? computeScore({ level: last.level, durationMs: last.durationMs, hints: last.hints }) : 0;
    const starCount = last.cleared ? starsFor(level.goals, sec) : 0;
    // Итог одним вызовом: лестница, счётчики дня и бонусы. Бонусы — как раньше:
    // это доход родителя, ребёнок видит только прилёт на чип баланса.
    const { bonus } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: last.cleared, stars: (starCount || 1) as Stars, score,
    });

    playSound(last.cleared ? 'win' : 'lose');
    if (last.cleared) {
      confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });
    }

    // «Дальше»: пройден — следующий уровень, если открыт, иначе в меню;
    // провал — тот же уровень ещё раз.
    const nextN = last.level + 1;
    const hasNext = !last.daily && last.cleared && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    const onNext = () => {
      if (!last.cleared) this.play(last.level, last.daily);
      else if (hasNext) this.play(nextN);
      else this.scene.start('MainMenu');
    };
    makeKidsResult(this, { stars: starCount, onNext, mood: last.cleared ? 'happy' : 'sad' });
    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1100, () => {
        playSound('coin');
        // «+N» вылетает от звёзд.
        bonusChip.award(bonus.total, 200, 360);
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
