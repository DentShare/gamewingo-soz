/** Аккумулирует активное время партии, исключая паузы. `now` — источник времени (мс). */
export function createRoundTimer(now: () => number) {
  let startedAt: number | null = null;
  let acc = 0; // накоплено до текущего активного отрезка
  let running = false;
  return {
    start() { startedAt = now(); acc = 0; running = true; },
    pause() { if (running && startedAt !== null) { acc += now() - startedAt; running = false; } },
    resume() { if (!running) { startedAt = now(); running = true; } },
    elapsedMs() { return acc + (running && startedAt !== null ? now() - startedAt : 0); },
  };
}

export type RoundTimer = ReturnType<typeof createRoundTimer>;
