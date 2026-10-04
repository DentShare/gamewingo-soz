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
export * from './chapters.js';
export * from './hub.js';
export * from './results.js';
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

import { chapterLevels } from './ladder.js';
import { dailyMissions, type Mission } from './missions.js';
import {
  bonusBalance, grantArcadeBonuses, grantChapterClears, grantLevelOfDay, grantRecordWeek, grantRoundBonuses,
  type RoundBonuses,
} from './bonus.js';
import { recordArcadeRound, type ArcadeRoundResult, type ChallengeDef } from './challenges.js';
import { loadBests } from './records.js';
import { bonusBreakdown, challengeOutlook, type BonusLine, type ChallengeOutlook } from './results.js';
import { markDailyLevelDone } from './chapters.js';
import { computeDayId } from './day.js';

export interface LadderRound {
  slug: string;
  /** Уровень лестницы — для уровня дня это уровень, чьи параметры взяты. */
  n: number;
  /** Уровней в лестнице — по ним нарезаются главы. */
  total: number;
  mode: 'level' | 'dailyLevel';
  cleared: boolean;
  stars: Stars;
  score: number;
  /** Задания дня ДО записи результата — иначе не увидеть, какие закрылись сейчас. */
  missionsBefore?: Mission[];
  dayId?: number;
}

export interface LadderRoundResult {
  /** Запись в лестницу; null — уровень дня или провал. */
  record: RecordResult | null;
  bonus: RoundBonuses;
  /** Разбивка для экрана итогов: за что начислено и какие задания продвинулись. */
  lines: BonusLine[];
}

/**
 * Итог партии лестничной игры одним вызовом: лестница, счётчики дня, бонусы —
 * первое прохождение, закрытая глава, уровень дня, задания дня. Экран итога
 * получает готовую разбивку начисленного и не знает правил экономики.
 *
 * Уровень дня в лестницу не пишется: это тот же уровень с другим раскладом,
 * он не должен открывать следующий. В счётчики дня идёт как сыгранная партия.
 */
export function settleLadderRound(input: LadderRound): LadderRoundResult {
  const dayId = input.dayId ?? computeDayId();
  const missionsBefore = input.missionsBefore ?? dailyMissions(dayId);
  const daily = input.mode === 'dailyLevel';

  let record: RecordResult | null = null;
  if (input.cleared && !daily) {
    record = recordLevelResult({ slug: input.slug, n: input.n, stars: input.stars, score: input.score });
  } else {
    recordEndlessResult(input.slug, input.cleared ? input.score : 0);
  }

  const bonus = grantRoundBonuses({ slug: input.slug, n: input.n, record, missionsBefore, dayId });
  const extra = [];
  if (record) {
    const stars = record.progress.stars;
    extra.push(...grantChapterClears(
      input.slug,
      chapterLevels(input.total).map((levels) => ({ levels })),
      (n) => (stars[n - 1] ?? 0) > 0,
    ));
  }
  if (daily && input.cleared) {
    markDailyLevelDone(input.slug, dayId);
    const lod = grantLevelOfDay(input.slug, dayId);
    if (lod) extra.push(lod);
  }
  if (extra.length) {
    bonus.granted.push(...extra);
    bonus.total += extra.reduce((sum, g) => sum + g.amount, 0);
    bonus.balance = bonusBalance();
  }
  return { record, bonus, lines: bonusBreakdown({ granted: bonus.granted, missionsBefore, dayId }) };
}

export interface ArcadeRound {
  slug: string;
  defs: readonly ChallengeDef[];
  /** Метрики забега — по ним судятся испытания, рекорды и «почти». */
  metrics: Record<string, number>;
  score: number;
  missionsBefore?: Mission[];
  dayId?: number;
}

export interface ArcadeRoundSettled {
  round: ArcadeRoundResult;
  bonus: RoundBonuses;
  lines: BonusLine[];
  outlook: ChallengeOutlook;
  /** Рекорды до забега — для «рекорд 20» и «Новый рекорд · 23». */
  bestsBefore: Record<string, number>;
}

/**
 * Итог аркадного забега одним вызовом (T4): испытания каскадом, рекорды, счётчики
 * дня, бонусы — испытания по тарифу уровня, неделя рекордов (побит свой, не первый
 * рекорд очков), задания дня — и данные «почти / следом» для экрана итогов.
 * Вехи бонусов больше не дают: одна шкала — испытания.
 */
export function settleArcadeRound(input: ArcadeRound): ArcadeRoundSettled {
  const dayId = input.dayId ?? computeDayId();
  const missionsBefore = input.missionsBefore ?? dailyMissions(dayId);
  const bestsBefore = loadBests(input.slug);
  const round = recordArcadeRound({ slug: input.slug, defs: input.defs, metrics: input.metrics, score: input.score });
  const bonus = grantArcadeBonuses({ slug: input.slug, closed: round.closed, missionsBefore, dayId });
  if (round.records.improved.includes('score') && (bestsBefore.score ?? 0) > 0) {
    const week = grantRecordWeek(dayId);
    if (week) {
      bonus.granted.push(week);
      bonus.total += week.amount;
      bonus.balance = bonusBalance();
    }
  }
  return {
    round,
    bonus,
    lines: bonusBreakdown({ granted: bonus.granted, missionsBefore, arcade: true, dayId }),
    outlook: challengeOutlook(input.slug, input.defs, { ...input.metrics, score: input.score }),
    bestsBefore,
  };
}
