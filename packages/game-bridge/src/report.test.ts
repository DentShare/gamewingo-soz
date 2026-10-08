import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, AwardResult } from './api.js';
import type { GameBridge } from './bridge.js';
import type { GameResult } from './events.js';
import { reportResult } from './report.js';

let seq = 0;
/** Своя сессия хоста на каждый тест: счётчик партий у каждой начинается с 1. */
function result(sessionId = `host-${++seq}`): GameResult {
  return {
    game: 'pairs', mode: 'level', level: 3, won: true, score: 420,
    durationMs: 61_000, sessionId, metrics: { moves: 14 },
  };
}

function fakeBridge() {
  return { sendResult: vi.fn(), error: vi.fn() } as unknown as GameBridge & {
    sendResult: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>;
  };
}

function fakeApi(submitResult: (r: GameResult) => Promise<AwardResult>): ApiClient {
  return { submitResult } as unknown as ApiClient;
}

const award = (over: Partial<AwardResult> = {}): AwardResult =>
  ({ xp: 120, stars: 2, unlockedAchievements: [], balance: 500, ...over });

describe('reportResult', () => {
  it('шлёт GAME_RESULT хосту и результат на сервер, ответ — в форме сцен', async () => {
    const bridge = fakeBridge();
    const submit = vi.fn(async () => award());
    const res = await reportResult(bridge, fakeApi(submit), result('host-a'));

    const sent = { ...result('host-a'), sessionId: 'host-a:1' };
    expect(bridge.sendResult).toHaveBeenCalledWith(sent);
    expect(submit).toHaveBeenCalledWith(sent);
    expect(res).toEqual({ accepted: true, pointsAwarded: 120 });
  });

  it('у каждой партии свой ID внутри сессии хоста — лимит времени на партию, а не на сессию', async () => {
    const submit = vi.fn(async () => award());
    const api = fakeApi(submit);
    await reportResult(fakeBridge(), api, result('host-b'));
    await reportResult(fakeBridge(), api, result('host-b'));
    await reportResult(fakeBridge(), api, result('host-c'));
    expect(submit.mock.calls.map(([r]) => r.sessionId)).toEqual(['host-b:1', 'host-b:2', 'host-c:1']);
  });

  it('партия, отклонённая антифродом, — accepted: false', async () => {
    const res = await reportResult(fakeBridge(), fakeApi(async () => award({ xp: 0, rejected: true })), result());
    expect(res).toEqual({ accepted: false, pointsAwarded: 0 });
  });

  it('без API (до INIT) — только GAME_RESULT хосту', async () => {
    const bridge = fakeBridge();
    expect(await reportResult(bridge, null, result())).toBeNull();
    expect(bridge.sendResult).toHaveBeenCalledOnce();
  });

  it('ошибка сервера уходит хосту GAME_ERROR, партия не падает', async () => {
    const bridge = fakeBridge();
    const res = await reportResult(bridge, fakeApi(async () => { throw new Error('API → 503'); }), result());
    expect(res).toBeNull();
    expect(bridge.error).toHaveBeenCalledWith('Error: API → 503');
  });
});
