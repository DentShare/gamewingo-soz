import { buildChallenges, buildMilestones } from '@gamewingo/game-progress';

/**
 * Прогрессия «Полёта» — от механики: забег один и тот же, растёт мастерство.
 * Испытания дают звёзды, вехи проёмов — бонусы, рекорды — повод переиграть.
 */

/** Метрики одного полёта; по ним судятся испытания и вехи. */
export interface RunMetrics {
  /** Пройдено проёмов. */
  passed: number;
  /** Сколько секунд продержался в воздухе. */
  survivedSec: number;
  /** Итоговые очки (проёмы + бонус за время). */
  score: number;
}

/** Пятнадцать испытаний: проёмы, выживание и очки чередуются. */
export const CHALLENGES = buildChallenges([
  ['pass3', 'passed', 3],
  ['pass6', 'passed', 6],
  ['survive30', 'survivedSec', 30],
  ['pass10', 'passed', 10],
  ['survive45', 'survivedSec', 45],
  ['pass15', 'passed', 15],
  ['score2000', 'score', 2000],
  ['pass20', 'passed', 20],
  ['survive75', 'survivedSec', 75],
  ['pass26', 'passed', 26],
  ['score3500', 'score', 3500],
  ['pass33', 'passed', 33],
  ['survive120', 'survivedSec', 120],
  ['pass40', 'passed', 40],
  ['pass45', 'passed', 45],
]);

export const CHALLENGES_TOTAL = CHALLENGES.length;

/** Вехи по проёмам — естественная шкала полёта. Награда растёт со ступенью. */
export const MILESTONES = buildMilestones([
  ['pass5', 'passed', 5, 10],
  ['pass10', 'passed', 10, 12],
  ['pass15', 'passed', 15, 15],
  ['pass20', 'passed', 20, 18],
  ['pass26', 'passed', 26, 21],
  ['pass33', 'passed', 33, 24],
  ['pass40', 'passed', 40, 27],
  ['pass50', 'passed', 50, 30],
]);
