import { beforeEach, describe, expect, it } from 'vitest';
import { buildChallenges, recordArcadeRound } from './challenges.js';
import { recordBests } from './records.js';
import { dailyMissions, recordRound } from './missions.js';
import { bonusBalance, TARIFF } from './bonus.js';
import { bonusBreakdown, challengeOutlook } from './results.js';
import { settleArcadeRound, settleLadderRound } from './index.js';
import { computeWeekId } from './day.js';

const DAY = 20000;
const SLUG = 'snake';
const DEFS = buildChallenges([
  ['eat5', 'eaten', 5],
  ['len10', 'lengthMax', 10],
  ['eat12', 'eaten', 12],
  ['len15', 'lengthMax', 15],
]);

beforeEach(() => localStorage.clear());

describe('bonusBreakdown', () => {
  it('раскладывает ключи кошелька по видам', () => {
    const lines = bonusBreakdown({
      granted: [
        { key: 'level-pairs-3', amount: 24 },
        { key: 'chapter-pairs-1', amount: 50 },
        { key: `lod-pairs-${DAY}`, amount: 10 },
        { key: 'record-week-2857', amount: 20 },
        { key: `soz-daily-${DAY}`, amount: 25 },
      ],
      missionsBefore: dailyMissions(DAY),
      dayId: DAY,
    });
    expect(lines.map((l) => [l.kind, l.n])).toEqual([
      ['level', 3], ['chapter', 1], ['levelOfDay', undefined], ['recordWeek', undefined], ['daily', undefined],
    ]);
  });

  it('у аркады ключ уровня — это испытание', () => {
    const [line] = bonusBreakdown({
      granted: [{ key: 'level-snake-4', amount: 26 }], missionsBefore: dailyMissions(DAY), arcade: true, dayId: DAY,
    });
    expect(line).toMatchObject({ kind: 'challenge', n: 4, amount: 26, granted: true });
  });

  it('задания: продвинутое — приглушённой строкой, нетронутое — не показывается', () => {
    const before = dailyMissions(DAY);
    recordRound({ slug: 'pairs', cleared: true, stars: 1, score: 1 }, DAY);
    const lines = bonusBreakdown({ granted: [], missionsBefore: before, dayId: DAY });
    const after = dailyMissions(DAY);
    const moved = after.filter((m, i) => m.progress > before[i].progress && !m.done).length;
    const missionLines = lines.filter((l) => l.kind === 'mission');
    expect(missionLines.length).toBe(moved);
    for (const l of missionLines) {
      expect(l.granted).toBe(false);
      expect(l.amount).toBe(TARIFF.mission);
      expect(l.mission!.progress).toBeLessThan(l.mission!.target);
    }
  });
});

describe('challengeOutlook', () => {
  it('«почти»: активное испытание на ≥ 60 % в этом забеге', () => {
    recordArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 5, lengthMax: 6 }, score: 50 });
    const o = challengeOutlook(SLUG, DEFS, { eaten: 5, lengthMax: 7 });
    expect(o.almost).toMatchObject({ value: 7, missing: 3 });
    expect(o.almost!.def.id).toBe('len10');
    expect(o.lastDone?.id).toBe('eat5');
    expect(o.next.map((p) => p.def.id)).toEqual(['eat12', 'len15']);
    expect(o.nextReward).toBe(TARIFF.level(3) + TARIFF.level(4));
  });

  it('меньше 60 % — не «почти», активное уходит в «следом»', () => {
    const o = challengeOutlook(SLUG, DEFS, { eaten: 2 });
    expect(o.almost).toBeNull();
    expect(o.lastDone).toBeNull();
    expect(o.next.map((p) => p.def.id)).toEqual(['eat5', 'len10']);
  });

  it('«следом» считает прогресс этого забега, а не лучший результат', () => {
    recordBests(SLUG, { lengthMax: 12 });
    const o = challengeOutlook(SLUG, DEFS, { eaten: 1, lengthMax: 3 });
    expect(o.next[1]).toMatchObject({ value: 3, missing: 7 });
  });
});

describe('settleArcadeRound', () => {
  it('испытания, рекорды и разбивка одним вызовом', () => {
    const res = settleArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 6, lengthMax: 11 }, score: 60, dayId: DAY });
    expect(res.round.closed.map((c) => c.id)).toEqual(['eat5', 'len10']);
    expect(res.lines.filter((l) => l.kind === 'challenge').map((l) => l.n)).toEqual([1, 2]);
    expect(res.bestsBefore).toEqual({});
    expect(res.bonus.balance).toBe(bonusBalance());
  });

  it('неделя рекордов — за побитый, а не первый рекорд очков', () => {
    const first = settleArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 1 }, score: 40, dayId: DAY });
    expect(first.bonus.granted.some((g) => g.key.startsWith('record-week-'))).toBe(false);
    const beat = settleArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 1 }, score: 90, dayId: DAY });
    expect(beat.bonus.granted).toContainEqual({ key: `record-week-${computeWeekId(DAY)}`, amount: TARIFF.recordWeek });
    expect(beat.lines.some((l) => l.kind === 'recordWeek')).toBe(true);
    const again = settleArcadeRound({ slug: SLUG, defs: DEFS, metrics: { eaten: 1 }, score: 120, dayId: DAY });
    expect(again.bonus.granted.some((g) => g.key.startsWith('record-week-'))).toBe(false);
  });
});

describe('settleLadderRound: разбивка', () => {
  it('первое прохождение уровня — строкой разбивки', () => {
    const { lines } = settleLadderRound({
      slug: 'pairs', n: 1, total: 15, mode: 'level', cleared: true, stars: 3, score: 100, dayId: DAY,
    });
    expect(lines[0]).toMatchObject({ kind: 'level', n: 1, amount: TARIFF.level(1), granted: true });
  });
});
