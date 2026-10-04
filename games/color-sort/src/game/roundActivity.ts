import { createRoundTimer } from './roundTimer';
export type PauseReason = 'sheet' | 'host' | 'hidden';
/** Независимые причины паузы: RESUME хоста не закрывает паузу пользователя. */
export function createRoundActivity(now: () => number) {
  const timer = createRoundTimer(now);
  const reasons = new Set<PauseReason>();
  let started = false;
  let ended = false;
  return {
    begin() { if (!started) { started = true; timer.start(); if (reasons.size) timer.pause(); } },
    pause(reason: PauseReason) { reasons.add(reason); timer.pause(); },
    resume(reason: PauseReason) { reasons.delete(reason); if (started && !ended && !reasons.size) timer.resume(); },
    complete() { ended = true; timer.pause(); },
    get started() { return started; },
    get paused() { return reasons.size > 0; },
    has(reason: PauseReason) { return reasons.has(reason); },
    elapsedMs: timer.elapsedMs,
  };
}
export type RoundActivity = ReturnType<typeof createRoundActivity>;
