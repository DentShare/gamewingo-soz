import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoApi, rewardPoints, currentStreak } from './demo';

beforeEach(() => localStorage.clear());

describe('rewardPoints', () => {
  it('база 50 + бонус за стрик, потолок бонуса', () => {
    expect(rewardPoints(1)).toBe(50);
    expect(rewardPoints(2)).toBe(60);
    expect(rewardPoints(8)).toBe(120);
    expect(rewardPoints(50)).toBe(120); // бонус ограничен
  });
});

describe('demo api submitScore', () => {
  it('не решено → 0 баллов', async () => {
    const api = createDemoApi();
    const r = await api.submitScore({ sessionId: 's', gameId: 'soz', score: 0, durationMs: 1000, meta: { solved: false, dayId: 100 } });
    expect(r.pointsAwarded).toBe(0);
  });
  it('решено → баллы, стрик растёт по подряд идущим дням', async () => {
    const api = createDemoApi();
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 8000, durationMs: 1000, meta: { solved: true, dayId: 100 } });
    expect(currentStreak()).toBe(1);
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 8000, durationMs: 1000, meta: { solved: true, dayId: 101 } });
    expect(currentStreak()).toBe(2);
    // пропуск дня → сброс
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 8000, durationMs: 1000, meta: { solved: true, dayId: 105 } });
    expect(currentStreak()).toBe(1);
  });
  it('повтор того же дня не увеличивает стрик', async () => {
    const api = createDemoApi();
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 8000, durationMs: 1000, meta: { solved: true, dayId: 100 } });
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 8000, durationMs: 1000, meta: { solved: true, dayId: 100 } });
    expect(currentStreak()).toBe(1);
  });
});

describe('demo api leaderboard', () => {
  it('включает игрока и сортирует по score', async () => {
    const api = createDemoApi();
    await api.submitScore({ sessionId: 's', gameId: 'soz', score: 9000, durationMs: 0, meta: { solved: true, dayId: 100 } });
    const top = await api.leaderboard('soz', 10);
    expect(top[0].isCurrentUser).toBe(true); // 9000 — топ
    expect(top.every((e, i) => i === 0 || top[i - 1].score >= e.score)).toBe(true);
  });
});
