import { buildChallenges, buildMilestones } from '@gamewingo/game-progress';

/**
 * Прогрессия «Меткого глаза» — от механики: раунд всегда 60 секунд, растёт
 * мастерство. Испытания дают звёзды, вехи очков — бонусы, рекорды — повод
 * переиграть.
 */

/** Метрики одного раунда; по ним судятся испытания и вехи. */
export interface RunMetrics {
  /** Итоговые очки раунда. */
  score: number;
  /** Попаданий за раунд. */
  hits: number;
  /** Лучшая серия попаданий подряд. */
  maxCombo: number;
}

/** Пятнадцать испытаний: попадания, очки и серии чередуются. */
export const CHALLENGES = buildChallenges([
  ['hits10', 'hits', 10],
  ['score1200', 'score', 1200],
  ['combo5', 'maxCombo', 5],
  ['hits20', 'hits', 20],
  ['score2500', 'score', 2500],
  ['combo10', 'maxCombo', 10],
  ['hits30', 'hits', 30],
  ['score4000', 'score', 4000],
  ['combo15', 'maxCombo', 15],
  ['hits42', 'hits', 42],
  ['score5500', 'score', 5500],
  ['combo20', 'maxCombo', 20],
  ['hits55', 'hits', 55],
  ['score7000', 'score', 7000],
  ['score9000', 'score', 9000],
]);

export const CHALLENGES_TOTAL = CHALLENGES.length;

/** Вехи по очкам раунда. Награда растёт со ступенью. */
export const MILESTONES = buildMilestones([
  ['score1000', 'score', 1000, 10],
  ['score2000', 'score', 2000, 12],
  ['score3000', 'score', 3000, 15],
  ['score4200', 'score', 4200, 18],
  ['score5500', 'score', 5500, 21],
  ['score7000', 'score', 7000, 24],
  ['score8000', 'score', 8000, 27],
  ['score9000', 'score', 9000, 30],
]);
