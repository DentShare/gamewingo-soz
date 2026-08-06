import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildChallenges, buildMilestones, challengeStates, milestoneStates, nextMilestone,
  recordArcadeRound,
} from './challenges.js';
import { loadBests, recordBests } from './records.js';
import { loadProgress, totalStars } from './progress.js';
import { loadCounters } from './missions.js';
import { loadStats } from './achievements.js';
import { grantArcadeBonuses, bonusBalance, TARIFF } from './bonus.js';
import { dailyMissions } from './missions.js';

const SLUG = 'snake';

const DEFS = buildChallenges([
  ['eat5', 'eaten', 5],
  ['len10', 'lengthMax', 10],
  ['eat12', 'eaten', 12],
  ['len15', 'lengthMax', 15],
]);

beforeEach(() => localStorage.clear());

describe('records: личные рекорды', () => {
  it('рекорды только растут', () => {
    expect(recordBests(SLUG, { score: 100, lengthMax: 12 }).improved).toEqual(['score', 'lengthMax']);
    const second = recordBests(SLUG, { score: 80, lengthMax: 20 });
    expect(second.improved).toEqual(['lengthMax']);
    expect(loadBests(SLUG)).toEqual({ score: 100, lengthMax: 20 });
  });

  it('битое хранилище не роняет чтение', () => {
    localStorage.setItem(`wingo:best:${SLUG}`, '{"score":"мусор","x":3}');
    expect(loadBests(SLUG)).toEqual({ x: 3 });
  });
});

describe('recordArcadeRound: испытания', () => {
  it('слабый забег ничего не закрывает, но пишет день и рекорды', () => {
    const res = recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 2, lengthMax: 7 }, score: 20 });
    expect(res.closed).toEqual([]);
    expect(loadCounters().score).toBe(20);
    expect(loadCounters().levels).toBe(0);
    expect(loadBests(SLUG).lengthMax).toBe(7);
  });

  it('хороший забег закрывает каскад подряд идущих испытаний', () => {
    const res = recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 13, lengthMax: 14 }, score: 130 });
    // eat5 ✓, len10 ✓, eat12 ✓; len15 — нет (14 < 15).
    expect(res.closed.map((c) => c.id)).toEqual(['eat5', 'len10', 'eat12']);
    expect(totalStars(loadProgress(SLUG))).toBe(9);
    // День и статистика: забег один, уровней три, очки один раз.
    expect(loadCounters().levels).toBe(3);
    expect(loadCounters().stars).toBe(9);
    expect(loadCounters().score).toBe(130);
    expect(loadStats().levels).toBe(3);
  });

  it('каскад не перепрыгивает невыполненное испытание', () => {
    // eaten 13 закрывает eat5 и eat12 по условию, но len10 (n=2) не выполнен —
    // eat12 (n=3) остаётся заблокированным.
    const res = recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 13, lengthMax: 4 }, score: 130 });
    expect(res.closed.map((c) => c.id)).toEqual(['eat5']);
  });

  it('закрытое испытание не закрывается повторно', () => {
    recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 6, lengthMax: 4 }, score: 60 });
    const again = recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 9, lengthMax: 4 }, score: 90 });
    expect(again.closed).toEqual([]);
  });

  it('challengeStates: выполненные, одно активное, остальные закрыты', () => {
    recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 6, lengthMax: 11 }, score: 60 });
    const states = challengeStates(SLUG, DEFS);
    expect(states.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(states.map((s) => s.active)).toEqual([false, false, true, false]);
  });
});

describe('вехи', () => {
  const MILES = buildMilestones([
    ['len10', 'lengthMax', 10, 10],
    ['len20', 'lengthMax', 20, 15],
    ['len30', 'lengthMax', 30, 20],
  ]);

  it('достигнутость считается по личным рекордам', () => {
    recordBests(SLUG, { lengthMax: 22 });
    const states = milestoneStates(SLUG, MILES);
    expect(states.map((m) => m.achieved)).toEqual([true, true, false]);
    expect(nextMilestone(states)?.id).toBe('len30');
  });

  it('grantArcadeBonuses платит за испытания, вехи и не платит дважды', () => {
    const missionsBefore = dailyMissions();
    const res = recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 6, lengthMax: 11 }, score: 60 });
    const bonus = grantArcadeBonuses({
      slug: SLUG, closed: res.closed,
      milestones: milestoneStates(SLUG, MILES), missionsBefore,
    });
    // Испытания 1 и 2 по тарифу уровня + веха len10.
    const expected = TARIFF.level(1) + TARIFF.level(2) + 10;
    expect(bonus.total).toBeGreaterThanOrEqual(expected);
    expect(bonus.granted.map((g) => g.key)).toContain('milestone-snake-len10');

    const repeat = grantArcadeBonuses({
      slug: SLUG, closed: res.closed,
      milestones: milestoneStates(SLUG, MILES), missionsBefore: dailyMissions(),
    });
    expect(repeat.total).toBe(0);
    expect(bonusBalance()).toBe(bonus.balance);
  });
});
