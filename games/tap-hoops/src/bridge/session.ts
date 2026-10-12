import { createBridge, type AppToGameEvent } from '@gamewingo/game-bridge';
import type { Court } from '../core/court';
import type { Locale } from '../i18n';
/** Facts only; no API, wallet, reward request or simulated server acceptance. */
export function createSession(locale: Locale) {
  const bridge = createBridge();
  let sessionId = 'tap-hoops-prototype', hosted = false, started = false, finished = false;
  return { bridge, locale,
    get hosted() { return hosted; },
    applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>) {
      sessionId = e.sessionId; hosted = true; this.locale = e.locale === 'uz' ? 'uz' : 'ru';
    },
    start() { started = true; finished = false; bridge.start(sessionId); },
    finish(s: Court) {
      if (!started || finished || s.training || !s.ended) return;
      finished = true; bridge.gameOver(s.score, sessionId, Math.round(s.elapsedMs));
      bridge.track('tap_hoops_prototype_finished', { baskets: s.baskets, cleanBaskets: s.cleanBaskets,
        bestCleanStreak: s.bestCleanStreak, taps: s.taps, resets: s.resets, seed: s.seed });
    },
    exit() { bridge.exit(sessionId); }, destroy() { bridge.destroy(); },
  };
}
export type Session = ReturnType<typeof createSession>;
