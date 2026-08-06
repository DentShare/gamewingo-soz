import { loadProgress, recordLevel } from './progress.js';
import { recordRound } from './missions.js';
import { recordStats } from './achievements.js';
import { loadBests, recordBests, type BestsResult } from './records.js';

/**
 * Испытания — прогрессия игр без раскладов (аркады, 2048). У них уровень
 * нечем «сгенерировать»: забег всегда один и тот же, растёт только мастерство.
 * Вместо лестницы уровней — лестница испытаний: рукотворные задачи от механики
 * («15 яблок без стен», «512 без отката»), закрываемые в обычном забеге.
 *
 * Хранение переиспользует лестницу (`recordLevel`): испытание n — это уровень n,
 * закрытое испытание всегда стоит три звезды. Так весь мета-слой — задания дня,
 * достижения, бонусы за «первое прохождение уровня», сводка звёзд каталога —
 * работает без единой правки.
 */

export interface ChallengeDef {
  /** Порядковый номер (1-based) — он же номер уровня в хранилище. */
  n: number;
  /** Ключ строки интерфейса: игра рендерит t(`challenge.${id}`, { n: target }). */
  id: string;
  /** Метрика забега, по которой судится испытание. */
  metric: string;
  /** Порог: испытание закрыто, когда метрика ≥ порога. */
  target: number;
}

/** Собирает список испытаний из компактной таблицы [id, metric, target]. */
export function buildChallenges(table: ReadonlyArray<readonly [string, string, number]>): ChallengeDef[] {
  return table.map(([id, metric, target], i) => ({ n: i + 1, id, metric, target }));
}

export interface ChallengeState extends ChallengeDef {
  done: boolean;
  /** Открыто для выполнения: первое невыполненное после закрытых. */
  active: boolean;
}

/** Испытания с текущим состоянием — то, что рисует меню. */
export function challengeStates(slug: string, defs: readonly ChallengeDef[]): ChallengeState[] {
  const progress = loadProgress(slug);
  let activeSeen = false;
  return defs.map((def) => {
    const done = (progress.stars[def.n - 1] ?? 0) > 0;
    const active = !done && !activeSeen;
    if (active) activeSeen = true;
    return { ...def, done, active };
  });
}

export interface ArcadeRoundResult {
  /** Испытания, закрытые этим забегом (в порядке номеров). */
  closed: ChallengeDef[];
  /** Рекорды по метрикам забега. */
  records: BestsResult;
}

/**
 * Единая точка записи аркадного забега: испытания, рекорды, счётчики дня
 * и статистика каталога.
 *
 * Испытания закрываются каскадом: если забег выполнил условия сразу
 * нескольких подряд, закроются все — хороший забег не должен упираться
 * в «сначала откройте предыдущее».
 */
export function recordArcadeRound(input: {
  slug: string;
  defs: readonly ChallengeDef[];
  /** Метрики забега: eaten, lengthMax, distance… — по ним судятся испытания и рекорды. */
  metrics: Record<string, number>;
  score: number;
}): ArcadeRoundResult {
  const progress = loadProgress(input.slug);
  const closed: ChallengeDef[] = [];

  let prevDone = true; // первое испытание открыто всегда
  for (const def of input.defs) {
    const done = (progress.stars[def.n - 1] ?? 0) > 0;
    if (!done && prevDone && (input.metrics[def.metric] ?? 0) >= def.target) {
      recordLevel(input.slug, def.n, 3, Math.max(0, input.score));
      closed.push(def);
      prevDone = true;
    } else {
      prevDone = done;
    }
  }

  // Забег один — счёт в день и статистику идёт один раз, сколько бы испытаний
  // ни закрылось; уровни и звёзды считаются по числу закрытых.
  const outcome = {
    slug: input.slug,
    cleared: closed.length > 0,
    levelsCleared: closed.length,
    stars: closed.length * 3,
    score: Math.max(0, input.score),
  };
  recordRound(outcome);
  recordStats(outcome);

  const records = recordBests(input.slug, { ...input.metrics, score: input.score });
  return { closed, records };
}

/* ── Вехи ──────────────────────────────────────────────────────────────────── */

/**
 * Веха — разовая награда за естественную шкалу механики (длина 20, дистанция
 * 1000, плитка 512). В отличие от испытаний вехи не дают звёзд и не обрывают
 * партию — только бонус и ощущение движения.
 */
export interface MilestoneDef {
  id: string;
  metric: string;
  target: number;
  reward: number;
}

/** Собирает вехи из компактной таблицы [id, metric, target, reward]. */
export function buildMilestones(
  table: ReadonlyArray<readonly [string, string, number, number]>,
): MilestoneDef[] {
  return table.map(([id, metric, target, reward]) => ({ id, metric, target, reward }));
}

export interface MilestoneState extends MilestoneDef {
  achieved: boolean;
}

/** Вехи с достигнутостью — по личным рекордам игры. */
export function milestoneStates(slug: string, defs: readonly MilestoneDef[]): MilestoneState[] {
  const bests = loadBests(slug);
  return defs.map((def) => ({ ...def, achieved: (bests[def.metric] ?? 0) >= def.target }));
}

/** Первая недостигнутая веха — её показывает меню как «следующую цель». */
export function nextMilestone(states: readonly MilestoneState[]): MilestoneState | null {
  return states.find((m) => !m.achieved) ?? null;
}
