import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArena } from '../core/arena';
import { createSession } from './session';

afterEach(() => vi.restoreAllMocks());
describe('prototype bridge', () => {
  it('sends facts exactly once, never submits a reward request or score API call', () => {
    const session = createSession('ru'), post = vi.spyOn(window.parent, 'postMessage');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const s = createArena(); s.ended = 'core'; s.score = 100; s.elapsedMs = 1000;
    session.finish(s); expect(post).not.toHaveBeenCalled();
    session.start(); session.finish(s); session.finish(s);
    expect(post.mock.calls.map(c => c[0].type)).toEqual(['GAME_START', 'GAME_OVER', 'GAME_EVENT']);
    expect(post.mock.calls[1][0]).toMatchObject({ score: 100, durationMs: 1000 });
    expect(fetch).not.toHaveBeenCalled();
    session.destroy();
  });
  it('accepts host language/session but ignores a training result', () => {
    const session = createSession('ru'), post = vi.spyOn(window.parent, 'postMessage');
    session.applyInit({ type: 'INIT', locale: 'uz', sessionId: 'host-test', authToken: 'unused', apiBaseUrl: 'unused' });
    expect(session.hosted).toBe(true); expect(session.locale).toBe('uz');
    session.start(); const s = createArena(1, true); s.ended = 'armor'; session.finish(s);
    expect(post).toHaveBeenCalledTimes(1); session.destroy();
  });
});
