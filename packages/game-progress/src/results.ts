import { TARIFF, type GrantedBonus } from './bonus.js';
import { computeDayId } from './day.js';
import { dailyMissions, type Mission, type MissionKind } from './missions.js';
import { challengeStates, type ChallengeDef } from './challenges.js';

/**
 * Данные экрана итогов (T4 UX-волны): расшифровка бонусов и «почти» у аркад.
 *
 * «+22» без объяснения ничему не учит. Строки «первое прохождение уровня 3 +24»,
 * «задание дня 2/3 +15» за три партии объясняют экономику каталога. А «почти!
 * 9 из 12 — не хватило 3» — главный мотив нажать «Ещё забег».
 */

export type BonusLineKind =
  | 'level'
  | 'challenge'
  | 'chapter'
  | 'levelOfDay'
  | 'recordWeek'
  | 'daily'
  | 'mission'
  | 'other';

export interface BonusLine {
  kind: BonusLineKind;
  /** Номер уровня, испытания или главы. */
  n?: number;
  amount: number;
  /** Начислено этой партией; `false` — задание продвинулось, но ещё не закрыто. */
  granted: boolean;
  /** Для задания дня: что считает, прогресс и цель. */
  mission?: { kind: MissionKind; progress: number; target: number };
}

/** Ключ кошелька → строка разбивки. Ключи те же, что пишет `awardOnce`. */
function lineOf(g: GrantedBonus, arcade: boolean): BonusLine {
  const num = (re: RegExp) => Number(re.exec(g.key)?.[1]) || undefined;
  if (g.key.startsWith('level-')) {
    return { kind: arcade ? 'challenge' : 'level', n: num(/-(\d+)$/), amount: g.amount, granted: true };
  }
  if (g.key.startsWith('chapter-')) return { kind: 'chapter', n: num(/-(\d+)$/), amount: g.amount, granted: true };
  if (g.key.startsWith('lod-')) return { kind: 'levelOfDay', amount: g.amount, granted: true };
  if (g.key.startsWith('record-week-')) return { kind: 'recordWeek', amount: g.amount, granted: true };
  if (/-daily-\d+$/.test(g.key)) return { kind: 'daily', amount: g.amount, granted: true };
  return { kind: 'other', amount: g.amount, granted: true };
}

/**
 * Разбивка «что начислено и за что». Строки начислений — в порядке выдачи,
 * задания дня — все, что продвинулись этой партией: закрытые с суммой,
 * незакрытые приглушённо с прогрессом «2/3» (+15 ждёт впереди).
 *
 * `missionsBefore` снимается до записи партии, как для `grantRoundBonuses`.
 */
export function bonusBreakdown(input: {
  granted: readonly GrantedBonus[];
  missionsBefore: readonly Mission[];
  /** Аркада: ключи `level-*` — это испытания. */
  arcade?: boolean;
  dayId?: number;
}): BonusLine[] {
  const dayId = input.dayId ?? computeDayId();
  const lines = input.granted
    .filter((g) => !g.key.startsWith('mission-'))
    .map((g) => lineOf(g, !!input.arcade));

  dailyMissions(dayId).forEach((m, i) => {
    const before = input.missionsBefore[i];
    if (before?.done) return;
    if (!m.done && m.progress <= (before?.progress ?? 0)) return;
    lines.push({
      kind: 'mission',
      amount: TARIFF.mission,
      granted: m.done,
      mission: { kind: m.kind, progress: Math.min(m.progress, m.target), target: m.target },
    });
  });
  return lines;
}

/* ── Аркады: «почти» и «следом» ────────────────────────────────────────────── */

export interface ChallengeProgress {
  def: ChallengeDef;
  /** Значение метрики в этом забеге: испытание закрывается одним забегом, лучший результат не в счёт. */
  value: number;
  /** Сколько не хватило до порога (≥ 1). */
  missing: number;
  /** Доля пути 0…1. */
  ratio: number;
  /** Бонус за закрытие — тариф испытания. */
  reward: number;
}

export interface ChallengeOutlook {
  /** Активное испытание, до которого этот забег дотянулся на ≥ 60 %. */
  almost: ChallengeProgress | null;
  /** Последнее закрытое испытание — показывается, когда «почти» нет. */
  lastDone: ChallengeDef | null;
  /** Два следующих незакрытых испытания (без того, что в «почти»). */
  next: ChallengeProgress[];
  /** Сумма бонусов двух следующих — «до +29». */
  nextReward: number;
}

/** Порог «почти»: меньше — это не «почти», а обычный забег. */
export const ALMOST_RATIO = 0.6;

const progressOf = (def: ChallengeDef, value: number): ChallengeProgress => ({
  def,
  value,
  missing: Math.max(1, Math.ceil(def.target - value)),
  ratio: def.target > 0 ? Math.max(0, Math.min(1, value / def.target)) : 1,
  reward: TARIFF.level(def.n),
});

/**
 * Что показать на итогах забега. Зовётся после `recordArcadeRound`: состояние
 * испытаний уже включает этот забег. «Следом» — прогресс этого же забега: испытание
 * закрывается одним забегом и по порядку, так что лучший результат прошлых забегов
 * («20 / 20» у ещё не открытого испытания) только сбивал бы с толку.
 */
export function challengeOutlook(
  slug: string,
  defs: readonly ChallengeDef[],
  run: Record<string, number>,
): ChallengeOutlook {
  const states = challengeStates(slug, defs);
  const active = states.find((s) => s.active) ?? null;

  let almost: ChallengeProgress | null = null;
  if (active) {
    const p = progressOf(active, run[active.metric] ?? 0);
    if (p.ratio >= ALMOST_RATIO) almost = p;
  }
  const done = states.filter((s) => s.done);
  const lastDone = done.length ? done[done.length - 1] : null;

  const next = states
    .filter((s) => !s.done && s.n !== almost?.def.n)
    .slice(0, 2)
    .map((s) => progressOf(s, run[s.metric] ?? 0));
  return {
    almost,
    lastDone: lastDone ? { n: lastDone.n, id: lastDone.id, metric: lastDone.metric, target: lastDone.target } : null,
    next,
    nextReward: next.reduce((sum, p) => sum + p.reward, 0),
  };
}
