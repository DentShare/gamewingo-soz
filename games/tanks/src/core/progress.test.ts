import { beforeEach, expect, it } from 'vitest';
import { recordPilotRound } from './progress';
import { CHALLENGES } from './challenges';

beforeEach(() => localStorage.clear());
it('keeps pilot results out of daily missions and bonus storage', () => {
  localStorage.setItem('wingo:bonus', '{"balance":123}');
  const result = recordPilotRound({ slug: 'tanks', defs: CHALLENGES,
    metrics: { kills: 60, waves: 15, bestNoDamageStreak: 60 }, score: 6000 });
  expect(result.closed).toHaveLength(15);
  expect(localStorage.getItem('wingo:bonus')).toBe('{"balance":123}');
  expect(Object.keys(localStorage).sort()).toEqual(['tanks:ladder', 'wingo:best:tanks', 'wingo:bonus']);
});
