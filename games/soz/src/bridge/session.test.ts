import { describe, it, expect, vi } from 'vitest';
import { createSession } from './session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

function fakeBridge() {
  let handler: ((e: AppToGameEvent) => void) | null = null;
  return {
    ready: vi.fn(), start: vi.fn(), gameOver: vi.fn(), claimReward: vi.fn(),
    track: vi.fn(), error: vi.fn(), sendResult: vi.fn(),
    onApp: vi.fn((h: (e: AppToGameEvent) => void) => { handler = h; return () => { handler = null; }; }),
    destroy: vi.fn(),
    emit(e: AppToGameEvent) { handler?.(e); },
  };
}

const INIT = {
  type: 'INIT' as const, authToken: 't', apiBaseUrl: 'x', locale: 'ru' as const, sessionId: 'sess',
};

describe('session', () => {
  const award = { xp: 50, stars: 3, unlockedAchievements: [], balance: 50 };

  it('daily: gameOver хосту, итог слова дня — на сервер', async () => {
    const b = fakeBridge();
    const api = { submitResult: vi.fn(async () => award), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit(INIT);
    s.start();
    const res = await s.finish({ mode: 'daily', dayId: 1, level: 1, guessesUsed: 2, solved: true, durationMs: 5000, rows: [] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitResult).toHaveBeenCalledWith(expect.objectContaining({
      game: 'soz', mode: 'daily', level: undefined, won: true, sessionId: expect.stringMatching(/^sess:\d+$/),
      metrics: expect.objectContaining({ guessesUsed: 2, wordsGuessed: 1 }),
    }));
    expect(res).toEqual({ accepted: true, pointsAwarded: 50 });
  });

  it('practice: ступень лестницы — на сервер с номером уровня и исходом', async () => {
    const b = fakeBridge();
    const api = { submitResult: vi.fn(async () => award), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit(INIT);
    s.start();
    await s.finish({ mode: 'practice', dayId: 1, level: 4, guessesUsed: 6, solved: false, durationMs: 5000, rows: [] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitResult).toHaveBeenCalledWith(expect.objectContaining({
      game: 'soz', mode: 'level', level: 4, won: false,
      metrics: expect.objectContaining({ wordsGuessed: 0 }),
    }));
  });

  it('leaderboard проксирует в api', async () => {
    const b = fakeBridge();
    const api = { submitScore: vi.fn(), leaderboard: vi.fn(async () => [{ rank: 1, name: 'A', score: 9000, isCurrentUser: true }]) };
    const s = createSession(b as any, () => api as any);
    s.applyInit(INIT);
    const top = await s.leaderboard(5);
    expect(api.leaderboard).toHaveBeenCalledWith('soz', 5);
    expect(top).toHaveLength(1);
  });

  it('onReward вызывается при REWARD_RESULT', () => {
    const b = fakeBridge();
    const s = createSession(b as any, () => ({} as any));
    const cb = vi.fn();
    s.onReward(cb);
    b.emit({ type: 'REWARD_RESULT', rewardId: 'r1', granted: true, points: 42 });
    expect(cb).toHaveBeenCalledWith({ rewardId: 'r1', granted: true, points: 42 });
  });
});
