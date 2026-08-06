import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridge } from './bridge.js';
import type { GameToAppEvent } from './events.js';

/**
 * В jsdom нет нативных мостов iOS/Android, поэтому post() уходит в web-фолбэк —
 * window.parent.postMessage. Его и перехватываем.
 */
describe('createBridge: событийный слой', () => {
  let sent: GameToAppEvent[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    spy = vi.spyOn(window.parent, 'postMessage').mockImplementation((msg: unknown) => {
      sent.push(msg as GameToAppEvent);
    });
  });

  afterEach(() => {
    spy.mockRestore();
    vi.useRealTimers();
  });

  const ev = (name: string) => ({ game: 'pairs' as const, name, sessionId: 's1' });

  it('батчит события: один пакет вместо трёх сообщений', () => {
    const bridge = createBridge();
    bridge.sendEvent(ev('pair_found'));
    bridge.sendEvent(ev('pair_found'));
    bridge.sendEvent(ev('flawless'));
    expect(sent).toHaveLength(0);

    vi.runAllTimers();
    expect(sent).toHaveLength(1);
    const batch = sent[0];
    if (batch.type !== 'GAME_EVENTS') throw new Error('ожидался GAME_EVENTS');
    expect(batch.events.map((e) => e.name)).toEqual(['pair_found', 'pair_found', 'flawless']);
    expect(batch.events.every((e) => typeof e.clientTs === 'number')).toBe(true);
    bridge.destroy();
  });

  it('sendResult выталкивает очередь перед результатом', () => {
    const bridge = createBridge();
    bridge.sendEvent(ev('pair_found'));
    bridge.sendResult({
      game: 'pairs', mode: 'level', level: 3, score: 420,
      durationMs: 61_000, sessionId: 's1', won: true, metrics: { moves: 14 },
    });

    expect(sent.map((m) => m.type)).toEqual(['GAME_EVENTS', 'GAME_RESULT']);
    const result = sent[1];
    if (result.type !== 'GAME_RESULT') throw new Error('ожидался GAME_RESULT');
    expect(result.result.metrics).toEqual({ moves: 14 });
    // Очередь пуста — таймер ничего не дошлёт.
    vi.runAllTimers();
    expect(sent).toHaveLength(2);
    bridge.destroy();
  });

  it('destroy не теряет недосланные события', () => {
    const bridge = createBridge();
    bridge.sendEvent(ev('pair_found'));
    bridge.destroy();
    expect(sent.map((m) => m.type)).toEqual(['GAME_EVENTS']);
  });

  it('пустая очередь не порождает пустых пакетов', () => {
    const bridge = createBridge();
    bridge.flushEvents();
    vi.runAllTimers();
    expect(sent).toHaveLength(0);
    bridge.destroy();
  });
});
