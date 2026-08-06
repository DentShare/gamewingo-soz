import { buildChallenges, buildMilestones } from '@gamewingo/game-progress';

/**
 * Прогрессия «Башни» — от механики: забег один и тот же, растёт мастерство.
 * Испытания дают звёзды, вехи высоты — бонусы, рекорды — повод переиграть.
 */

/** Метрики одной партии; по ним судятся испытания и вехи. */
export interface RunMetrics {
  /** Поставлено блоков (без фундамента) — высота башни. */
  blocks: number;
  /** Идеальных попаданий за партию. */
  perfects: number;
  /** Максимальная серия идеальных подряд. */
  perfectStreak: number;
  /** Серверный счёт партии (100 за блок + 50 за идеал). */
  score: number;
}

/** Пятнадцать испытаний: высота, точность и серии чередуются. */
export const CHALLENGES = buildChallenges([
  ['blocks8', 'blocks', 8],
  ['perfect3', 'perfects', 3],
  ['blocks14', 'blocks', 14],
  ['streak2', 'perfectStreak', 2],
  ['blocks20', 'blocks', 20],
  ['perfect8', 'perfects', 8],
  ['blocks26', 'blocks', 26],
  ['streak4', 'perfectStreak', 4],
  ['blocks33', 'blocks', 33],
  ['perfect14', 'perfects', 14],
  ['blocks40', 'blocks', 40],
  ['streak6', 'perfectStreak', 6],
  ['blocks48', 'blocks', 48],
  ['perfect20', 'perfects', 20],
  ['blocks60', 'blocks', 60],
]);

export const CHALLENGES_TOTAL = CHALLENGES.length;

/** Вехи по высоте башни. Награда растёт со ступенью. */
export const MILESTONES = buildMilestones([
  ['blocks10', 'blocks', 10, 10],
  ['blocks15', 'blocks', 15, 12],
  ['blocks20', 'blocks', 20, 15],
  ['blocks26', 'blocks', 26, 18],
  ['blocks33', 'blocks', 33, 21],
  ['blocks40', 'blocks', 40, 24],
  ['blocks50', 'blocks', 50, 27],
  ['blocks60', 'blocks', 60, 30],
]);
