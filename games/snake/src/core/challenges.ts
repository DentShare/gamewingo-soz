import { buildChallenges, buildMilestones } from '@gamewingo/game-progress';

/**
 * Прогрессия змейки — от механики, а не от искусственных «уровней»:
 * забег всегда один и тот же, растёт мастерство. Испытания дают звёзды,
 * вехи длины — бонусы, рекорды — повод переиграть.
 */

/** Метрики одного забега; по ним судятся испытания и вехи. */
export interface RunMetrics {
  /** Съедено еды за забег. */
  eaten: number;
  /** Максимальная длина змейки. */
  lengthMax: number;
  /** Сколько секунд прожил забег. */
  survivedSec: number;
  /** Максимум еды, съеденной в скользящее окно 12 секунд, — «жор». */
  feast12: number;
}

/**
 * Пятнадцать испытаний: аппетит, длина, выживание, темп и жор чередуются,
 * чтобы подряд не стояли две одинаковые задачи. `speedcap` — 20 еды, после
 * которых тик достигает пола скорости (см. tickMs в core/snake.ts).
 */
export const CHALLENGES = buildChallenges([
  ['eat5', 'eaten', 5],
  ['len12', 'lengthMax', 12],
  ['survive45', 'survivedSec', 45],
  ['eat12', 'eaten', 12],
  ['feast3', 'feast12', 3],
  ['len20', 'lengthMax', 20],
  ['survive90', 'survivedSec', 90],
  ['speedcap', 'eaten', 20],
  ['feast4', 'feast12', 4],
  ['len28', 'lengthMax', 28],
  ['eat30', 'eaten', 30],
  ['survive150', 'survivedSec', 150],
  ['feast5', 'feast12', 5],
  ['len38', 'lengthMax', 38],
  ['eat45', 'eaten', 45],
]);

export const CHALLENGES_TOTAL = CHALLENGES.length;

/** Вехи длины — естественная шкала змейки. Награда растёт со ступенью. */
export const MILESTONES = buildMilestones([
  ['len10', 'lengthMax', 10, 10],
  ['len15', 'lengthMax', 15, 12],
  ['len20', 'lengthMax', 20, 15],
  ['len25', 'lengthMax', 25, 18],
  ['len30', 'lengthMax', 30, 21],
  ['len35', 'lengthMax', 35, 24],
  ['len40', 'lengthMax', 40, 27],
  ['len45', 'lengthMax', 45, 30],
]);
