import { buildChallenges, buildMilestones } from '@gamewingo/game-progress';

/**
 * Прогрессия «2048» — от механики: у игры есть естественная лестница, номинал
 * плитки, и партию больше не обрывает искусственная «цель уровня». Играется
 * одна долгая партия; испытания дают звёзды, вехи номиналов — бонусы.
 */

/** Метрики одной партии; по ним судятся испытания и вехи. */
export interface RunMetrics {
  /** Итоговый счёт партии. */
  score: number;
  /** Старший собранный номинал. */
  maxTile: number;
  /** Сделано ходов. */
  moves: number;
  /** 1, если 256 собрана не позднее 220-го хода (иначе 0). */
  tile256in220: number;
  /** 1, если 512 собрана не позднее 400-го хода. */
  tile512in400: number;
  /** 1, если 1024 собрана не позднее 800-го хода. */
  tile1024in800: number;
}

/** Пятнадцать испытаний: номиналы, счёт и скорость сборки чередуются. */
export const CHALLENGES = buildChallenges([
  ['tile64', 'maxTile', 64],
  ['tile128', 'maxTile', 128],
  ['score1800', 'score', 1800],
  ['tile256', 'maxTile', 256],
  ['score3600', 'score', 3600],
  ['fast256', 'tile256in220', 1],
  ['tile512', 'maxTile', 512],
  ['score7500', 'score', 7500],
  ['fast512', 'tile512in400', 1],
  ['tile1024', 'maxTile', 1024],
  ['score15000', 'score', 15_000],
  ['fast1024', 'tile1024in800', 1],
  ['score22000', 'score', 22_000],
  ['tile2048', 'maxTile', 2048],
  ['score30000', 'score', 30_000],
]);

export const CHALLENGES_TOTAL = CHALLENGES.length;

/** Вехи по номиналу — та самая естественная лестница 2048. */
export const MILESTONES = buildMilestones([
  ['tile128', 'maxTile', 128, 10],
  ['tile256', 'maxTile', 256, 13],
  ['tile512', 'maxTile', 512, 16],
  ['tile1024', 'maxTile', 1024, 21],
  ['tile2048', 'maxTile', 2048, 30],
]);
