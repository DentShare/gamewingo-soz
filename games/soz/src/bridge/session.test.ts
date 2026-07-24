import { describe, it, expect, vi } from 'vitest';
import { createSession } from './session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

function fakeBridge() {
  let handler: ((e: AppToGameEvent) => void) | null = null;
  return {
    ready: vi.fn(), start: vi.fn(), gameOver: vi.fn(), claimReward: vi.fn(),
    track: vi.fn(), error: vi.fn(),
    onApp: vi.fn((h: (e: AppToGameEvent) => void) => { handler = h; return () => { handler = null; }; }),
    destroy: vi.fn(),
    emit(e: AppToGameEvent) { handler?.(e); },
  };
}

const INIT = {
  type: 'INIT' as const, authToken: 't', apiBaseUrl: 'x', locale: 'ru' as const, sessionId: 'sess',
};

describe('session', () => {
  it('daily: gameOver + submitScore вызываются', async () => {
    const b = fakeBridge();
    const api = { submitScore: vi.fn(async () => ({ accepted: true, pointsAwarded: 50 })), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit(INIT);
    s.start();
    await s.finish({ mode: 'daily', dayId: 1, guessesUsed: 2, solved: true, durationMs: 5000, rows: [] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitScore).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'soz', sessionId: 'sess' }));
  });

  it('practice: gameOver есть, submitScore НЕ вызывается', async () => {
    const b = fakeBridge();
    const api = { submitScore: vi.fn(), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit(INIT);
    s.start();
    await s.finish({ mode: 'practice', dayId: 1, guessesUsed: 3, solved: true, durationMs: 5000, rows: [] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitScore).not.toHaveBeenCalled();
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
