/**
 * @gamewingo/game-progress
 * Общая «кампания» каталога: лестница уровней с разблокировкой и звёздами,
 * задания дня и достижения. Чистая логика без Phaser и DOM — из браузерных API
 * трогает только localStorage, и то через безопасную обёртку.
 */
export * from './ladder.js';
export * from './arcade.js';
export * from './progress.js';
export * from './day.js';
export * from './missions.js';
export * from './achievements.js';
export * from './bonus.js';
export * from './records.js';
export * from './challenges.js';
export * from './config/index.js';

import type { Stars } from './ladder.js';
import { recordLevel, type RecordResult } from './progress.js';
import { recordRound } from './missions.js';
import { recordStats } from './achievements.js';

export interface LevelOutcome {
  slug: string;
  n: number;
  stars: Stars;
  score: number;
}

/**
 * Единая точка записи итога уровня: лестница игры, счётчики дня и статистика каталога.
 * Игре достаточно одного вызова — иначе легко забыть обновить один из трёх слоёв.
 */
export function recordLevelResult(outcome: LevelOutcome): RecordResult {
  const result = recordLevel(outcome.slug, outcome.n, outcome.stars, outcome.score);
  const round = { slug: outcome.slug, cleared: true, stars: outcome.stars, score: outcome.score };
  recordRound(round);
  recordStats(round);
  return result;
}

/**
 * Итог партии без уровня — забег в бесконечном режиме аркады. В лестницу не пишется,
 * но в задания дня и достижения идёт: игрок всё равно играл.
 */
export function recordEndlessResult(slug: string, score: number): void {
  const round = { slug, cleared: false, stars: 0, score };
  recordRound(round);
  recordStats(round);
}
