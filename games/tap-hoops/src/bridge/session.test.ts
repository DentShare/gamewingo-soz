import { afterEach, expect, it, vi } from 'vitest';
import { createCourt } from '../core/court';
import { createSession } from './session';
afterEach(() => vi.restoreAllMocks());
it('sends one result and no score/reward API calls', () => {
  const session = createSession('ru'), post = vi.spyOn(window.parent, 'postMessage'), fetch = vi.spyOn(globalThis, 'fetch');
  const s = createCourt(); s.ended = 'time'; s.score = 150; s.elapsedMs = 1200;
  session.finish(s); expect(post).not.toHaveBeenCalled();
  session.start(); session.finish(s); session.finish(s);
  expect(post.mock.calls.map(c => c[0].type)).toEqual(['GAME_START', 'GAME_OVER', 'GAME_EVENT']);
  expect(post.mock.calls[1][0]).toMatchObject({ score: 150, durationMs: 1200 });
  expect(fetch).not.toHaveBeenCalled(); session.destroy();
});
it('honors the host locale/session but never submits a training result', () => {
  const session = createSession('ru'), post = vi.spyOn(window.parent, 'postMessage');
  session.applyInit({ type: 'INIT', locale: 'uz', sessionId: 'host', authToken: 'unused', apiBaseUrl: 'unused' });
  expect(session.locale).toBe('uz'); expect(session.hosted).toBe(true);
  session.start(); const s = createCourt(1, true); s.ended = 'time'; session.finish(s);
  expect(post).toHaveBeenCalledTimes(1); session.destroy();
});
