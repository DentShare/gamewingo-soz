import { createBridge, type AppToGameEvent } from '@gamewingo/game-bridge';
import type { Arena } from '../core/arena';
import type { Locale } from '../i18n';

/** Prototype: bridge facts only, deliberately no score API, rewards or fake acceptance. */
export function createSession(locale: Locale) {
  const bridge = createBridge();
  let sessionId = 'tanks-prototype';
  let started = false;
  let finished = false;
  let hosted = false;
  return {
    bridge, locale,
    get hosted() { return hosted; },
    applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>) {
      sessionId = e.sessionId; hosted = true;
      this.locale = e.locale === 'uz' ? 'uz' : 'ru';
    },
    start() { started = true; finished = false; bridge.start(sessionId); },
    finish(s: Arena) {
      if (!started || finished || s.training || !s.ended) return;
      finished = true;
      bridge.gameOver(s.score, sessionId, Math.round(s.elapsedMs));
      bridge.track('tanks_prototype_finished', {
        kills: s.kills, waves: s.waves, damageTaken: s.damageTaken,
        coreHp: s.core.hp, reason: s.ended, seed: s.seed,
      });
    },
    exit() { bridge.exit(sessionId); },
    destroy() { bridge.destroy(); },
  };
}
export type Session = ReturnType<typeof createSession>;
