import { beforeEach, expect, it } from 'vitest';
import { recordPilotRound } from './progress';
import { CHALLENGES } from './challenges';
beforeEach(() => localStorage.clear());
it('records practice challenges without bonus or daily-mission writes', () => {
  localStorage.setItem('wingo:bonus', '{"balance":123}');
  const result = recordPilotRound({ slug: 'tap-hoops', defs: CHALLENGES,
    metrics: { baskets: 120, cleanBaskets: 120, bestCleanStreak: 120 }, score: 18_000 });
  expect(result.closed).toHaveLength(15);
  expect(Object.keys(localStorage).sort()).toEqual(['tap-hoops:ladder', 'wingo:best:tap-hoops', 'wingo:bonus']);
  expect(localStorage.getItem('wingo:bonus')).toBe('{"balance":123}');
});
